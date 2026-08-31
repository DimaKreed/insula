import { and, asc, count, eq, gte, isNull, lt, lte, ne, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import {
  audioAssets,
  islands,
  reviewLogs,
  reviewStates,
  sentences,
  users,
  type ReviewState,
} from '@/db/schema';
import {
  addDays,
  dayKey,
  dayStart,
  newCardsPerDay,
  streaks,
} from '@/lib/srs/daily';
import {
  cardFromRow,
  cardToRow,
  newCard,
  previewGrades,
  Rating,
  State,
  type CardRow,
  type GradeOption,
} from '@/lib/srs/fsrs';

/** SRS data access — userId first, user_id predicate on every query. */

/** Cap on one session's due cards (Implementation Plan section 4.2). */
const DUE_LIMIT = 200;

export interface SessionUserRef {
  id: string;
  timezone: string;
}

export interface QueueCard {
  sentenceId: string;
  sourceText: string;
  targetText: string;
  audioUrl: string | null;
  islandName: string;
  islandEmoji: string | null;
  /** First time this sentence is being asked — the UI says so. */
  isNew: boolean;
  grades: GradeOption[];
}

/** The card columns plus what the session needs to show the sentence. */
const queueColumns = {
  sentenceId: reviewStates.sentenceId,
  due: reviewStates.due,
  stability: reviewStates.stability,
  difficulty: reviewStates.difficulty,
  elapsedDays: reviewStates.elapsedDays,
  scheduledDays: reviewStates.scheduledDays,
  learningSteps: reviewStates.learningSteps,
  reps: reviewStates.reps,
  lapses: reviewStates.lapses,
  state: reviewStates.state,
  lastReview: reviewStates.lastReview,
  extra: reviewStates.extra,
  sourceText: sentences.sourceText,
  targetText: sentences.targetText,
  audioUrl: audioAssets.url,
  islandName: islands.name,
  islandEmoji: islands.emoji,
};

interface QueueRow extends CardRow {
  sentenceId: string;
  sourceText: string;
  targetText: string | null;
  audioUrl: string | null;
  islandName: string;
  islandEmoji: string | null;
}

/**
 * Today's session: everything already due, then new cards up to what is left of
 * the daily new-card allowance. Only `status='ready'` sentences — a card whose
 * audio is still being made has nothing to reveal.
 */
export async function dailyQueue(
  user: SessionUserRef,
  now: Date,
): Promise<QueueCard[]> {
  const db = getDb();

  const reviewable = (isNew: boolean) =>
    and(
      eq(reviewStates.userId, user.id),
      eq(reviewStates.suspended, false),
      eq(sentences.status, 'ready'),
      isNull(islands.archivedAt),
      isNew
        ? eq(reviewStates.state, State.New)
        : and(ne(reviewStates.state, State.New), lte(reviewStates.due, now)),
    );

  const base = () =>
    db
      .select(queueColumns)
      .from(reviewStates)
      .innerJoin(sentences, eq(sentences.id, reviewStates.sentenceId))
      .innerJoin(islands, eq(islands.id, sentences.islandId))
      .leftJoin(audioAssets, eq(audioAssets.id, sentences.targetAudioId));

  const due = await base()
    .where(reviewable(false))
    .orderBy(asc(reviewStates.due))
    .limit(DUE_LIMIT);

  const allowance = await newCardAllowance(user, now);
  const fresh =
    allowance === 0
      ? []
      : await base()
          .where(reviewable(true))
          .orderBy(asc(islands.position), asc(sentences.position))
          .limit(allowance);

  return [
    ...due.map((row) => toQueueCard(row, now, false)),
    ...fresh.map((row) => toQueueCard(row, now, true)),
  ];
}

function toQueueCard(row: QueueRow, now: Date, isNew: boolean): QueueCard {
  return {
    sentenceId: row.sentenceId,
    sourceText: row.sourceText,
    targetText: row.targetText ?? '',
    audioUrl: row.audioUrl,
    islandName: row.islandName,
    islandEmoji: row.islandEmoji,
    isNew,
    grades: previewGrades(cardFromRow(row), now),
  };
}

/**
 * New cards still allowed today. What has already been introduced is counted
 * out of `review_logs`: a log's `state` is the card's state *before* the grade,
 * so logs with state New are exactly today's first-time cards — no counter to
 * keep in sync anywhere.
 */
async function newCardAllowance(
  user: SessionUserRef,
  now: Date,
): Promise<number> {
  const db = getDb();
  const [settings, introduced] = await Promise.all([
    db
      .select({ settings: users.settings })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1),
    db
      .select({ value: count() })
      .from(reviewLogs)
      .where(
        and(
          eq(reviewLogs.userId, user.id),
          gte(reviewLogs.reviewedAt, dayStart(now, user.timezone)),
          sql`(${reviewLogs.fsrsLog} ->> 'state') = ${String(State.New)}`,
        ),
      ),
  ]);

  const limit = newCardsPerDay(settings[0]?.settings);
  return Math.max(0, limit - (introduced[0]?.value ?? 0));
}

