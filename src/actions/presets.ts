'use server';

import { createId } from '@paralleldrive/cuid2';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireAdmin, requireUser } from '@/auth';
import { getDb } from '@/db';
import { nextIslandPosition } from '@/db/queries/islands';
import {
  existingIslandForPreset,
  getPreset,
  linkPresetAudio,
  listPresetSentences,
} from '@/db/queries/presets';
import { createReviewStates } from '@/db/queries/review';
import {
  islands,
  presetImports,
  presetIslands,
  sentences,
} from '@/db/schema';
import { startAudio } from '@/lib/audio/queue';
import { translationHash } from '@/lib/hash';
import { getTranslationProvider } from '@/lib/translate';

import { done, failed, type ActionResult } from './result';

/**
 * Preset import and the admin's publish/delete.
 *
 * An import costs nothing and consumes no quota: the Romanian is already
 * translated and the recordings are shared, so the cloned rows link the very
 * same `audio_assets` ids the preset points at (Implementation Plan section
 * 4.4). Only a preset sentence with no recording yet falls through to TTS.
 */

const presetIdSchema = z.object({ presetId: z.string().min(1) });

export async function importPresetIsland(
  input: unknown,
): Promise<ActionResult<{ islandId: string; sentenceCount: number }>> {
  const parsed = presetIdSchema.safeParse(input);
  if (!parsed.success) return failed('Preset not found.');

  const user = await requireUser();
  const preset = await getPreset(parsed.data.presetId);
  if (!preset || !preset.published) return failed('Preset not found.');

  // Guarded on a LIVE island rather than on the import row: the 12 curated
  // islands from `npm run db:seed` predate presets and have no import row, so
  // checking the row alone is what let exact duplicates be created. An archived
  // island does not count — archiving is how you make a topic addable again.
  if (await existingIslandForPreset(user.id, preset)) {
    return failed(
      `You already have "${preset.name}". Open it from Topics instead of adding a second copy.`,
    );
  }

  const rows = await listPresetSentences(preset.id);
  if (rows.length === 0) return failed('That preset has no sentences yet.');

  const db = getDb();
  const provider = getTranslationProvider().name;
  const islandId = createId();

  const cloned = rows.map((row, i) => ({
    id: createId(),
    islandId,
    userId: user.id,
    sourceText: row.sourceText,
    targetText: row.targetText,
    sourceLang: preset.sourceLang,
    targetLang: preset.targetLang,
    translationNote: row.translationNote,
    // The shared recording, reused rather than re-synthesized. A row whose
    // preset sentence has none stays 'translated' and `startAudio` picks it up.
    targetAudioId: row.audioAssetId,
    status: (row.audioAssetId ? 'ready' : 'translated') as 'ready' | 'translated',
    contentHash: translationHash(
      row.sourceText,
      preset.sourceLang,
      preset.targetLang,
      provider,
    ),
    origin: 'preset_import',
    presetSentenceId: row.id,
    position: i,
  }));

  await db.insert(islands).values({
    id: islandId,
    userId: user.id,
    name: preset.name,
    emoji: preset.emoji ?? '🏝️',
    description: preset.description,
    sourceLang: preset.sourceLang,
    targetLang: preset.targetLang,
    origin: 'preset_import',
    importedFromPresetId: preset.id,
    position: await nextIslandPosition(user.id),
  });

  await db.insert(sentences).values(cloned);
  await createReviewStates(
    user.id,
    cloned.map((c) => c.id),
    new Date(),
  );
  // Upsert, not insert: the composite primary key means a user who archived an
  // earlier import and is adding the topic again would otherwise collide with
  // their own historical row.
  await db
    .insert(presetImports)
    .values({ userId: user.id, presetIslandId: preset.id, islandId })
    .onConflictDoUpdate({
      target: [presetImports.userId, presetImports.presetIslandId],
      set: { islandId, importedAt: new Date() },
    });

  // Only the rows that arrived without a recording; the rest already say 'ready'
  // and `sentencesAwaitingAudio` filters them out anyway.
  await startAudio(cloned.filter((c) => !c.targetAudioId).map((c) => c.id));

  revalidatePath('/islands');
  revalidatePath('/presets');
  return { ok: true, data: { islandId, sentenceCount: cloned.length } };
}

/** Admin: flip a preset between draft and published. */
export async function setPresetPublished(
  input: unknown,
): Promise<ActionResult> {
  const parsed = presetIdSchema
    .extend({ published: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return failed('Preset not found.');

  await requireAdmin();
  const db = getDb();
  const updated = await db
    .update(presetIslands)
    .set({ published: parsed.data.published, updatedAt: new Date() })
    .where(eq(presetIslands.id, parsed.data.presetId))
    .returning({ id: presetIslands.id });

  if (updated.length === 0) return failed('Preset not found.');

  revalidatePath('/admin/presets');
  revalidatePath('/presets');
  return done;
}

/**
 * Admin: re-run audio linking for a preset.
 *
 * Useful on its own because the recordings can appear after the preset does —
 * `npm run audio:backfill` finishing, or another user capturing the same
 * sentence. Nothing is synthesized and nothing is charged.
 */
export async function relinkPresetAudio(
  input: unknown,
): Promise<ActionResult<{ linked: number; missing: number }>> {
  const parsed = presetIdSchema.safeParse(input);
  if (!parsed.success) return failed('Preset not found.');

  await requireAdmin();
  const preset = await getPreset(parsed.data.presetId);
  if (!preset) return failed('Preset not found.');

  const result = await linkPresetAudio(preset.id);
  revalidatePath('/admin/presets');
  return { ok: true, data: result };
}

/**
 * Admin: delete a preset.
 *
 * `preset_sentences` and `preset_imports` cascade, but islands users already
 * imported are untouched — their sentences are their own rows pointing at
 * shared `audio_assets`, and deleting a preset must never take content out of
 * someone's account.
 */
export async function deletePreset(input: unknown): Promise<ActionResult> {
  const parsed = presetIdSchema.safeParse(input);
  if (!parsed.success) return failed('Preset not found.');

  await requireAdmin();
  const db = getDb();
  const deleted = await db
    .delete(presetIslands)
    .where(eq(presetIslands.id, parsed.data.presetId))
    .returning({ id: presetIslands.id });

  if (deleted.length === 0) return failed('Preset not found.');

  revalidatePath('/admin/presets');
  revalidatePath('/presets');
  return done;
}
