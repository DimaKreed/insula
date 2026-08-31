import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card,
  type Grade,
  type ReviewLog,
} from 'ts-fsrs';

import type { SerializedReviewLog } from '@/db/schema';

/**
 * The one place ts-fsrs is called from (Implementation Plan section 2.1).
 *
 * The library's `Card` is the source of truth for a card's state, so this module
 * only maps it on and off `review_states` — no re-derived intervals, no
 * home-grown scheduling. Default FSRS-6 parameters for now; `review_logs` keeps
 * the full history so a per-user optimizer run can replace them later without
 * any of this changing.
 */

const scheduler = fsrs();

/** ts-fsrs `Card` keys that have a column of their own on `review_states`. */
const CARD_COLUMN_KEYS = new Set([
  'due',
  'stability',
  'difficulty',
  'elapsed_days',
  'scheduled_days',
  'learning_steps',
  'reps',
  'lapses',
  'state',
  'last_review',
]);

/** The `review_states` columns that make up a card — the row minus its keys. */
export interface CardRow {
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: Date | null;
  extra: Record<string, unknown>;
}

export function newCard(now: Date): Card {
  return createEmptyCard(now);
}

export function cardFromRow(row: CardRow): Card {
  return {
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsedDays,
    scheduled_days: row.scheduledDays,
    learning_steps: row.learningSteps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.lastReview ?? undefined,
    // Fields a newer ts-fsrs added and this schema has no column for yet.
    ...row.extra,
  };
}

export function cardToRow(card: Card): CardRow {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(card)) {
    if (!CARD_COLUMN_KEYS.has(key)) extra[key] = value;
  }

  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ?? null,
    extra,
  };
}

/** jsonb keeps text, not Dates — write the log in the shape it comes back in. */
export function serializeReviewLog(log: ReviewLog): SerializedReviewLog {
  return {
    ...log,
    due: log.due.toISOString(),
    review: log.review.toISOString(),
  };
}

export function gradeCard(
  card: Card,
  now: Date,
  rating: Grade,
): { card: Card; log: ReviewLog } {
  return scheduler.next(card, now, rating);
}

// --- Grade buttons ---------------------------------------------------------

export const GRADES = [
  { rating: Rating.Again, label: 'Again' },
  { rating: Rating.Hard, label: 'Hard' },
  { rating: Rating.Good, label: 'Good' },
  { rating: Rating.Easy, label: 'Easy' },
] as const;

export type GradeRating = (typeof GRADES)[number]['rating'];

export interface GradeOption {
  rating: GradeRating;
  label: string;
  /** Where this grade would put the card, e.g. '10m' or '5d'. */
  interval: string;
}

export function isGradeRating(value: number): value is GradeRating {
  return value === Rating.Again || value === Rating.Hard || value === Rating.Good || value === Rating.Easy;
}

/**
 * The four buttons' labels for one card. Fuzz means the interval actually
 * scheduled can differ by a few percent from the number shown — the same
 * approximation every FSRS/SM-2 client makes, and the alternative (previewing
 * with the fuzz seed of a review that hasn't happened) is worse.
 */
export function previewGrades(card: Card, now: Date): GradeOption[] {
  const preview = scheduler.repeat(card, now);
  return GRADES.map(({ rating, label }) => ({
    rating,
    label,
    interval: formatInterval(now, preview[rating].card.due),
  }));
}

/** '10m', '2d', '3mo' — the compact form the grade buttons have room for. */
export function formatInterval(from: Date, to: Date): string {
  const minutes = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.round(minutes / 1440);
  if (days < 31) return `${days}d`;

  const months = Math.round(days / 30.44);
  if (months < 12) return `${months}mo`;

  const years = days / 365.25;
  return `${years < 10 ? years.toFixed(1) : Math.round(years)}y`;
}

export { Rating, State };