/**
 * Gives brand-new sentences their card, in state New. Called wherever sentences
 * are created so `review_states` stays 1:1 with `sentences`; idempotent, so a
 * re-run (or the backfill script) can never double-insert.
 */
export async function createReviewStates(
  userId: string,
  sentenceIds: string[],
  now: Date,
): Promise<number> {
  if (sentenceIds.length === 0) return 0;
  const db = getDb();
  const inserted = await db
    .insert(reviewStates)
    .values(
      sentenceIds.map((sentenceId) => ({
        sentenceId,
        userId,
        ...cardToRow(newCard(now)),
      })),
    )
    .onConflictDoNothing()
    .returning({ sentenceId: reviewStates.sentenceId });
  return inserted.length;
}

/** Sentences with no card yet — what `npm run srs:backfill` works through. */
export async function sentencesWithoutReviewState(
  userId?: string,
): Promise<{ id: string; userId: string }[]> {
  const db = getDb();
  return db
    .select({ id: sentences.id, userId: sentences.userId })
    .from(sentences)
    .leftJoin(reviewStates, eq(reviewStates.sentenceId, sentences.id))
    .where(
      and(
        isNull(reviewStates.sentenceId),
        userId ? eq(sentences.userId, userId) : undefined,
      ),
    )
    .orderBy(asc(sentences.createdAt));
}

export async function getReviewState(
  userId: string,
  sentenceId: string,
): Promise<ReviewState | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(reviewStates)
    .where(
      and(
        eq(reviewStates.sentenceId, sentenceId),
        eq(reviewStates.userId, userId),
      ),
    )
    .limit(1);
  return rows[0];
}

// --- Streak and stats ------------------------------------------------------

/** How far back the day-by-day history is read; enough for any streak claim. */
const HISTORY_DAYS = 400;

export interface ReviewDay {
  day: string;
  reviews: number;
}

/** Reviews per calendar day in the user's timezone, newest first. */
export async function reviewDays(user: SessionUserRef): Promise<ReviewDay[]> {
  const db = getDb();
  const since = addDays(new Date(), -HISTORY_DAYS);
  return db
    .select({
      day: sql<string>`to_char(${reviewLogs.reviewedAt} at time zone ${user.timezone}, 'YYYY-MM-DD')`.as(
        'day',
      ),
      reviews: count(),
    })
    .from(reviewLogs)
    .where(
      and(eq(reviewLogs.userId, user.id), gte(reviewLogs.reviewedAt, since)),
    )
    .groupBy(sql`1`)
    .orderBy(sql`1 desc`);
}

export interface ReviewSummary {
  /** Consecutive days of reviews, counting today if it has any. */
  streakDays: number;
  reviewedToday: number;
  dueTomorrow: number;
}

export async function reviewSummary(
  user: SessionUserRef,
  now: Date,
): Promise<ReviewSummary> {
  const start = dayStart(now, user.timezone);
  const [days, dueTomorrow] = await Promise.all([
    reviewDays(user),
    countDueBetween(user.id, addDays(start, 1), addDays(start, 2)),
  ]);

  const today = dayKey(now, user.timezone);
  return {
    streakDays: streaks(
      days.map((d) => d.day),
      today,
    ).days,
    reviewedToday: days.find((d) => d.day === today)?.reviews ?? 0,
    dueTomorrow,
  };
}

