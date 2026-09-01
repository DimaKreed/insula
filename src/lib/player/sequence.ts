import {
  hintsSentence,
  type HintableItem,
  type ListenHintMode,
} from './listen-hints';

/**
 * What the player does when a clip finishes.
 *
 * Pulled out of the component because Listen now plays a sentence in up to two
 * parts: the ordering (English hint → short beat → Romanian → gap → next
 * sentence) is the behaviour worth testing, and inside an `ended` handler it
 * cannot be. The component keeps the audio element and the timers; this decides
 * what plays next and how long the silence before it lasts.
 */

export type PlayerMode = 'listen' | 'loop' | 'shadow' | 'recall';

/** Which half of a sentence is playing: the English hint, or the Romanian. */
export type Phase = 'hint' | 'target';

/** Gap between sentences in Listen mode. */
export const LISTEN_GAP_MS = 1000;
/** The shorter beat between an English hint and its Romanian sentence. */
export const HINT_GAP_MS = 400;

export interface Step {
  index: number;
  phase: Phase;
  /** Silence before this step starts, in milliseconds. */
  waitMs: number;
}

export interface SequenceInput {
  mode: PlayerMode;
  hintMode: ListenHintMode;
  items: HintableItem[];
  /** The sentence that just played. */
  index: number;
  /** The half of it that just played. */
  phase: Phase;
  /** Shadow's pause is a multiple of the clip that just ended. */
  gapFactor: number;
  clipMs: number;
}

/**
 * Whether a sentence opens with its English hint. Everything outside Listen is
 * Romanian only, and a hint that has not been synthesized yet is simply skipped
 * — the sentence plays without one and picks it up on the next lap.
 */
export function opensWithHint(
  mode: PlayerMode,
  hintMode: ListenHintMode,
  item: HintableItem | undefined,
): boolean {
  if (!item || mode !== 'listen') return false;
  return !!item.promptAudioUrl && hintsSentence(hintMode, item.srsState);
}

/** The phase a sentence starts on. */
export function startPhase(
  mode: PlayerMode,
  hintMode: ListenHintMode,
  item: HintableItem | undefined,
): Phase {
  return opensWithHint(mode, hintMode, item) ? 'hint' : 'target';
}

export function nextStep(input: SequenceInput): Step | null {
  const { mode, hintMode, items, index, phase, gapFactor, clipMs } = input;
  if (items.length === 0) return null;

  // Half a sentence done: its Romanian follows the hint after a short beat.
  if (phase === 'hint') {
    return { index, phase: 'target', waitMs: HINT_GAP_MS };
  }

  if (mode === 'loop') {
    return { index, phase: 'target', waitMs: LISTEN_GAP_MS };
  }

  const next = (index + 1) % items.length;
  return {
    index: next,
    phase: startPhase(mode, hintMode, items[next]),
    waitMs:
      mode === 'shadow'
        ? Math.round(clipMs * gapFactor)
        : LISTEN_GAP_MS,
  };
}
