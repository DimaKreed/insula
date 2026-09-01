import { describe, expect, it } from 'vitest';

import {
  FIRST_OFFENCE_COOLDOWN_MS,
  OFFENCE_WINDOW_DAYS,
  PLAN_LIMITS,
  REPEAT_OFFENCE_BLOCK_MS,
  checkIslandQuota,
  checkSentenceQuota,
  checkTtsQuota,
  generationBlock,
  limitsFor,
  offenceWarning,
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

describe('generationBlock', () => {
  const free = PLAN_LIMITS.free;
  const now = new Date('2026-09-02T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const DAY = 24 * 60 * 60 * 1000;

  it('allows generation when there are no offences', () => {
    expect(generationBlock([], now, free).blocked).toBe(false);
  });

  it('pauses for an hour after the first offence', () => {
    const check = generationBlock([ago(10 * 60 * 1000)], now, free);
    expect(check.blocked).toBe(true);
    if (check.blocked) {
      expect(check.until.getTime()).toBe(
        ago(10 * 60 * 1000).getTime() + FIRST_OFFENCE_COOLDOWN_MS,
      );
      expect(check.message).toContain('hour');
    }
  });

  it('lets the hour expire', () => {
    expect(
      generationBlock([ago(FIRST_OFFENCE_COOLDOWN_MS + 1000)], now, free).blocked,
    ).toBe(false);
  });

  it('blocks for two weeks on the second offence', () => {
    const latest = ago(60 * 1000);
    const check = generationBlock([ago(2 * DAY), latest], now, free);
    expect(check.blocked).toBe(true);
    if (check.blocked) {
      expect(check.until.getTime()).toBe(
        latest.getTime() + REPEAT_OFFENCE_BLOCK_MS,
      );
      // The repeat message names the exact date rather than the duration —
      // more use to someone deciding when to come back.
      expect(check.message).toContain('repeated');
      expect(check.message).toContain('your own sentences');
    }
  });

  it('plateaus at two weeks rather than escalating further', () => {
    const latest = ago(60 * 1000);
    const many = generationBlock(
      [ago(5 * DAY), ago(4 * DAY), ago(3 * DAY), latest],
      now,
      free,
    );
    const two = generationBlock([ago(3 * DAY), latest], now, free);
    expect(many.blocked && two.blocked).toBe(true);
    if (many.blocked && two.blocked) {
      expect(many.until.getTime()).toBe(two.until.getTime());
    }
  });

  it('stops counting offences older than the window', () => {
    // Two offences, but the older one has aged out — so this is a first offence.
    const latest = ago(10 * 60 * 1000);
    const check = generationBlock(
      [ago((OFFENCE_WINDOW_DAYS + 1) * DAY), latest],
      now,
      free,
    );
    expect(check.blocked).toBe(true);
    if (check.blocked) {
      expect(check.until.getTime()).toBe(
        latest.getTime() + FIRST_OFFENCE_COOLDOWN_MS,
      );
    }
  });

  it('ignores offences entirely once all of them have aged out', () => {
    expect(
      generationBlock(
        [ago((OFFENCE_WINDOW_DAYS + 1) * DAY)],
        now,
        free,
      ).blocked,
    ).toBe(false);
  });

  it('exempts admins, who have no limits object', () => {
    expect(generationBlock([now, now], now, null).blocked).toBe(false);
  });
});

describe('offenceWarning', () => {
  it('warns about the escalation on a first offence', () => {
    expect(offenceWarning(1)).toContain('two weeks');
    expect(offenceWarning(1)).toContain('hour');
  });

  it('states the block on a repeat', () => {
    expect(offenceWarning(2)).toContain('blocked for two weeks');
  });
});
