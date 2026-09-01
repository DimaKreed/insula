import { z } from 'zod';

import {
  TRANSLATION_SYSTEM_PROMPT,
  translationUserMessage,
} from '@/lib/ai/prompts';

import {
  type TokenUsage,
  type TranslationProvider,
  type TranslationProviderName,
} from './provider';

/**
 * Translation, written once against `provider.complete()` rather than once per
 * adapter. The prompt, the schema, the alignment and the failure message are
 * identical on every provider — only the transport differs, and that is the
 * adapter's whole job.
 */

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
  costMicros: number;
  model: string;
  provider: TranslationProviderName;
}

/**
 * OpenAPI subset, for adapters that constrain decoding with a schema. `note` is
 * not required: most sentences need none, and both providers are told to omit
 * it rather than invent one.
 */
const responseSchema = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          translation: { type: 'string' },
          note: { type: 'string' },
          lemmas: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'translation', 'lemmas'],
        propertyOrdering: ['id', 'translation', 'note', 'lemmas'],
      },
    },
  },
  required: ['translations'],
} as const;

/** `note` is nullish, not optional: Gemini omits it where Claude returns null. */
const payloadSchema = z.object({
  translations: z.array(
    z.object({
      id: z.string(),
      translation: z.string(),
      note: z.string().nullish(),
      lemmas: z.array(z.string()).default([]),
    }),
  ),
});

/** Guards the input against the caller batching more than the provider allows. */
function assertBatch(provider: TranslationProvider, items: TranslationInput[]) {
  if (items.length === 0) {
    throw new Error('translateBatch called with no sentences');
  }
  if (items.length > provider.batchSize) {
    throw new Error(
      `translateBatch called with ${items.length} sentences; ${provider.name}'s cap is ${provider.batchSize}`,
    );
  }
}

/**
 * Maps model output back onto the requested sentences, in request order.
 * Throws if a sentence came back missing or empty — the caller marks those rows
 * 'error' so the UI can offer a per-row Retry.
 */
export function alignTranslations(
  provider: TranslationProviderName,
  items: TranslationInput[],
  raw: z.infer<typeof payloadSchema>['translations'],
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
      lemmas: [...new Set(match.lemmas.map((l) => l.trim()).filter(Boolean))],
    };
  });
}

export async function translateBatch(
  provider: TranslationProvider,
  items: TranslationInput[],
  sourceLang: string,
  targetLang: string,
): Promise<TranslationBatchResult> {
  assertBatch(provider, items);

  const result = await provider.complete({
    system: TRANSLATION_SYSTEM_PROMPT,
    user: translationUserMessage(items, sourceLang, targetLang),
    responseSchema,
    parse: payloadSchema,
    maxOutputTokens: 8000,
    // Translation is mechanical: low temperature, no creative drift.
    temperature: 0.2,
    label: 'translation',
  });

  return {
    translations: alignTranslations(
      result.provider,
      items,
      result.data.translations,
    ),
    usage: result.usage,
    costMicros: result.costMicros,
    model: result.model,
    provider: result.provider,
  };
}
