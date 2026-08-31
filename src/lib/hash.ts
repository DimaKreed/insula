import { createHash } from 'node:crypto';

/** Bumped whenever the translation prompt changes, so the cache can't serve stale output. */
export const TRANSLATION_PROMPT_VERSION = 'v1';

/**
 * Canonical form of a sentence for hashing and duplicate detection: NFC,
 * collapsed whitespace, trimmed, lowercased. Punctuation is kept — "Let's go."
 * and "Let's go?" are different sentences to translate.
 */
export function normalizeText(text: string): string {
  return text.normalize('NFC').replace(/\s+/gu, ' ').trim().toLowerCase();
}

function sha256(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

/**
 * Key for `translation_cache` and `sentences.content_hash`.
 *
 * The provider is part of the key: `translation_cache` is global, so without it
 * a switch of TRANSLATION_PROVIDER would silently keep serving the previous
 * provider's output for text already cached.
 */
export function translationHash(
  sourceText: string,
  sourceLang: string,
  targetLang: string,
  provider: string,
): string {
  return sha256([
    normalizeText(sourceText),
    sourceLang,
    targetLang,
    TRANSLATION_PROMPT_VERSION,
    provider,
  ]);
}
