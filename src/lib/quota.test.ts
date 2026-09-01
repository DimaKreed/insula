import { describe, expect, it } from 'vitest';

import {
  PLAN_LIMITS,
  checkIslandQuota,
  checkSentenceQuota,
  checkTtsQuota,
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

describe('checkTtsQuota', () => {
  const free = PLAN_LIMITS.free;

  it('allows a sentence that fits the remaining characters', () => {
    expect(checkTtsQuota(free, free.ttsChars - 100, 40).allowed).toBe(true);
  });

  it('refuses one that does not, and says how much is left', () => {
    const check = checkTtsQuota(free, free.ttsChars - 10, 40);
    expect(check.allowed).toBe(false);
    if (!check.allowed) {
      expect(check.remaining).toBe(10);
      expect(check.message).toContain('40');
    }
  });

  it('exempts admins, who have no limits object', () => {
    expect(checkTtsQuota(null, 10_000_000, 250).allowed).toBe(true);
  });
});

describe('checkIslandQuota', () => {
  const free = PLAN_LIMITS.free;

  it('allows a generation while any of the month allowance is left', () => {
    expect(checkIslandQuota(free, free.islandsGenerated - 1).allowed).toBe(true);
  });

  it('refuses at the cap, and points at adding your own sentences instead', () => {
    const check = checkIslandQuota(free, free.islandsGenerated);
    expect(check.allowed).toBe(false);
    if (!check.allowed) {
      expect(check.remaining).toBe(0);
      expect(check.message).toContain('your own sentences');
    }
  });

  it('refuses once over the cap too, rather than going negative', () => {
    const check = checkIslandQuota(free, free.islandsGenerated + 5);
    expect(check.allowed).toBe(false);
    if (!check.allowed) expect(check.remaining).toBe(0);
  });

  it('exempts admins, who have no limits object', () => {
    expect(checkIslandQuota(null, 10_000).allowed).toBe(true);
  });
});
