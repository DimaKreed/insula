import { describe, expect, it } from 'vitest';

import { normalizeText, translationHash } from './hash';

describe('normalizeText', () => {
  it('collapses whitespace and trims', () => {
    expect(normalizeText('  I am   running\tlate  ')).toBe('i am running late');
  });

  it('is case-insensitive', () => {
    expect(normalizeText('THE DEADLINE MOVED')).toBe(
      normalizeText('The deadline moved'),
    );
  });

  it('keeps punctuation — a question is not the statement', () => {
    expect(normalizeText("Let's go.")).not.toBe(normalizeText("Let's go?"));
  });

  it('normalizes Romanian diacritics so composed and decomposed forms match', () => {
    const composed = 'Întârzii cinci minute.';
    const decomposed = composed.normalize('NFD');
    expect(decomposed).not.toBe(composed); // the inputs really do differ
    expect(normalizeText(decomposed)).toBe(normalizeText(composed));
  });
});

describe('translationHash', () => {
  it('is stable for text that differs only in whitespace and case', () => {
    expect(translationHash('I am late', 'en', 'ro', 'gemini')).toBe(
      translationHash('  i  am   late ', 'en', 'ro', 'gemini'),
    );
  });

  it('separates language pairs', () => {
    expect(translationHash('I am late', 'en', 'ro', 'gemini')).not.toBe(
      translationHash('I am late', 'en', 'es', 'gemini'),
    );
  });

  it('separates different sentences', () => {
    expect(translationHash('I am late', 'en', 'ro', 'gemini')).not.toBe(
      translationHash('I am early', 'en', 'ro', 'gemini'),
    );
  });

  it('separates providers, so a provider switch re-translates instead of reusing the cache', () => {
    expect(translationHash('I am late', 'en', 'ro', 'gemini')).not.toBe(
      translationHash('I am late', 'en', 'ro', 'claude'),
    );
  });
});
