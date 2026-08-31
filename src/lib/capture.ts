import { MAX_CAPTURE_LINES, MAX_SENTENCE_CHARS } from './quota';
import { normalizeText } from './hash';

export type ParseResult =
  | { ok: true; lines: string[] }
  | { ok: false; error: string };

/**
 * Turns the capture box's raw text into the sentences to store: one per line,
 * blanks dropped, duplicates within the paste collapsed. Kept pure so the rules
 * are unit-testable without a database.
 */
export function parseCaptureLines(raw: string): ParseResult {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const text = line.replace(/\s+/gu, ' ').trim();
    if (text === '') continue;
    if (text.length > MAX_SENTENCE_CHARS) {
      return {
        ok: false,
        error: `One line is ${text.length} characters — the limit is ${MAX_SENTENCE_CHARS}. Split it into shorter sentences.`,
      };
    }
    const key = normalizeText(text);
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(text);
  }

  if (lines.length === 0) {
    return { ok: false, error: 'Add at least one sentence.' };
  }
  if (lines.length > MAX_CAPTURE_LINES) {
    return {
      ok: false,
      error: `That's ${lines.length} sentences — add at most ${MAX_CAPTURE_LINES} at a time.`,
    };
  }
  return { ok: true, lines };
}
