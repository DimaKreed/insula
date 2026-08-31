import { describe, expect, it } from 'vitest';

import {
  PLAN_LIMITS,
  checkSentenceQuota,
  limitsFor,
  yearMonth,
} from './quota';

describe('limitsFor', () => {
  it('exempts admins', () => {
    expect(limitsFor('free', 'admin')).toBeNull();
  });

  it('falls back to free for an unknown tier', () => {
    expect(limitsFor('enterprise', 'user')).toEqual(PLAN_LIMITS.free);
  });

  it('gives pro users the pro limits', () => {
    expect(limitsFor('pro', 'user')).toEqual(PLAN_LIMITS.pro);
  });
});

describe('checkSentenceQuota', () => {
  const free = PLAN_LIMITS.free;

  it('allows a capture that fits', () => {
    expect(checkSentenceQuota(free, 10, 5).allowed).toBe(true);
  });

  it('allows a capture that lands exactly on the limit', () => {
    expect(
      checkSentenceQuota(free, free.sentencesTranslated - 3, 3).allowed,
    ).toBe(true);
  });

  it('rejects a capture that would cross the limit, all-or-nothing', () => {
    const result = checkSentenceQuota(free, free.sentencesTranslated - 2, 5);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.remaining).toBe(2);
      expect(result.message).toContain('2');
    }
  });

  it('says the quota is spent when nothing is left', () => {
    const result = checkSentenceQuota(free, free.sentencesTranslated, 1);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.remaining).toBe(0);
  });

  it('never reports negative headroom if usage somehow overshot', () => {
    const result = checkSentenceQuota(free, free.sentencesTranslated + 40, 1);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.remaining).toBe(0);
  });

  it('lets an exempt user through', () => {
    expect(checkSentenceQuota(null, 10_000, 50).allowed).toBe(true);
  });
});

describe('yearMonth', () => {
  it('formats as YYYY-MM', () => {
    expect(yearMonth(new Date('2026-08-31T12:00:00Z'), 'UTC')).toBe('2026-08');
  });

  it('uses the user timezone at a month boundary', () => {
    // 23:30 on Aug 31 in New York is already Sep 1 in UTC.
    const instant = new Date('2026-09-01T03:30:00Z');
    expect(yearMonth(instant, 'UTC')).toBe('2026-09');
    expect(yearMonth(instant, 'America/New_York')).toBe('2026-08');
  });
});
