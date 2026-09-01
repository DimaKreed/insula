import type { SessionUser } from '@/auth';
import { recentOffenceDates } from '@/db/queries/generation';
import {
  OFFENCE_WINDOW_DAYS,
  generationBlock,
  limitsFor,
  type GenerationBlock,
} from '@/lib/quota';

/**
 * Whether generation is currently open for a user.
 *
 * Deliberately NOT in `src/actions/generate.ts`: everything exported from a
 * `'use server'` module is a callable endpoint, so a function there that takes
 * the user as an argument rather than reading the session lets a client ask
 * about somebody else's account. Here it is a plain import — the action and the
 * islands page both use it, and none of it is reachable from the browser.
 */
export function offenceWindowStart(now = new Date()): Date {
  return new Date(now.getTime() - OFFENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

export async function generationGate(
  user: SessionUser,
): Promise<GenerationBlock> {
  const dates = await recentOffenceDates(user.id, offenceWindowStart());
  return generationBlock(dates, new Date(), limitsFor(user.tier, user.role));
}
