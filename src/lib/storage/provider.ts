/**
 * Provider-agnostic object storage, mirroring the translate/TTS adapter shape:
 * selected by env var, an unconfigured provider never breaks a configured one,
 * and every adapter returns the same result so callers stay identical.
 *
 * Keys are content hashes (Implementation Plan section 3), so `put` is
 * idempotent by construction — writing the same key twice writes the same bytes.
 */

export type StorageProviderName = 'local' | 'r2';

export interface PutInput {
  /** Content-addressed key, e.g. 'audio/<sha256>.mp3'. */
  key: string;
  body: Buffer;
  contentType: string;
}

export interface PutResult {
  key: string;
  /** URL the browser plays from. Relative for `local`, absolute for `r2`. */
  url: string;
}

export type ConfigCheck = { ok: true } | { ok: false; missing: string[] };

export interface StorageProvider {
  readonly name: StorageProviderName;
  isConfigured(): ConfigCheck;
  put(input: PutInput): Promise<PutResult>;
  /** True when the key already holds an object — lets a caller skip an upload. */
  exists(key: string): Promise<boolean>;
  url(key: string): string;
}

export function assertConfigured(provider: StorageProvider): void {
  const check = provider.isConfigured();
  if (!check.ok) {
    throw new Error(
      `Storage provider "${provider.name}" is not configured — set ${check.missing.join(', ')} in .env.local`,
    );
  }
}

/** The one place that decides what an audio object is called. */
export function audioKey(contentHash: string): string {
  return `audio/${contentHash}.mp3`;
}
