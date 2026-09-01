import { and, asc, count, eq, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import {
  audioAssets,
  presetImports,
  presetIslands,
  presetSentences,
  type PresetIsland,
  type PresetSentence,
} from '@/db/schema';

/**
 * Preset data access. Unlike `islands`, presets are not owned: a published
 * preset is visible to every user, so these queries carry no user_id predicate.
 * The exception is `presetImports`, which is per user and does.
 */

export interface PresetListItem extends PresetIsland {
  sentenceCount: number;
  /** Sentences with a shared recording — an import links these for free. */
  audioCount: number;
  /** Whether the signed-in user already imported this one. */
  imported: boolean;
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
  const rows = await db
    .select({
      preset: presetIslands,
      sentenceCount: count(presetSentences.id),
      audioCount: sql<number>`count(${presetSentences.id}) filter (where ${presetSentences.audioAssetId} is not null)`,
      importedAt: presetImports.importedAt,
    })
    .from(presetIslands)
    .leftJoin(
      presetSentences,
      eq(presetSentences.presetIslandId, presetIslands.id),
    )
    .leftJoin(
      presetImports,
      and(
        eq(presetImports.presetIslandId, presetIslands.id),
        eq(presetImports.userId, userId),
      ),
    )
    .where(includeUnpublished ? undefined : eq(presetIslands.published, true))
    .groupBy(presetIslands.id, presetImports.importedAt)
    .orderBy(asc(presetIslands.position), asc(presetIslands.createdAt));

  return rows.map((r) => ({
    ...r.preset,
    sentenceCount: Number(r.sentenceCount),
    audioCount: Number(r.audioCount),
    imported: r.importedAt !== null,
  }));
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

export async function hasImported(
  userId: string,
  presetId: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ userId: presetImports.userId })
    .from(presetImports)
    .where(
      and(
        eq(presetImports.userId, userId),
        eq(presetImports.presetIslandId, presetId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
