import { describe, expect, it } from 'vitest';

import { parseCaptureLines } from './capture';
import { MAX_CAPTURE_LINES, MAX_SENTENCE_CHARS } from './quota';

describe('parseCaptureLines', () => {
  it('splits on newlines and drops blanks', () => {
    const result = parseCaptureLines('One.\n\n  \nTwo.\n');
    expect(result).toEqual({ ok: true, lines: ['One.', 'Two.'] });
  });

  it('collapses inner whitespace but keeps the original casing', () => {
    const result = parseCaptureLines('The   Deadline\tmoved again.');
    expect(result.ok && result.lines[0]).toBe('The Deadline moved again.');
  });

  it('collapses duplicates within one paste', () => {
    const result = parseCaptureLines("Let's go.\nlet's   GO.\nAnd then?");
    expect(result.ok && result.lines).toEqual(["Let's go.", 'And then?']);
  });

  it('rejects an empty paste', () => {
    expect(parseCaptureLines('   \n\n')).toEqual({
      ok: false,
      error: 'Add at least one sentence.',
    });
  });

  it('rejects a line over the character cap', () => {
    const result = parseCaptureLines('a'.repeat(MAX_SENTENCE_CHARS + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(String(MAX_SENTENCE_CHARS));
  });

  it('accepts a line exactly at the character cap', () => {
    expect(parseCaptureLines('a'.repeat(MAX_SENTENCE_CHARS)).ok).toBe(true);
  });

  it('rejects more lines than one capture allows', () => {
    const lines = Array.from(
      { length: MAX_CAPTURE_LINES + 1 },
      (_, i) => `Sentence number ${i}.`,
    ).join('\n');
    const result = parseCaptureLines(lines);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(String(MAX_CAPTURE_LINES));
  });

  it('handles CRLF pastes from Windows', () => {
    const result = parseCaptureLines('One.\r\nTwo.\r\n');
    expect(result.ok && result.lines).toEqual(['One.', 'Two.']);
  });
});
