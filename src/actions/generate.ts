'use server';

import { createId } from '@paralleldrive/cuid2';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireAdmin, requireUser, type SessionUser } from '@/auth';
import { getDb } from '@/db';
import { nextIslandPosition } from '@/db/queries/islands';
import { nextPresetPosition } from '@/db/queries/presets';
import { createReviewStates } from '@/db/queries/review';
import { cacheTranslations } from '@/db/queries/sentences';
import { monthlyUsage, recordIslandGenerationUsage } from '@/db/queries/usage';
import {
  islands,
  presetIslands,
  presetSentences,
  sentences,
} from '@/db/schema';
import { generateIsland, type GeneratedIsland } from '@/lib/ai/island';
import { startAudio } from '@/lib/audio/queue';
import { translationHash } from '@/lib/hash';
import { checkIslandQuota, limitsFor, yearMonth } from '@/lib/quota';
import { getTranslationProvider } from '@/lib/translate';

import { failed, type ActionResult } from './result';

/** Generation is English-to-Romanian only; the prompt is written for that pair. */
const SOURCE_LANG = 'en';
const TARGET_LANG = 'ro';

/**
 * Island generation — topic plus an optional hint becomes 20 EN→RO sentences.
 *
 * Two entry points over one generator: a user generates a private island in
 * their own account, an admin generates a published preset everyone can import.
 * Both then fall into the existing pipeline unchanged — the sentences arrive
 * with Romanian already attached, so translation is skipped and only TTS runs
 * behind `enqueue`.
 *
 * A generated island is a scaffold, not the point. The method works because the
 * sentences are the learner's own, so the UI that calls this frames it as
 * "start a topic, then add your own" and every copy here says the same.
 */

const inputSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(2, 'Give the island a topic.')
    .max(80, 'Keep the topic under 80 characters.'),
  hint: z
    .string()
    .trim()
    .max(300, 'Keep the hint under 300 characters.')
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
});

/**
 * Generates a private island in the caller's account.
 *
 * Order matters: the quota is checked BEFORE the model is called, like the
 * sentence quota, so a user at their cap never spends a request. The counter is
 * bumped only after the model has returned, so a failed generation is free.
 */
export async function generateUserIsland(
  input: unknown,
): Promise<ActionResult<{ islandId: string; sentenceCount: number }>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return failed(parsed.error.issues[0].message);

  const user = await requireUser();
  const period = yearMonth(new Date(), user.timezone);
  const quota = await checkQuota(user, period);
  if (!quota.allowed) return failed(quota.message);

  let generated: GeneratedIsland;
  try {
    generated = await generateIsland(parsed.data);
  } catch (error) {
    return failed(generationMessage(error));
  }

  const db = getDb();
  const provider = getTranslationProvider().name;
  const islandId = createId();

  const rows = generated.sentences.map((s, i) => ({
    id: createId(),
    islandId,
    userId: user.id,
    sourceText: s.en,
    targetText: s.ro,
    sourceLang: SOURCE_LANG,
    targetLang: TARGET_LANG,
    translationNote: s.note,
    // Romanian is already here, so the row skips 'translating' entirely and
    // goes straight into the TTS half of the pipeline.
    status: 'translated' as const,
    contentHash: translationHash(s.en, SOURCE_LANG, TARGET_LANG, provider),
    origin: 'generated',
    position: i,
  }));

  await db.insert(islands).values({
    id: islandId,
    userId: user.id,
    name: generated.name,
    emoji: generated.emoji ?? '🏝️',
    description: generated.description,
    sourceLang: SOURCE_LANG,
    targetLang: TARGET_LANG,
    origin: 'generated',
    position: await nextIslandPosition(user.id),
  });

  await db.insert(sentences).values(rows);

  // Every sentence gets its FSRS card up front, in state New — the same
  // invariant capture maintains.
  await createReviewStates(
    user.id,
    rows.map((r) => r.id),
    new Date(),
  );

  // Warm the global cache: if this user (or any other) later captures the same
  // English sentence by hand, it costs no translation call.
  await warmCache(rows, generated);

  await recordIslandGenerationUsage({
    userId: user.id,
    yearMonth: period,
    provider: generated.provider,
    model: generated.model,
    inputTokens: generated.usage.inputTokens,
    outputTokens: generated.usage.outputTokens,
    cacheReadTokens: generated.usage.cacheReadTokens,
    costMicros: generated.costMicros,
    refId: islandId,
  });

  await startAudio(rows.map((r) => r.id));

  revalidatePath('/islands');
  revalidatePath(`/islands/${islandId}`);
  return {
    ok: true,
    data: { islandId, sentenceCount: rows.length },
  };
}

