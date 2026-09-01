import { State } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';

import type { HintableItem } from './listen-hints';
import {
  HINT_GAP_MS,
  LISTEN_GAP_MS,
  nextStep,
  startPhase,
  type Phase,
  type PlayerMode,
  type SequenceInput,
} from './sequence';

/**
 * The island the end-to-end check runs against, in miniature: a card already in
 * Review followed by a New one, both with English audio available.
 */
const items: HintableItem[] = [
  {
    sentenceId: 'review',
    srsState: State.Review,
    promptAudioUrl: '/audio/review-en.mp3',
  },
  {
    sentenceId: 'new',
    srsState: State.New,
    promptAudioUrl: '/audio/new-en.mp3',
  },
];

/** Plays from `index` and records what is heard, with the silence between. */
function playthrough(
  mode: PlayerMode,
  hintMode: SequenceInput['hintMode'],
  steps: number,
  { index = 0, gapFactor = 1.5, clipMs = 2000 } = {},
): string[] {
  let phase: Phase = startPhase(mode, hintMode, items[index]);
  const heard = [`${items[index].sentenceId}:${phase}`];

  for (let i = 0; i < steps; i++) {
    const step = nextStep({
      mode,
      hintMode,
      items,
      index,
      phase,
      gapFactor,
      clipMs,
    })!;
    heard.push(`+${step.waitMs}ms`, `${items[step.index].sentenceId}:${step.phase}`);
    index = step.index;
    phase = step.phase;
  }
  return heard;
}

describe('Listen mode, auto hints', () => {
  it('hints the New sentence and not the Review one', () => {
    expect(playthrough('listen', 'auto', 3)).toEqual([
      // The Review card: Romanian straight away, no English in front of it.
      'review:target',
      `+${LISTEN_GAP_MS}ms`,
      // The New card: English first, then its Romanian after a shorter beat.
      'new:hint',
      `+${HINT_GAP_MS}ms`,
      'new:target',
      `+${LISTEN_GAP_MS}ms`,
      'review:target',
    ]);
  });

  it('never pauses for the user to speak — every gap is a fixed beat', () => {
    const gaps = playthrough('listen', 'auto', 3).filter((s) =>
      s.startsWith('+'),
    );
    expect(gaps).toEqual([
      `+${LISTEN_GAP_MS}ms`,
      `+${HINT_GAP_MS}ms`,
      `+${LISTEN_GAP_MS}ms`,
    ]);
  });
});

describe('Listen mode, always and never', () => {
  it('hints the Review sentence too under always', () => {
    expect(playthrough('listen', 'always', 1)).toEqual([
      'review:hint',
      `+${HINT_GAP_MS}ms`,
      'review:target',
    ]);
  });

  it('plays Romanian only under never', () => {
    expect(playthrough('listen', 'never', 2)).toEqual([
      'review:target',
      `+${LISTEN_GAP_MS}ms`,
      'new:target',
      `+${LISTEN_GAP_MS}ms`,
      'review:target',
    ]);
  });
});

describe('a hint that has not been synthesized yet', () => {
  it('is skipped, and the sentence plays Romanian only', () => {
    const pending: HintableItem[] = [
      { sentenceId: 'new', srsState: State.New, promptAudioUrl: null },
    ];
    expect(startPhase('listen', 'auto', pending[0])).toBe('target');
    expect(
      nextStep({
        mode: 'listen',
        hintMode: 'auto',
        items: pending,
        index: 0,
        phase: 'target',
        gapFactor: 1.5,
        clipMs: 2000,
      }),
    ).toEqual({ index: 0, phase: 'target', waitMs: LISTEN_GAP_MS });
  });
});

describe('the other modes are unchanged', () => {
  it('Loop one repeats the Romanian, hints or no hints', () => {
    expect(playthrough('loop', 'always', 2)).toEqual([
      'review:target',
      `+${LISTEN_GAP_MS}ms`,
      'review:target',
      `+${LISTEN_GAP_MS}ms`,
      'review:target',
    ]);
  });

  it('Shadow keeps its duration-scaled pause and no hint', () => {
    expect(playthrough('shadow', 'always', 1, { clipMs: 2000 })).toEqual([
      'review:target',
      '+3000ms',
      'new:target',
    ]);
  });
});
