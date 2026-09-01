/**
 * Provider-agnostic AI contract.
 *
 * Mirrors `src/lib/tts/provider.ts`: adapters are selected by env var, an
 * unconfigured one never breaks a configured one, and every adapter returns the
 * same shape so the caller's error handling and usage accounting stay identical.
 *
 * Adapters expose exactly one primitive — `complete()`, a structured JSON
 * completion (system prompt + user message + response schema). Every feature
 * that needs the model is a caller of it: `translateBatch` in `./translate.ts`,
 * island generation in `src/lib/ai/island.ts`. Adding a feature means adding a
 * prompt and a schema, not touching the adapters.
 *
 * Prompts live in `src/lib/ai/prompts.ts` so output stays comparable across
 * providers and the *_PROMPT_VERSION constants keep their meaning.
 */

import type { z } from 'zod';

export type TranslationProviderName = 'gemini' | 'claude';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface StructuredRequest<T> {
  /**
   * The stable, cacheable prefix. Nothing per-request belongs here — it is what
   * `cache_control` is applied to on providers that support prompt caching.
   */
  system: string;
  /** The volatile half: this request's actual input. */
  user: string;
  /**
   * Response schema in the OpenAPI subset, for providers that constrain
   * decoding with one (Gemini). Hand-written rather than derived from `parse`:
   * the subset is narrower than JSON Schema and narrower than zod.
   */
  responseSchema: Record<string, unknown>;
  /** Parses what came back. Also the schema Claude's structured output is given. */
  parse: z.ZodType<T>;
  maxOutputTokens: number;
  /** 0.2 for mechanical work like translation; higher where variety is the point. */
  temperature: number;
  /** Short label for error messages, e.g. 'translation', 'island generation'. */
  label: string;
}

export interface StructuredResult<T> {
  data: T;
  usage: TokenUsage;
  /** Micro-dollars, the unit `usage_events.cost_micros` stores. 0 on free tiers. */
  costMicros: number;
  model: string;
  provider: TranslationProviderName;
}

export type ConfigCheck = { ok: true } | { ok: false; missing: string[] };

export interface TranslationProvider {
  readonly name: TranslationProviderName;
  /** Sentences per translation call. Differs per provider: output and rate limits differ. */
  readonly batchSize: number;
  /**
   * Which env vars are missing, if any. Never throws — an unconfigured provider
   * must not break the ones that are configured.
   */
  isConfigured(): ConfigCheck;
  /** One structured JSON completion. The only thing adapters implement. */
  complete<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

/** Adapters call this at the top of complete() to fail with a clear message. */
export function assertConfigured(provider: TranslationProvider): void {
  const check = provider.isConfigured();
  if (!check.ok) {
    throw new Error(
      `AI provider "${provider.name}" is not configured — set ${check.missing.join(', ')} in .env.local`,
    );
  }
}

export function requestFailed(
  provider: TranslationProviderName,
  status: number,
  body: string,
): Error {
  return new Error(
    `${provider} request failed (HTTP ${status}): ${body.slice(0, 500)}`,
  );
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