/**
 * Generates a preset island, published and importable by everyone.
 *
 * Admin-only, and admins are quota-exempt (`limitsFor` returns null for them),
 * so no counter is checked here — but the generation is still recorded in
 * `usage_events` so preset content has the same audit trail as user content.
 *
 * The preset's own TTS runs against a throwaway holder island in the admin's
 * account: `audio_assets` is global and keyed by content hash, so the
 * recordings the holder produces are exactly the ones importers will link to.
 */
export async function generatePresetIsland(
  input: unknown,
): Promise<ActionResult<{ presetId: string; sentenceCount: number }>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return failed(parsed.error.issues[0].message);

  const admin = await requireAdmin();

  let generated: GeneratedIsland;
  try {
    generated = await generateIsland(parsed.data);
  } catch (error) {
    return failed(generationMessage(error));
  }

  const db = getDb();
  const provider = getTranslationProvider().name;
  const presetId = createId();

  await db.insert(presetIslands).values({
    id: presetId,
    name: generated.name,
    emoji: generated.emoji ?? '🏝️',
    description: generated.description,
    level: generated.level,
    // Published straight away: an admin generating a preset means to ship it,
    // and `deletePreset` is the undo.
    published: true,
    origin: 'generated',
    promptVersion: generated.promptVersion,
    createdBy: admin.id,
    position: await nextPresetPosition(),
  });

  await db.insert(presetSentences).values(
    generated.sentences.map((s, i) => ({
      presetIslandId: presetId,
      sourceText: s.en,
      targetText: s.ro,
      translationNote: s.note,
      lemmas: s.lemmas,
      position: i,
    })),
  );

  await recordIslandGenerationUsage({
    userId: admin.id,
    yearMonth: yearMonth(new Date(), admin.timezone),
    provider: generated.provider,
    model: generated.model,
    inputTokens: generated.usage.inputTokens,
    outputTokens: generated.usage.outputTokens,
    cacheReadTokens: generated.usage.cacheReadTokens,
    costMicros: generated.costMicros,
    refId: presetId,
  });

  const islandId = createId();
  const rows = generated.sentences.map((s, i) => ({
    id: createId(),
    islandId,
    userId: admin.id,
    sourceText: s.en,
    targetText: s.ro,
    translationNote: s.note,
    status: 'translated' as const,
    contentHash: translationHash(s.en, SOURCE_LANG, TARGET_LANG, provider),
    origin: 'generated',
    position: i,
  }));

  await db.insert(islands).values({
    id: islandId,
    userId: admin.id,
    name: generated.name,
    emoji: generated.emoji ?? '🏝️',
    description: generated.description,
    origin: 'generated',
    importedFromPresetId: presetId,
    position: await nextIslandPosition(admin.id),
  });
  await db.insert(sentences).values(rows);
  await createReviewStates(
    admin.id,
    rows.map((r) => r.id),
    new Date(),
  );
  await warmCache(rows, generated);
  await startAudio(rows.map((r) => r.id));

  revalidatePath('/admin/presets');
  revalidatePath('/presets');
  return {
    ok: true,
    data: { presetId, sentenceCount: rows.length },
  };
}

// --- internals -------------------------------------------------------------

async function checkQuota(user: SessionUser, period: string) {
  const used = await monthlyUsage(user.id, period);
  const check = checkIslandQuota(
    limitsFor(user.tier, user.role),
    used?.islandsGenerated ?? 0,
  );
  return check.allowed
    ? { allowed: true as const, message: '' }
    : { allowed: false as const, message: check.message };
}

/** Model and network failures both land here; neither should leak a stack. */
function generationMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : 'Island generation failed';
  console.error('[generate] failed', message);
  return `Couldn't generate that island: ${message.slice(0, 200)}`;
}

function warmCache(
  rows: { contentHash: string; sourceText: string; targetText: string; translationNote: string | null }[],
  generated: GeneratedIsland,
) {
  const lemmasByEn = new Map(
    generated.sentences.map((s) => [s.en, s.lemmas]),
  );
  return cacheTranslations(
    rows.map((r) => ({
      contentHash: r.contentHash,
      targetText: r.targetText,
      translationNote: r.translationNote,
      lemmas: lemmasByEn.get(r.sourceText) ?? [],
    })),
  );
}