export interface ReviewStats extends ReviewSummary {
  longestStreak: number;
  reviewedLast7Days: number;
  reviewedTotal: number;
  /** Newest-first, one entry per day that had reviews. */
  days: ReviewDay[];
  cards: { new: number; learning: number; review: number; relearning: number };
  suspended: number;
  /** Share of the last 30 days' grades that were not 'Again', 0–1. */
  recall: number | null;
  dueNow: number;
}

export async function reviewStats(
  user: SessionUserRef,
  now: Date,
): Promise<ReviewStats> {
  const start = dayStart(now, user.timezone);
  const db = getDb();

  const [days, byState, suspended, grades, dueNow, dueTomorrow] =
    await Promise.all([
      reviewDays(user),
      db
        .select({ state: reviewStates.state, value: count() })
        .from(reviewStates)
        .innerJoin(sentences, eq(sentences.id, reviewStates.sentenceId))
        .where(
          and(
            eq(reviewStates.userId, user.id),
            eq(reviewStates.suspended, false),
            eq(sentences.status, 'ready'),
          ),
        )
        .groupBy(reviewStates.state),
      db
        .select({ value: count() })
        .from(reviewStates)
        .where(
          and(
            eq(reviewStates.userId, user.id),
            eq(reviewStates.suspended, true),
          ),
        ),
      db
        .select({
          total: count(),
          again: count(
            sql`case when ${reviewLogs.rating} = ${Rating.Again} then 1 end`,
          ),
        })
        .from(reviewLogs)
        .where(
          and(
            eq(reviewLogs.userId, user.id),
            gte(reviewLogs.reviewedAt, addDays(now, -30)),
          ),
        ),
      countDueBetween(user.id, undefined, now),
      countDueBetween(user.id, addDays(start, 1), addDays(start, 2)),
    ]);

  const stateCount = (state: State) =>
    byState.find((row) => row.state === state)?.value ?? 0;

  const today = dayKey(now, user.timezone);
  const { days: streakDays, longest } = streaks(
    days.map((d) => d.day),
    today,
  );
  const last7 = new Set(
    Array.from({ length: 7 }, (_, i) =>
      dayKey(addDays(now, -i), user.timezone),
    ),
  );
  const total = grades[0]?.total ?? 0;

  return {
    streakDays,
    longestStreak: longest,
    reviewedToday: days.find((d) => d.day === today)?.reviews ?? 0,
    reviewedLast7Days: days
      .filter((d) => last7.has(d.day))
      .reduce((sum, d) => sum + d.reviews, 0),
    reviewedTotal: days.reduce((sum, d) => sum + d.reviews, 0),
    days,
    cards: {
      new: stateCount(State.New),
      learning: stateCount(State.Learning),
      review: stateCount(State.Review),
      relearning: stateCount(State.Relearning),
    },
    suspended: suspended[0]?.value ?? 0,
    recall: total === 0 ? null : (total - (grades[0]?.again ?? 0)) / total,
    dueNow,
    dueTomorrow,
  };
}

/** Reviewable cards (never counting new ones) with `from <= due < to`. */
async function countDueBetween(
  userId: string,
  from: Date | undefined,
  to: Date,
): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ value: count() })
    .from(reviewStates)
    .innerJoin(sentences, eq(sentences.id, reviewStates.sentenceId))
    .innerJoin(islands, eq(islands.id, sentences.islandId))
    .where(
      and(
        eq(reviewStates.userId, userId),
        eq(reviewStates.suspended, false),
        eq(sentences.status, 'ready'),
        isNull(islands.archivedAt),
        ne(reviewStates.state, State.New),
        from ? gte(reviewStates.due, from) : undefined,
        lt(reviewStates.due, to),
      ),
    );
  return rows[0]?.value ?? 0;
}
