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

/**
 * Key for `audio_assets` and for the object-storage key itself.
 *
 * Provider and voice are part of it because `audio_assets` is global: two
 * users' identical sentences share one file only when they would have produced
 * byte-identical audio. Format is included so a change of the canonical output
 * format re-synthesizes rather than serving the old encoding.
 */
export function audioHash(
  provider: string,
  voiceId: string,
  lang: string,
  text: string,
  format: string,
): string {
  return sha256([provider, voiceId, lang, normalizeText(text), format]);
}

/**
 * Key for `playlist_tracks.manifest_hash` — what tells Phase 4's compiler that
 * a compiled single-file track no longer matches the island it was built from.
 *
 * The ordered hinted-sentence ids are part of it because Listen's English hints
 * are decided per card from `review_states.state`: promote one sentence from
 * Learning to Review and the track that has its hint baked in is stale, even
 * though the segments and the gaps are untouched. Folding them in makes that
 * invalidation automatic; recompiling only re-concatenates segments that
 * already exist, so no TTS call follows from it.
 *
 * Not yet called from anywhere — `playlist_tracks` arrives with Phase 4. It
 * lives here now so the compiler is written against a hash that already
 * accounts for hints rather than one that has to be widened afterwards, which
 * would silently keep serving every track compiled before the change.
 */
export function playlistManifestHash(input: {
  /** listen | shadow | recall. */
  mode: string;
  /** `audio_assets.content_hash` of each segment, in playback order. */
  segmentHashes: string[];
  /** Sentences whose English hint is baked in, in playback order. */
  hintedSentenceIds: string[];
  /** Every gap length baked into the track, in milliseconds. */
  gaps: Record<string, number>;
}): string {
  return sha256([
    input.mode,
    input.segmentHashes.join(','),
    input.hintedSentenceIds.join(','),
    Object.entries(input.gaps)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join(','),
  ]);
}
