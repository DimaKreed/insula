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
}

export const PLAN_LIMITS: Record<Tier, PlanLimits> = {
  free: { sentencesTranslated: 500, ttsChars: 25_000, transcriptAnalyses: 5 },
  pro: { sentencesTranslated: 2_500, ttsChars: 125_000, transcriptAnalyses: 25 },
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
