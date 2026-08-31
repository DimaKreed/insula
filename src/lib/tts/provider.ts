/**
 * Provider-agnostic TTS contract.
 *
 * Every adapter emits the same canonical format so that Phase 4 can compile a
 * playlist track by byte-concatenating MP3 segments (see Implementation Plan
 * section 2.2): MP3, mono, constant bitrate. 44.1 kHz is the target sample rate;
 * where a provider cannot offer it, the adapter documents what it emits instead.
 * Segments concatenated into one track must all come from the same provider and
 * voice, which the audio_assets content hash already guarantees.
 */

export type TtsProviderName = 'elevenlabs' | 'google' | 'azure' | 'openai';

export interface SynthesizeInput {
  text: string;
  /** BCP-47 language tag, e.g. 'ro-RO'. */
  lang: string;
  voiceId: string;
}

export interface SynthesizeResult {
  audio: Buffer;
  format: 'mp3';
  /** Only set when the provider reports it; otherwise derived downstream. */
  durationMs?: number;
  charCount: number;
}

export interface Voice {
  id: string;
  label: string;
  /** BCP-47 language tag this voice is intended for. */
  lang: string;
}

export type ConfigCheck = { ok: true } | { ok: false; missing: string[] };

export interface TtsProvider {
  readonly name: TtsProviderName;
  /**
   * Micro-dollars per character on the tier we use, for `usage_events`.
   * Mirrors `TranslationBatchResult.costMicros`: 0 where a free tier covers us.
   */
  readonly costMicrosPerChar: number;
  /**
   * Which env vars are missing, if any. Never throws — an unconfigured provider
   * must not break the ones that are configured.
   */
  isConfigured(): ConfigCheck;
  /** Suggested voices for the bake-off and for settings UI. */
  voices(): Voice[];
  synthesize(input: SynthesizeInput): Promise<SynthesizeResult>;
}

/** Adapters call this at the top of synthesize() to fail with a clear message. */
export function assertConfigured(provider: TtsProvider): void {
  const check = provider.isConfigured();
  if (!check.ok) {
    throw new Error(
      `TTS provider "${provider.name}" is not configured — set ${check.missing.join(', ')} in .env.local`,
    );
  }
}

/**
 * fetch that rides out throttling and transient server errors.
 *
 * Free tiers are the reason this exists: Azure's F0 caps neural synthesis at
 * roughly 20 requests a minute and answers the 21st with 429, which must not
 * become a failed sentence. `Retry-After` is honoured when the provider sends
 * one; otherwise the wait doubles from a second, with jitter so parallel
 * workers do not resynchronize into the next burst.
 */
export async function fetchRetrying(
  input: string | URL,
  init: RequestInit,
  attempts = 6,
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(input, init);
    if (res.ok || attempt >= attempts) return res;
    if (res.status !== 429 && res.status < 500) return res;

    const retryAfter = Number(res.headers.get('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 2 ** (attempt - 1) * 1000 + Math.random() * 500;
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

export function requestFailed(
  provider: TtsProviderName,
  status: number,
  body: string,
): Error {
  return new Error(
    `${provider} TTS request failed (HTTP ${status}): ${body.slice(0, 500)}`,
  );
}
