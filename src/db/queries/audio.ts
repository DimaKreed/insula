import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';

import { getDb } from '@/db';
import { audioAssets, sentences, type AudioAsset } from '@/db/schema';

/**
 * Audio-asset data access. `audio_assets` is global — no user_id predicate,
 * because dedup across users is the point (Implementation Plan section 7.1).
 * Everything that touches a *sentence* still carries user_id.
 */

export async function findAudioByHash(
  contentHash: string,
): Promise<AudioAsset | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(audioAssets)
    .where(eq(audioAssets.contentHash, contentHash))
    .limit(1);
  return rows[0];
}

export type NewAudioAsset = typeof audioAssets.$inferInsert;

/**
 * Inserts an asset, or returns the one that already holds the hash. Two
 * concurrent syntheses of the same text both upload (identical bytes to an
 * identical key, so harmless) and exactly one row survives — the UNIQUE
 * constraint on content_hash is the backstop the plan calls for.
 */
export async function saveAudioAsset(
  values: NewAudioAsset,
): Promise<AudioAsset> {
  const db = getDb();
  const inserted = await db
    .insert(audioAssets)
    .values(values)
    .onConflictDoNothing({ target: audioAssets.contentHash })
    .returning();
  if (inserted[0]) return inserted[0];

  const existing = await findAudioByHash(values.contentHash);
  if (!existing) {
    throw new Error(`audio asset ${values.contentHash} vanished after insert`);
  }
  return existing;
}

/** Links Romanian audio to a sentence and marks it ready. */
export async function linkTargetAudio(sentenceId: string, audioId: string) {
  const db = getDb();
  await db
    .update(sentences)
    .set({
      targetAudioId: audioId,
      status: 'ready',
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(sentences.id, sentenceId));
}

/**
 * Links the English hint audio to a sentence. Unlike `linkTargetAudio` this
 * leaves `status` alone: the sentence is 'ready' on the strength of its
 * Romanian audio, and a hint is an extra that must never move the row's state.
 */
export async function linkPromptAudio(sentenceId: string, audioId: string) {
  const db = getDb();
  await db
    .update(sentences)
    .set({ promptAudioId: audioId, updatedAt: new Date() })
    .where(eq(sentences.id, sentenceId));
}

export async function markTtsQueued(sentenceIds: string[]) {
  if (sentenceIds.length === 0) return;
  const db = getDb();
  await db
    .update(sentences)
    .set({ status: 'tts_queued', errorMessage: null, updatedAt: new Date() })
    .where(inArray(sentences.id, sentenceIds));
}

export interface AwaitingAudio {
  id: string;
  userId: string;
  islandId: string;
  targetText: string;
  targetLang: string;
}

/**
 * Sentences that have Romanian text but no audio yet — the backfill script's
 * work list, and what makes re-running it idempotent: a linked sentence simply
 * stops matching.
 */
export async function sentencesAwaitingAudio(filter?: {
  userId?: string;
  islandId?: string;
  ids?: string[];
  limit?: number;
}): Promise<AwaitingAudio[]> {
  if (filter?.ids?.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({
      id: sentences.id,
      userId: sentences.userId,
      islandId: sentences.islandId,
      targetText: sentences.targetText,
      targetLang: sentences.targetLang,
    })
    .from(sentences)
    .where(
      and(
        isNotNull(sentences.targetText),
        isNull(sentences.targetAudioId),
        filter?.userId ? eq(sentences.userId, filter.userId) : undefined,
        filter?.islandId ? eq(sentences.islandId, filter.islandId) : undefined,
        filter?.ids ? inArray(sentences.id, filter.ids) : undefined,
      ),
    )
    .orderBy(asc(sentences.islandId), asc(sentences.position))
    .limit(filter?.limit ?? 10_000);

  return rows.map((r) => ({ ...r, targetText: r.targetText! }));
}

export interface AwaitingPromptAudio {
  id: string;
  userId: string;
  islandId: string;
  sourceText: string;
  sourceLang: string;
}

/**
 * Sentences in an island that have no English hint audio yet — the work list
 * for the lazy generation Listen mode (and, from Phase 4, Recall) triggers.
 * Restricted to rows that already have Romanian audio, because only those are
 * in the playlist at all; a linked sentence stops matching, which is what makes
 * a second trigger a no-op.
 */
export async function sentencesAwaitingPromptAudio(filter: {
  userId: string;
  islandId: string;
  ids?: string[];
}): Promise<AwaitingPromptAudio[]> {
  if (filter.ids?.length === 0) return [];
  const db = getDb();
  return db
    .select({
      id: sentences.id,
      userId: sentences.userId,
      islandId: sentences.islandId,
      sourceText: sentences.sourceText,
      sourceLang: sentences.sourceLang,
    })
    .from(sentences)
    .where(
      and(
        eq(sentences.userId, filter.userId),
        eq(sentences.islandId, filter.islandId),
        isNotNull(sentences.targetAudioId),
        isNull(sentences.promptAudioId),
        filter.ids ? inArray(sentences.id, filter.ids) : undefined,
      ),
    )
    .orderBy(asc(sentences.position));
}
