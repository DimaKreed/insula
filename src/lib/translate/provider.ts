/**
 * Provider-agnostic translation contract.
 *
 * Mirrors `src/lib/tts/provider.ts`: adapters are selected by env var, an
 * unconfigured one never breaks a configured one, and every adapter returns the
 * same shape so the caller's error handling and usage accounting stay identical.
 *
 * All adapters share one prompt (`src/lib/ai/prompts.ts`) so output stays
 * comparable and TRANSLATION_PROMPT_VERSION keeps its meaning across providers.
 */

export type TranslationProviderName = 'gemini' | 'claude';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface TranslationInput {
  id: string;
  text: string;
}

export interface TranslationOutput {
  id: string;
  targetText: string;
  translationNote: string | null;
  lemmas: string[];
}

export interface TranslationBatchResult {
  translations: TranslationOutput[];
  usage: TokenUsage;
  /** Micro-dollars, the unit `usage_events.cost_micros` stores. 0 on free tiers. */
  costMicros: number;
  model: string;
  provider: TranslationProviderName;
}

export type ConfigCheck = { ok: true } | { ok: false; missing: string[] };

export interface TranslationProvider {
  readonly name: TranslationProviderName;
  /** Sentences per call. Differs per provider: output-token and rate limits differ. */
  readonly batchSize: number;
  /**
   * Which env vars are missing, if any. Never throws — an unconfigured provider
   * must not break the ones that are configured.
   */
  isConfigured(): ConfigCheck;
  translateBatch(
    items: TranslationInput[],
    sourceLang: string,
    targetLang: string,
  ): Promise<TranslationBatchResult>;
}

/** Adapters call this at the top of translateBatch() to fail with a clear message. */
export function assertConfigured(provider: TranslationProvider): void {
  const check = provider.isConfigured();
  if (!check.ok) {
    throw new Error(
      `Translation provider "${provider.name}" is not configured — set ${check.missing.join(', ')} in .env.local`,
    );
  }
}

export function requestFailed(
  provider: TranslationProviderName,
  status: number,
  body: string,
): Error {
  return new Error(
    `${provider} translation request failed (HTTP ${status}): ${body.slice(0, 500)}`,
  );
}

/** Guards every adapter's input against the caller batching too much. */
export function assertBatch(
  provider: TranslationProvider,
  items: TranslationInput[],
): void {
  if (items.length === 0) {
    throw new Error('translateBatch called with no sentences');
  }
  if (items.length > provider.batchSize) {
    throw new Error(
      `translateBatch called with ${items.length} sentences; ${provider.name}'s cap is ${provider.batchSize}`,
    );
  }
}

/** What a model returns per sentence, before alignment. `note` shape varies by provider. */
export interface RawTranslation {
  id: string;
  translation: string;
  note?: string | null;
  lemmas?: string[];
}

/**
 * Maps model output back onto the requested sentences, in request order.
 * Throws if a sentence came back missing or empty — the caller marks those rows
 * 'error' so the UI can offer a per-row Retry.
 */
export function alignTranslations(
  provider: TranslationProviderName,
  items: TranslationInput[],
  raw: RawTranslation[],
): TranslationOutput[] {
  const byId = new Map(raw.map((t) => [t.id, t]));
  return items.map((item) => {
    const match = byId.get(item.id);
    if (!match || match.translation.trim() === '') {
      throw new Error(`${provider} returned no translation for sentence ${item.id}`);
    }
    return {
      id: item.id,
      targetText: match.translation.trim(),
      translationNote: match.note?.trim() ? match.note.trim() : null,
      lemmas: [
        ...new Set((match.lemmas ?? []).map((l) => l.trim()).filter(Boolean)),
      ],
    };
  });
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
