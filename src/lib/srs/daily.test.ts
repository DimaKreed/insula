import { describe, expect, it } from 'vitest';

import {
  DEFAULT_NEW_CARDS_PER_DAY,
  dayKey,
  dayStart,
  newCardsPerDay,
  streaks,
} from './daily';

describe('dayKey', () => {
  it('uses the user timezone, not UTC', () => {
    const at = new Date('2026-09-01T22:30:00.000Z');
    expect(dayKey(at, 'UTC')).toBe('2026-09-01');
    // Bucharest is UTC+3 in September — already the next day there.
    expect(dayKey(at, 'Europe/Bucharest')).toBe('2026-09-02');
    expect(dayKey(at, 'America/Los_Angeles')).toBe('2026-09-01');
  });
});

describe('dayStart', () => {
  it('is local midnight, expressed as an instant', () => {
    const at = new Date('2026-09-01T22:30:00.000Z');
    expect(dayStart(at, 'UTC').toISOString()).toBe('2026-09-01T00:00:00.000Z');
    // 2026-09-02 00:00 in UTC+3.
    expect(dayStart(at, 'Europe/Bucharest').toISOString()).toBe(
      '2026-09-01T21:00:00.000Z',
    );
  });

  it('lands on midnight across a DST change', () => {
    // Romania moves off summer time on 2026-10-25; the day starts at UTC+3 and
    // the following one at UTC+2.
    expect(
      dayStart(new Date('2026-10-25T10:00:00.000Z'), 'Europe/Bucharest').toISOString(),
    ).toBe('2026-10-24T21:00:00.000Z');
    expect(
      dayStart(new Date('2026-10-26T10:00:00.000Z'), 'Europe/Bucharest').toISOString(),
    ).toBe('2026-10-25T22:00:00.000Z');
  });
});

describe('newCardsPerDay', () => {
  it('falls back to the default for anything unusable', () => {
    for (const settings of [null, {}, { newCardsPerDay: 'lots' }, { newCardsPerDay: -3 }, { newCardsPerDay: 2.5 }]) {
      expect(newCardsPerDay(settings)).toBe(DEFAULT_NEW_CARDS_PER_DAY);
    }
  });

  it('honours a set limit, including zero, and caps the absurd', () => {
    expect(newCardsPerDay({ newCardsPerDay: 40 })).toBe(40);
    expect(newCardsPerDay({ newCardsPerDay: 0 })).toBe(0);
    expect(newCardsPerDay({ newCardsPerDay: 10_000 })).toBe(200);
  });
});

describe('streaks', () => {
  it('counts back from today when today has reviews', () => {
    const days = ['2026-09-01', '2026-08-31', '2026-08-30'];
    expect(streaks(days, '2026-09-01')).toEqual({ days: 3, longest: 3 });
  });

  it('does not break the streak before today is over', () => {
    const days = ['2026-08-31', '2026-08-30'];
    expect(streaks(days, '2026-09-01').days).toBe(2);
  });

  it('is broken by a missed day', () => {
    const days = ['2026-09-01', '2026-08-30', '2026-08-29'];
    expect(streaks(days, '2026-09-01')).toEqual({ days: 1, longest: 2 });
  });

  it('crosses month and year boundaries', () => {
    const days = ['2027-01-01', '2026-12-31', '2026-12-30'];
    expect(streaks(days, '2027-01-01').days).toBe(3);
  });

  it('has no streak without reviews', () => {
    expect(streaks([], '2026-09-01')).toEqual({ days: 0, longest: 0 });
  });
});
