import { eq, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { users } from '@/db/schema';

/**
 * `users.settings` — the jsonb bag of per-user preferences (new cards per day,
 * Listen hints, and whatever later phases add).
 *
 * Read loosely and written by merge: every consumer parses the one key it cares
 * about and falls back to a default, so a setting a client does not know about
 * survives a write from a client that does.
 */

export async function userSettings(userId: string): Promise<unknown> {
  const db = getDb();
  const rows = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]?.settings ?? {};
}

export async function updateUserSettings(
  userId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({
      settings: sql`${users.settings} || ${JSON.stringify(patch)}::jsonb`,
    })
    .where(eq(users.id, userId));
}
