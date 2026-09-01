/**
 * Whether Listen mode plays the English hint before a Romanian sentence.
 *
 * The point of `auto` is that hints retire themselves: a sentence gets its
 * English first while it is still New or Learning, and stops getting one the
 * moment FSRS promotes it to Review. Nothing to turn off per sentence, and the
 * proportion of hinted sentences falls as the collection is actually studied.
 *
 * Client-safe on purpose — the player imports it, so the FSRS states are spelled
 * as the numbers `review_states.state` holds rather than pulled from `ts-fsrs`,
 * which never ships to the browser (Implementation Plan section 2.1). The test
 * asserts those numbers still match the library's enum.
 */

export const LISTEN_HINT_MODES = ['auto', 'always', 'never'] as const;
export type ListenHintMode = (typeof LISTEN_HINT_MODES)[number];

export const DEFAULT_LISTEN_HINT_MODE: ListenHintMode = 'auto';

/** ts-fsrs `State` values that still want a hint under `auto`: New, Learning. */
const HINTED_STATES = new Set([0, 1]);

/** `users.settings.listenHint`, or the default if it is unset or nonsense. */
export function listenHintMode(settings: unknown): ListenHintMode {
  const raw = (settings as { listenHint?: unknown } | null)?.listenHint;
  return LISTEN_HINT_MODES.includes(raw as ListenHintMode)
    ? (raw as ListenHintMode)
    : DEFAULT_LISTEN_HINT_MODE;
}

/**
 * A sentence with no card yet counts as New: `review_states` is created at
 * capture, so a null state means a row that predates the SRS phase, and the
 * cautious answer for something never reviewed is to hint it.
 */
export function hintsSentence(
  mode: ListenHintMode,
  srsState: number | null,
): boolean {
  if (mode === 'never') return false;
  if (mode === 'always') return true;
  return HINTED_STATES.has(srsState ?? 0);
}

export interface HintableItem {
  sentenceId: string;
  srsState: number | null;
  promptAudioUrl: string | null;
}

/** Which sentences would be hinted, in playlist order. */
export function hintedSentenceIds(
  mode: ListenHintMode,
  items: HintableItem[],
): string[] {
  return items
    .filter((item) => hintsSentence(mode, item.srsState))
    .map((item) => item.sentenceId);
}

/** Hinted sentences still waiting for their English audio to be synthesized. */
export function missingHintAudio(
  mode: ListenHintMode,
  items: HintableItem[],
): string[] {
  return items
    .filter((item) => hintsSentence(mode, item.srsState) && !item.promptAudioUrl)
    .map((item) => item.sentenceId);
}
