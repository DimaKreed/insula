import { describe, expect, it } from 'vitest';

import {
  audioHash,
  normalizeText,
  playlistManifestHash,
  translationHash,
} from './hash';

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

describe('audioHash', () => {
  const args = ['azure', 'ro-RO-AlinaNeural', 'ro-RO', 'Întârzii cinci minute.', 'mp3'] as const;

  it('is stable across formatting differences in the text', () => {
    expect(audioHash(...args)).toBe(
      audioHash('azure', 'ro-RO-AlinaNeural', 'ro-RO', '  Întârzii   cinci minute.  ', 'mp3'),
    );
  });

  it('changes with the voice, the provider and the format', () => {
    const base = audioHash(...args);
    expect(audioHash('azure', 'ro-RO-EmilNeural', 'ro-RO', args[3], 'mp3')).not.toBe(base);
    expect(audioHash('google', 'ro-RO-AlinaNeural', 'ro-RO', args[3], 'mp3')).not.toBe(base);
    expect(audioHash('azure', 'ro-RO-AlinaNeural', 'ro-RO', args[3], 'wav')).not.toBe(base);
  });

  it('differs from the translation hash of the same text', () => {
    expect(audioHash(...args)).not.toBe(
      translationHash(args[3], 'en', 'ro', 'gemini'),
    );
  });
});

/**
 * The reason the hint set is folded into the compiled track's manifest hash:
 * a card graduating out of hints has to invalidate a track whose segments and
 * gaps are otherwise unchanged.
 */
describe('playlistManifestHash', () => {
  const base = {
    mode: 'listen',
    segmentHashes: ['s1', 's2', 's3'],
    gaps: { listen: 1000, hint: 400 },
  };

  it('changes when a sentence stops being hinted', () => {
    const before = playlistManifestHash({
      ...base,
      hintedSentenceIds: ['a', 'c'],
    });
    const after = playlistManifestHash({ ...base, hintedSentenceIds: ['a'] });
    expect(before).not.toBe(after);
  });

  it('is stable when nothing changed', () => {
    const input = { ...base, hintedSentenceIds: ['a', 'c'] };
    expect(playlistManifestHash(input)).toBe(playlistManifestHash(input));
  });

  it('distinguishes modes and gap changes', () => {
    const hinted = { ...base, hintedSentenceIds: ['a'] };
    expect(playlistManifestHash(hinted)).not.toBe(
      playlistManifestHash({ ...hinted, mode: 'recall' }),
    );
    expect(playlistManifestHash(hinted)).not.toBe(
      playlistManifestHash({ ...hinted, gaps: { listen: 1500, hint: 400 } }),
    );
  });
});
