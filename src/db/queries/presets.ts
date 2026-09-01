import { and, asc, count, eq, isNull, or, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { findAudioByHash } from '@/db/queries/audio';
import {
  audioAssets,
  islands,
  presetIslands,
  presetSentences,
  type PresetIsland,
  type PresetSentence,
} from '@/db/schema';
import { audioHashFor } from '@/lib/audio/tts';

/**
 * Preset data access. Unlike `islands`, presets are not owned: a published
 * preset is visible to every user, so these queries carry no user_id predicate.
 * The exception is resolving whether a given user already has a topic, which
 * looks at their own islands.
 */

export interface PresetListItem extends PresetIsland {
  sentenceCount: number;
  /** Sentences with a shared recording — an import links these for free. */
  audioCount: number;
  /**
   * The user's own live island covering this topic, if any — so the row can
   * offer "Open" instead of adding a second copy.
   *
   * Derived from a live (non-archived) island rather than from `preset_imports`,
   * because the 12 curated islands loaded by `npm run db:seed` predate presets
   * and have no import row at all. Reading the import row alone showed every one
   * of them as not-added, which is how exact duplicates got created.
   */
  existingIslandId: string | null;
}

/**
 * The browse list. `includeUnpublished` is for the admin screen, which has to
 * see drafts; every user-facing caller leaves it false.
 */
export async function listPresets(
  userId: string,
  includeUnpublished = false,
): Promise<PresetListItem[]> {
  const db = getDb();

  // The user's live islands, matched to a preset either by the link (survives a
  // rename) or by name (catches legacy-seeded and hand-made islands).
  const mine = db
    .$with('mine')
    .as(
      db
        .select({
          id: islands.id,
          name: islands.name,
          presetId: islands.importedFromPresetId,
        })
        .from(islands)
        .where(and(eq(islands.userId, userId), isNull(islands.archivedAt))),
    );

  const rows = await db
    .with(mine)
    .select({
      preset: presetIslands,
      sentenceCount: count(presetSentences.id),
      audioCount: sql<number>`count(${presetSentences.audioAssetId})`,
      existingIslandId: sql<string | null>`min(${mine.id})`,
    })
    .from(presetIslands)
    .leftJoin(
      presetSentences,
      eq(presetSentences.presetIslandId, presetIslands.id),
    )
    .leftJoin(
      mine,
      or(
        eq(mine.presetId, presetIslands.id),
        sql`lower(${mine.name}) = lower(${presetIslands.name})`,
      ),
    )
    .where(includeUnpublished ? undefined : eq(presetIslands.published, true))
    .groupBy(presetIslands.id)
    .orderBy(asc(presetIslands.position), asc(presetIslands.createdAt));

  return rows.map((r) => ({
    ...r.preset,
    sentenceCount: Number(r.sentenceCount),
    audioCount: Number(r.audioCount),
    existingIslandId: r.existingIslandId,
  }));
}

/**
 * The one live island covering a preset for this user, if any — the single-row
 * form of what `listPresets` computes, for the preset detail page and the import
 * action.
 */
export async function existingIslandForPreset(
  userId: string,
  preset: { id: string; name: string },
): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ id: islands.id })
    .from(islands)
    .where(
      and(
        eq(islands.userId, userId),
        isNull(islands.archivedAt),
        or(
          eq(islands.importedFromPresetId, preset.id),
          sql`lower(${islands.name}) = lower(${preset.name})`,
        ),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function getPreset(
  presetId: string,
): Promise<PresetIsland | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(presetIslands)
    .where(eq(presetIslands.id, presetId))
    .limit(1);
  return rows[0];
}

export interface PresetSentenceWithAudio extends PresetSentence {
  audioUrl: string | null;
}

/** Preview rows, in order, with the sample audio the preview screen plays. */
export async function listPresetSentences(
  presetId: string,
): Promise<PresetSentenceWithAudio[]> {
  const db = getDb();
  const rows = await db
    .select({ sentence: presetSentences, url: audioAssets.url })
    .from(presetSentences)
    .leftJoin(audioAssets, eq(audioAssets.id, presetSentences.audioAssetId))
    .where(eq(presetSentences.presetIslandId, presetId))
    .orderBy(asc(presetSentences.position));

  return rows.map((r) => ({ ...r.sentence, audioUrl: r.url }));
}

export async function nextPresetPosition(): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ maxPosition: sql<number | null>`max(${presetIslands.position})` })
    .from(presetIslands);
  return (rows[0]?.maxPosition ?? -1) + 1;
}

/**
 * Points every preset sentence at the shared recording for its Romanian text,
 * where one exists — the step that makes an import free.
 *
 * Nothing is synthesized here. `audio_assets` is global and keyed by content
 * hash, so the recording a preset needs is usually already there: made by the
 * admin's own copy of the island, by `npm run audio:backfill` over the seeded
 * islands, or by another user who captured the same sentence. This only draws
 * the line between the two.
 *
 * Idempotent and safe to re-run: rows that already carry an asset are skipped,
 * and a sentence with no recording yet is simply left null for the next run.
 * Returns how many rows it linked and how many are still without audio.
 */
export async function linkPresetAudio(
  presetId: string,
): Promise<{ linked: number; missing: number }> {
  const db = getDb();
  const rows = await db
    .select({
      id: presetSentences.id,
      targetText: presetSentences.targetText,
    })
    .from(presetSentences)
    .where(
      and(
        eq(presetSentences.presetIslandId, presetId),
        isNull(presetSentences.audioAssetId),
      ),
    );

  let linked = 0;
  for (const row of rows) {
    const hash = audioHashFor(row.targetText, 'ro');
    const asset = await findAudioByHash(hash);
    if (!asset) continue;
    await db
      .update(presetSentences)
      .set({ audioAssetId: asset.id })
      .where(eq(presetSentences.id, row.id));
    linked++;
  }

  return { linked, missing: rows.length - linked };
}
