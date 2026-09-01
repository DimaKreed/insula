import { and, desc, eq, gt } from 'drizzle-orm';

import { getDb } from '@/db';
import { generationOffences } from '@/db/schema';

/**
 * Off-topic generation attempts. Read by `generationBlock` in
 * `src/lib/quota.ts`, which derives the whole penalty from these rows rather
 * than from a stored counter.
 */

/** Offence timestamps inside the escalation window, newest first. */
export async function recentOffenceDates(
  userId: string,
  since: Date,
): Promise<Date[]> {
  const db = getDb();
  const rows = await db
    .select({ createdAt: generationOffences.createdAt })
    .from(generationOffences)
    .where(
      and(
        eq(generationOffences.userId, userId),
        gt(generationOffences.createdAt, since),
      ),
    )
    .orderBy(desc(generationOffences.createdAt));
  return rows.map((r) => r.createdAt);
}

/** Truncated so one pasted document can't bloat the row. */
const MAX_BRIEF_CHARS = 1_000;

export async function recordOffence(offence: {
  userId: string;
  brief: string;
  reason: string;
}): Promise<void> {
  const db = getDb();
  await db.insert(generationOffences).values({
    userId: offence.userId,
    brief: offence.brief.slice(0, MAX_BRIEF_CHARS),
    reason: offence.reason.slice(0, 500),
  });
}

/**
 * Clears a user's offences — the escape hatch behind
 * `npm run admin -- --clear-offences=email`. Escalation plateaus at two weeks
 * with no automatic pardon, so a classifier false positive needs some way out.
 */
export async function clearOffences(userId: string): Promise<number> {
  const db = getDb();
  const deleted = await db
    .delete(generationOffences)
    .where(eq(generationOffences.userId, userId))
    .returning({ id: generationOffences.id });
  return deleted.length;
}
