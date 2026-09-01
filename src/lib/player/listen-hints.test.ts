import { State } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LISTEN_HINT_MODE,
  hintedSentenceIds,
  hintsSentence,
  listenHintMode,
  missingHintAudio,
} from './listen-hints';

/** The module hardcodes these numbers so ts-fsrs stays out of the browser. */
describe('FSRS state numbers', () => {
  it('are the ones the hint rule is written against', () => {
    expect([State.New, State.Learning, State.Review, State.Relearning]).toEqual(
      [0, 1, 2, 3],
    );
  });
});

describe('listenHintMode', () => {
  it('defaults when unset or nonsense', () => {
    expect(DEFAULT_LISTEN_HINT_MODE).toBe('auto');
    for (const settings of [null, {}, { listenHint: 'sometimes' }, 'nope']) {
      expect(listenHintMode(settings)).toBe('auto');
    }
  });

  it('reads the three valid values', () => {
    expect(listenHintMode({ listenHint: 'always' })).toBe('always');
    expect(listenHintMode({ listenHint: 'never' })).toBe('never');
    expect(listenHintMode({ listenHint: 'auto' })).toBe('auto');
  });
});

describe('hintsSentence', () => {
  it('under auto, hints New and Learning only', () => {
    expect(hintsSentence('auto', State.New)).toBe(true);
    expect(hintsSentence('auto', State.Learning)).toBe(true);
    expect(hintsSentence('auto', State.Review)).toBe(false);
    expect(hintsSentence('auto', State.Relearning)).toBe(false);
  });

  it('treats a card-less sentence as New', () => {
    expect(hintsSentence('auto', null)).toBe(true);
  });

  it('ignores the state under always and never', () => {
    for (const state of [0, 1, 2, 3, null]) {
      expect(hintsSentence('always', state)).toBe(true);
      expect(hintsSentence('never', state)).toBe(false);
    }
  });
});

const items = [
  { sentenceId: 'a', srsState: State.New, promptAudioUrl: '/audio/a-en.mp3' },
  { sentenceId: 'b', srsState: State.Review, promptAudioUrl: null },
  { sentenceId: 'c', srsState: State.Learning, promptAudioUrl: null },
];

describe('hintedSentenceIds', () => {
  it('lists the hinted sentences in playlist order', () => {
    expect(hintedSentenceIds('auto', items)).toEqual(['a', 'c']);
    expect(hintedSentenceIds('always', items)).toEqual(['a', 'b', 'c']);
    expect(hintedSentenceIds('never', items)).toEqual([]);
  });
});

describe('missingHintAudio', () => {
  it('is the hinted sentences that have no English audio yet', () => {
    expect(missingHintAudio('auto', items)).toEqual(['c']);
    expect(missingHintAudio('always', items)).toEqual(['b', 'c']);
    expect(missingHintAudio('never', items)).toEqual([]);
  });
});
