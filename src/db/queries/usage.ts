import { and, eq, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { usageEvents, usageMonthly } from '@/db/schema';

/** Usage accounting: append-only events plus the rollup quota checks read. */

export async function monthlyUsage(userId: string, yearMonth: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(usageMonthly)
    .where(
      and(eq(usageMonthly.userId, userId), eq(usageMonthly.yearMonth, yearMonth)),
    )
    .limit(1);
  return rows[0];
}

export interface TranslationUsage {
  userId: string;
  yearMonth: string;
  provider: string;
  model: string;
  sentenceCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costMicros: number;
  refId?: string;
}

/**
 * Records one translation call and bumps the month's rollup. The upsert's
 * arithmetic runs in Postgres so concurrent captures can't lose a count.
 */
export async function recordTranslationUsage(u: TranslationUsage) {
  const db = getDb();
  await db.insert(usageEvents).values({
    userId: u.userId,
    kind: 'translation',
    provider: u.provider,
    model: u.model,
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    cacheReadTokens: u.cacheReadTokens,
    costMicros: u.costMicros,
    refId: u.refId,
  });

  await db
    .insert(usageMonthly)
    .values({
      userId: u.userId,
      yearMonth: u.yearMonth,
      sentencesTranslated: u.sentenceCount,
      aiInputTokens: u.inputTokens + u.cacheReadTokens,
      aiOutputTokens: u.outputTokens,
      costMicros: u.costMicros,
    })
    .onConflictDoUpdate({
      target: [usageMonthly.userId, usageMonthly.yearMonth],
      set: {
        sentencesTranslated: sql`${usageMonthly.sentencesTranslated} + ${u.sentenceCount}`,
        aiInputTokens: sql`${usageMonthly.aiInputTokens} + ${u.inputTokens + u.cacheReadTokens}`,
        aiOutputTokens: sql`${usageMonthly.aiOutputTokens} + ${u.outputTokens}`,
        costMicros: sql`${usageMonthly.costMicros} + ${u.costMicros}`,
      },
    });
}

export interface IslandGenerationUsage {
  userId: string;
  yearMonth: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costMicros: number;
  /** The island the generation produced. */
  refId: string;
}

/**
 * Records one island generation and bumps the month's counter — the counter
 * `checkIslandQuota` reads. Called after the model returns, so a failed
 * generation costs the user nothing.
 *
 * The generated sentences are NOT added to `sentences_translated`: they arrive
 * with Romanian already attached and never enter the translation path, so
 * counting them there would charge twice for one call.
 */
export async function recordIslandGenerationUsage(u: IslandGenerationUsage) {
  const db = getDb();
  await db.insert(usageEvents).values({
    userId: u.userId,
    kind: 'island_generation',
    provider: u.provider,
    model: u.model,
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    cacheReadTokens: u.cacheReadTokens,
    costMicros: u.costMicros,
    refId: u.refId,
  });

  await db
    .insert(usageMonthly)
    .values({
      userId: u.userId,
      yearMonth: u.yearMonth,
      islandsGenerated: 1,
      aiInputTokens: u.inputTokens + u.cacheReadTokens,
      aiOutputTokens: u.outputTokens,
      costMicros: u.costMicros,
    })
    .onConflictDoUpdate({
      target: [usageMonthly.userId, usageMonthly.yearMonth],
      set: {
        islandsGenerated: sql`${usageMonthly.islandsGenerated} + 1`,
        aiInputTokens: sql`${usageMonthly.aiInputTokens} + ${u.inputTokens + u.cacheReadTokens}`,
        aiOutputTokens: sql`${usageMonthly.aiOutputTokens} + ${u.outputTokens}`,
        costMicros: sql`${usageMonthly.costMicros} + ${u.costMicros}`,
      },
    });
}

export interface TtsUsage {
  userId: string;
  yearMonth: string;
  provider: string;
  voiceId: string;
  chars: number;
  costMicros: number;
  refId: string;
}

/** Records one synthesis and bumps the month's character count. */
export async function recordTtsUsage(u: TtsUsage) {
  const db = getDb();
  await db.insert(usageEvents).values({
    userId: u.userId,
    kind: 'tts',
    provider: u.provider,
    model: u.voiceId,
    ttsChars: u.chars,
    costMicros: u.costMicros,
    refId: u.refId,
  });

  await db
    .insert(usageMonthly)
    .values({
      userId: u.userId,
      yearMonth: u.yearMonth,
      ttsChars: u.chars,
      costMicros: u.costMicros,
    })
    .onConflictDoUpdate({
      target: [usageMonthly.userId, usageMonthly.yearMonth],
      set: {
        ttsChars: sql`${usageMonthly.ttsChars} + ${u.chars}`,
        costMicros: sql`${usageMonthly.costMicros} + ${u.costMicros}`,
      },
    });
}
