import { describe, expect, it } from 'vitest';

import {
  cardFromRow,
  cardToRow,
  formatInterval,
  gradeCard,
  newCard,
  previewGrades,
  Rating,
  serializeReviewLog,
  State,
} from './fsrs';

const NOW = new Date('2026-09-01T09:00:00.000Z');

describe('card round-trip', () => {
  it('survives a trip through the review_states columns', () => {
    const card = gradeCard(newCard(NOW), NOW, Rating.Good).card;
    expect(cardFromRow(cardToRow(card))).toEqual(card);
  });

  it('a new card is due immediately and in state New', () => {
    const row = cardToRow(newCard(NOW));
    expect(row.state).toBe(State.New);
    expect(row.due).toEqual(NOW);
    expect(row.lastReview).toBeNull();
    expect(row.reps).toBe(0);
  });

  it('keeps Card fields that have no column of their own', () => {
    const card = { ...newCard(NOW), retrievability: 0.42 } as ReturnType<
      typeof newCard
    >;
    const row = cardToRow(card);
    expect(row.extra).toEqual({ retrievability: 0.42 });
    expect(cardFromRow(row)).toMatchObject({ retrievability: 0.42 });
  });
});

describe('grading', () => {
  it('moves a new card out of New and schedules it ahead', () => {
    const { card, log } = gradeCard(newCard(NOW), NOW, Rating.Good);
    expect(card.state).not.toBe(State.New);
    expect(card.reps).toBe(1);
    expect(card.due.getTime()).toBeGreaterThan(NOW.getTime());
    expect(card.last_review).toEqual(NOW);
    // The log records the state the card was in *before* the grade — what the
    // daily new-card count relies on.
    expect(log.state).toBe(State.New);
    expect(log.rating).toBe(Rating.Good);
  });

  it('Again on a learned card counts a lapse', () => {
    let card = newCard(NOW);
    for (const [at, rating] of [
      [NOW, Rating.Good],
      [new Date('2026-09-02T09:00:00.000Z'), Rating.Good],
      [new Date('2026-09-10T09:00:00.000Z'), Rating.Good],
    ] as const) {
      card = gradeCard(card, at, rating).card;
    }
    expect(card.state).toBe(State.Review);

    const lapsed = gradeCard(card, new Date('2026-09-25T09:00:00.000Z'), Rating.Again).card;
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.state).toBe(State.Relearning);
  });

  it('serializes the log dates the way jsonb hands them back', () => {
    const { log } = gradeCard(newCard(NOW), NOW, Rating.Hard);
    const serialized = serializeReviewLog(log);
    expect(serialized.review).toBe(NOW.toISOString());
    expect(serialized.due).toBe(log.due.toISOString());
    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
  });
});

describe('previewGrades', () => {
  it('labels all four buttons, hardest grade soonest', () => {
    const options = previewGrades(newCard(NOW), NOW);
    expect(options.map((o) => o.label)).toEqual([
      'Again',
      'Hard',
      'Good',
      'Easy',
    ]);
    for (const option of options) {
      expect(option.interval).toMatch(/^\d+(\.\d)?(m|h|d|mo|y)$/);
    }

    const dues = ([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const).map(
      (rating) => gradeCard(newCard(NOW), NOW, rating).card.due.getTime(),
    );
    expect([...dues].sort((a, b) => a - b)).toEqual(dues);
  });
});

describe('formatInterval', () => {
  const cases: [number, string][] = [
    [30_000, '1m'],
    [10 * 60_000, '10m'],
    [90 * 60_000, '2h'],
    [2 * 86_400_000, '2d'],
    [30 * 86_400_000, '30d'],
    [60 * 86_400_000, '2mo'],
    [400 * 86_400_000, '1.1y'],
    [4000 * 86_400_000, '11y'],
  ];

  for (const [ms, expected] of cases) {
    it(`${ms}ms reads as ${expected}`, () => {
      expect(formatInterval(NOW, new Date(NOW.getTime() + ms))).toBe(expected);
    });
  }
});
