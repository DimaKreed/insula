/**
 * Plan limits as a versioned code constant (Implementation Plan section 7.2).
 * A table adds nothing until Stripe arrives.
 */

export type Tier = 'free' | 'pro';

export interface PlanLimits {
  /** Sentences translated per calendar month. Cache hits are free. */
  sentencesTranslated: number;
  /** New TTS characters per month (Phase 2). Dedup hits are free. */
  ttsChars: number;
  /** Transcript analyses per month (Phase 6). */
  transcriptAnalyses: number;
  /**
   * Islands generated from a topic per month (Phase 5). Deliberately small:
   * generation conjures 20 sentences from nothing, so it is far cheaper to abuse
   * than typing them, and each one turns into TTS characters downstream. At 20
   * sentences of ~40 characters, the free cap is ~2.4k of the 25k character
   * allowance — generation cannot on its own exhaust the Azure quota.
   */
  islandsGenerated: number;
}

export const PLAN_LIMITS: Record<Tier, PlanLimits> = {
  free: {
    sentencesTranslated: 500,
    ttsChars: 25_000,
    transcriptAnalyses: 5,
    islandsGenerated: 3,
  },
  pro: {
    sentencesTranslated: 2_500,
    ttsChars: 125_000,
    transcriptAnalyses: 25,
    islandsGenerated: 15,
  },
};

/** Per-sentence source-text cap; keeps TTS cost and audio length bounded. */
export const MAX_SENTENCE_CHARS = 250;
/** Sentences accepted in one capture. */
export const MAX_CAPTURE_LINES = 50;

export function limitsFor(tier: string, role: string): PlanLimits | null {
  if (role === 'admin') return null; // admin is exempt
  return PLAN_LIMITS[tier === 'pro' ? 'pro' : 'free'];
}

/** '2026-08' in the user's own timezone, so a month boundary lands where they are. */
export function yearMonth(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  }).format(now);
  return parts.slice(0, 7);
}

export type QuotaCheck =
  | { allowed: true; requested: number }
  | { allowed: false; remaining: number; limit: number; message: string };

/**
 * Pre-check for a capture: all-or-nothing, so the user never gets a partially
 * translated batch. Returns a message ready to show in the UI.
 */
export function checkSentenceQuota(
  limits: PlanLimits | null,
  used: number,
  requested: number,
): QuotaCheck {
  if (limits === null) return { allowed: true, requested };
  const remaining = Math.max(0, limits.sentencesTranslated - used);
  if (requested <= remaining) return { allowed: true, requested };
  return {
    allowed: false,
    remaining,
    limit: limits.sentencesTranslated,
    message:
      remaining === 0
        ? `You've used all ${limits.sentencesTranslated} translations on your plan this month.`
        : `Only ${remaining} of your ${limits.sentencesTranslated} monthly translations are left — you tried to add ${requested}.`,
  };
}

export type TtsQuotaCheck =
  | { allowed: true }
  | { allowed: false; remaining: number; limit: number; message: string };

/**
 * Pre-check for one TTS synthesis. Per sentence rather than per batch: audio is
 * generated in the background one sentence at a time, so a partially voiced
 * island is a normal state and the ones that fit should still get audio.
 * Dedup hits never reach here — they cost nothing.
 */
export function checkTtsQuota(
  limits: PlanLimits | null,
  used: number,
  chars: number,
): TtsQuotaCheck {
  if (limits === null) return { allowed: true };
  const remaining = Math.max(0, limits.ttsChars - used);
  if (chars <= remaining) return { allowed: true };
  return {
    allowed: false,
    remaining,
    limit: limits.ttsChars,
    message: `You've used ${used.toLocaleString()} of your ${limits.ttsChars.toLocaleString()} monthly audio characters — this sentence needs ${chars}.`,
  };
}

export type IslandQuotaCheck =
  | { allowed: true }
  | { allowed: false; remaining: number; limit: number; message: string };

/**
 * Pre-check for one island generation, run BEFORE the model is called — the
 * same order as the sentence quota, so a user at their cap never spends a
 * request. One island at a time: there is no batch entry point.
 */
export function checkIslandQuota(
  limits: PlanLimits | null,
  used: number,
): IslandQuotaCheck {
  if (limits === null) return { allowed: true };
  const remaining = Math.max(0, limits.islandsGenerated - used);
  if (remaining > 0) return { allowed: true };
  return {
    allowed: false,
    remaining,
    limit: limits.islandsGenerated,
    message: `You've generated all ${limits.islandsGenerated} starter islands on your plan this month. You can still add your own sentences to any island — that's the part that matters.`,
  };
}

// --- Off-topic generation enforcement --------------------------------------

/**
 * A free-text brief is also a free proxy to the model, so a brief that is not a
 * language-learning request at all is refused (the decision comes back from the
 * generation call itself) and the attempt is recorded.
 *
 * Escalation is deliberately shallow and plateaus, so there is no permanent
 * state to unpick by hand: first offence buys an hour, every one after that two
 * weeks. Offences stop counting after the window, because a single misfire of
 * the classifier must not leave someone one step from a long block forever.
 */
export const OFFENCE_WINDOW_DAYS = 90;
export const FIRST_OFFENCE_COOLDOWN_MS = 60 * 60 * 1000;
export const REPEAT_OFFENCE_BLOCK_MS = 14 * 24 * 60 * 60 * 1000;

export type GenerationBlock =
  | { blocked: false }
  | { blocked: true; until: Date; message: string };

/**
 * Whether generation is currently closed for a user, derived from their recent
 * offences rather than from a stored counter — the offence that causes a penalty
 * is also the row that dates it, so there is nothing to keep in sync. Mirrors
 * how the daily new-card count is read out of `review_logs`.
 *
 * Pass every offence date inside the window; order does not matter. Only
 * generation is gated: capture, review and playback are never affected.
 */
export function generationBlock(
  offenceDates: Date[],
  now: Date,
  limits: PlanLimits | null,
): GenerationBlock {
  if (limits === null) return { blocked: false }; // admin is exempt
  const cutoff = now.getTime() - OFFENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const times = offenceDates
    .map((d) => d.getTime())
    .filter((t) => t > cutoff);
  if (times.length === 0) return { blocked: false };

  const penalty =
    times.length === 1 ? FIRST_OFFENCE_COOLDOWN_MS : REPEAT_OFFENCE_BLOCK_MS;
  const until = new Date(Math.max(...times) + penalty);
  if (until.getTime() <= now.getTime()) return { blocked: false };

  return {
    blocked: true,
    until,
    message:
      times.length === 1
        ? `Generating topics is paused for an hour, until ${formatUntil(until)}, because your last request wasn't about something you want to be able to say. You can still add your own sentences to any island.`
        : `Generating topics is blocked until ${formatUntil(until)} after repeated off-topic requests. You can still add your own sentences to any island.`,
  };
}

/**
 * The warning shown with a refusal — it has to name what happens next time, or
 * a block two weeks long arrives with no notice.
 */
export function offenceWarning(offencesIncludingThis: number): string {
  return offencesIncludingThis <= 1
    ? 'Generating topics is paused for an hour. If it happens again, it will be blocked for two weeks.'
    : 'Generating topics is now blocked for two weeks.';
}

function formatUntil(until: Date): string {
  return until.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
