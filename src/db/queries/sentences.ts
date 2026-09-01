import { and, asc, desc, eq, inArray, isNotNull, max } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { getDb } from '@/db';
import {
  audioAssets,
  reviewStates,
  sentences,
  translationCache,
  type Sentence,
} from '@/db/schema';

/** Sentence data access — userId first, user_id predicate on every query. */

/** A sentence plus its Romanian audio, flattened for the row components. */
export interface SentenceWithAudio extends Sentence {
  audioUrl: string | null;
  audioDurationMs: number | null;
}

export async function listSentences(
  userId: string,
  islandId: string,
): Promise<SentenceWithAudio[]> {
  const db = getDb();
  const rows = await db
    .select({
      sentence: sentences,
      audioUrl: audioAssets.url,
      audioDurationMs: audioAssets.durationMs,
    })
    .from(sentences)
    .leftJoin(audioAssets, eq(audioAssets.id, sentences.targetAudioId))
    .where(and(eq(sentences.islandId, islandId), eq(sentences.userId, userId)))
    .orderBy(desc(sentences.position));

  return rows.map((r) => ({
    ...r.sentence,
    audioUrl: r.audioUrl,
    audioDurationMs: r.audioDurationMs,
  }));
}

/** What the island page's poller compares against — statuses only, no text. */
export async function sentenceStatuses(userId: string, islandId: string) {
  const db = getDb();
  return db
    .select({
      id: sentences.id,
      status: sentences.status,
      hasAudio: isNotNull(sentences.targetAudioId),
    })
    .from(sentences)
    .where(and(eq(sentences.islandId, islandId), eq(sentences.userId, userId)))
    .orderBy(desc(sentences.position));
}

export interface PlaylistItem {
  sentenceId: string;
  sourceText: string;
  targetText: string;
  audioUrl: string;
  durationMs: number | null;
  /** English hint audio, once it has been synthesized for this sentence. */
  promptAudioUrl: string | null;
  promptDurationMs: number | null;
  /** `review_states.state`; null for a sentence that has no card yet. */
  srsState: number | null;
}

/**
 * The island's playable sentences, in study order. Only rows with Romanian
 * audio: the player and the offline download both need a URL to work with, and
 * a sentence still waiting for TTS simply joins the playlist once it has one.
 *
 * The English hint audio and the FSRS state ride along because Listen mode
 * decides per sentence whether to play a hint first (`src/lib/player/
 * listen-hints.ts`), and the offline manifest is the same shape — a commute
 * with no signal has to be able to make that decision too.
 */
export async function islandPlaylist(
  userId: string,
  islandId: string,
): Promise<PlaylistItem[]> {
  const db = getDb();
  const promptAudio = alias(audioAssets, 'prompt_audio');
  const rows = await db
    .select({
      sentenceId: sentences.id,
      sourceText: sentences.sourceText,
      targetText: sentences.targetText,
      audioUrl: audioAssets.url,
      durationMs: audioAssets.durationMs,
      promptAudioUrl: promptAudio.url,
      promptDurationMs: promptAudio.durationMs,
      srsState: reviewStates.state,
    })
    .from(sentences)
    .innerJoin(audioAssets, eq(audioAssets.id, sentences.targetAudioId))
    .leftJoin(promptAudio, eq(promptAudio.id, sentences.promptAudioId))
    .leftJoin(reviewStates, eq(reviewStates.sentenceId, sentences.id))
    .where(and(eq(sentences.islandId, islandId), eq(sentences.userId, userId)))
    .orderBy(asc(sentences.position));

  return rows.map((r) => ({ ...r, targetText: r.targetText ?? '' }));
}

export async function getSentence(
  userId: string,
  sentenceId: string,
): Promise<Sentence | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(sentences)
    .where(and(eq(sentences.id, sentenceId), eq(sentences.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function nextSentencePosition(islandId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ maxPosition: max(sentences.position) })
    .from(sentences)
    .where(eq(sentences.islandId, islandId));
  return (rows[0]?.maxPosition ?? -1) + 1;
}

/** Global cache lookup — a hit means this text was translated for someone already. */
export async function findCachedTranslations(hashes: string[]) {
  if (hashes.length === 0) return new Map<string, typeof translationCache.$inferSelect>();
  const db = getDb();
  const rows = await db
    .select()
    .from(translationCache)
    .where(inArray(translationCache.contentHash, hashes));
  return new Map(rows.map((r) => [r.contentHash, r]));
}

export async function cacheTranslations(
  entries: {
    contentHash: string;
    targetText: string;
    translationNote: string | null;
    lemmas: string[];
  }[],
) {
  if (entries.length === 0) return;
  const db = getDb();
  await db.insert(translationCache).values(entries).onConflictDoNothing();
}
