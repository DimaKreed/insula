import { and, desc, eq, inArray, max } from 'drizzle-orm';

import { getDb } from '@/db';
import { sentences, translationCache, type Sentence } from '@/db/schema';

/** Sentence data access — userId first, user_id predicate on every query. */

export async function listSentences(
  userId: string,
  islandId: string,
): Promise<Sentence[]> {
  const db = getDb();
  return db
    .select()
    .from(sentences)
    .where(and(eq(sentences.islandId, islandId), eq(sentences.userId, userId)))
    .orderBy(desc(sentences.position));
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
