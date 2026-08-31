'use server';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/auth';
import { getDb } from '@/db';
import { getReviewState } from '@/db/queries/review';
import { reviewLogs, reviewStates } from '@/db/schema';
import {
  cardFromRow,
  cardToRow,
  formatInterval,
  gradeCard,
  isGradeRating,
  serializeReviewLog,
} from '@/lib/srs/fsrs';

import { failed, type ActionResult } from './result';

const gradeInput = z.object({
  sentenceId: z.string().min(1),
  rating: z.number().int(),
  durationMs: z.number().int().min(0).max(600_000).optional(),
});

/**
 * One review: `fsrs.next` decides the new card, and both halves of the result
 * are persisted — the card onto `review_states`, the library's own ReviewLog
 * into `review_logs` verbatim (Implementation Plan section 4.2).
 *
 * The client has already moved on to the next card by the time this returns; it
 * reports the scheduled interval so a caller that wants to confirm can, and
 * surfaces a failure as a toast rather than by rewinding the session.
 */
export async function gradeReview(
  input: unknown,
): Promise<ActionResult<{ interval: string; due: string }>> {
  const parsed = gradeInput.safeParse(input);
  if (!parsed.success) return failed('That grade did not make sense.');

  const user = await requireUser();
  const state = await getReviewState(user.id, parsed.data.sentenceId);
  if (!state) return failed('That card is no longer in your collection.');

  const rating = parsed.data.rating;
  if (!isGradeRating(rating)) return failed('That grade did not make sense.');

  const now = new Date();
  const result = gradeCard(cardFromRow(state), now, rating);
  const card = cardToRow(result.card);

  const db = getDb();
  await db
    .update(reviewStates)
    .set(card)
    .where(
      and(
        eq(reviewStates.sentenceId, state.sentenceId),
        eq(reviewStates.userId, user.id),
      ),
    );

  await db.insert(reviewLogs).values({
    userId: user.id,
    sentenceId: state.sentenceId,
    rating,
    fsrsLog: serializeReviewLog(result.log),
    durationMs: parsed.data.durationMs ?? null,
    reviewedAt: now,
  });

  return {
    ok: true,
    data: {
      interval: formatInterval(now, card.due),
      due: card.due.toISOString(),
    },
  };
}
