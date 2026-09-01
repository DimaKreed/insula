import {
  and,
  asc,
  count,
  desc,
  eq,
  isNotNull,
  isNull,
  max,
  sql,
} from 'drizzle-orm';

import { getDb } from '@/db';
import { islands, sentences, type Island } from '@/db/schema';

/**
 * Island data access. Every function takes the session userId first and every
 * query carries a user_id predicate — the isolation rule from Implementation
 * Plan section 2.1.
 */

export interface IslandListItem extends Island {
  sentenceCount: number;
  translatedCount: number;
  /** Sentences with Romanian audio — what the player and offline download use. */
  audioCount: number;
}

export async function listIslands(userId: string): Promise<IslandListItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      island: islands,
      sentenceCount: count(sentences.id),
      translatedCount: sql<number>`count(${sentences.id}) filter (where ${sentences.targetText} is not null)`,
      audioCount: sql<number>`count(${sentences.id}) filter (where ${sentences.targetAudioId} is not null)`,
    })
    .from(islands)
    .leftJoin(sentences, eq(sentences.islandId, islands.id))
    .where(and(eq(islands.userId, userId), isNull(islands.archivedAt)))
    .groupBy(islands.id)
    .orderBy(asc(islands.position), asc(islands.createdAt));

  return rows.map((r) => ({
    ...r.island,
    sentenceCount: Number(r.sentenceCount),
    translatedCount: Number(r.translatedCount),
    audioCount: Number(r.audioCount),
  }));
}

export async function getIsland(
  userId: string,
  islandId: string,
): Promise<Island | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(islands)
    .where(and(eq(islands.id, islandId), eq(islands.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function nextIslandPosition(userId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ maxPosition: max(islands.position) })
    .from(islands)
    .where(eq(islands.userId, userId));
  return (rows[0]?.maxPosition ?? -1) + 1;
}

/**
 * Archived islands, newest first — what makes archiving reversible instead of a
 * one-way trip into an invisible bin. `listIslands` filters these out, so the
 * Archived section on the islands page is the only place they appear.
 */
export async function listArchivedIslands(
  userId: string,
): Promise<IslandListItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      island: islands,
      sentenceCount: count(sentences.id),
      translatedCount: sql<number>`count(${sentences.id}) filter (where ${sentences.targetText} is not null)`,
      audioCount: sql<number>`count(${sentences.id}) filter (where ${sentences.targetAudioId} is not null)`,
    })
    .from(islands)
    .leftJoin(sentences, eq(sentences.islandId, islands.id))
    .where(and(eq(islands.userId, userId), isNotNull(islands.archivedAt)))
    .groupBy(islands.id)
    .orderBy(desc(islands.archivedAt));

  return rows.map((r) => ({
    ...r.island,
    sentenceCount: Number(r.sentenceCount),
    translatedCount: Number(r.translatedCount),
    audioCount: Number(r.audioCount),
  }));
}
