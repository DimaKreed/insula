import { z } from 'zod';

import {
  TRANSLATION_SYSTEM_PROMPT,
  translationUserMessage,
} from '@/lib/ai/prompts';

import {
  alignTranslations,
  assertBatch,
  assertConfigured,
  requestFailed,
  type ConfigCheck,
  type TranslationBatchResult,
  type TranslationInput,
  type TranslationProvider,
} from './provider';

/**
 * Google Gemini via the REST API — raw fetch, no SDK, like every TTS adapter.
 *
 * Runs on the free tier: Flash models are free of charge, so costMicros is 0
 * and only the sentence count feeds quotas. Two free-tier caveats, both
 * deliberate (see Implementation Plan section 7): Google states free-tier
 * content may be used to improve its products, and enabling billing on the
 * project replaces the free allowance rather than adding to it.
 */

/** Free-tier Flash model. Others available: gemini-3.7-flash, gemini-2.5-flash. */
const DEFAULT_MODEL = 'gemini-3.5-flash';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * 20 per call: Gemini's free tier caps requests per day (not tokens), so larger
 * batches spend the scarce resource better. 20 sentences stay well inside
 * maxOutputTokens with lemmas and notes attached.
 */
const BATCH_SIZE = 20;

function model(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

/**
 * `responseSchema` is an OpenAPI subset, so it is hand-written rather than
 * derived from the zod schema below. `note` is optional here (Gemini omits it)
 * where Claude returns null — `alignTranslations` normalizes both to null.
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

const payloadSchema = z.object({
  translations: z.array(
    z.object({
      id: z.string(),
      translation: z.string(),
      note: z.string().nullish(),
      lemmas: z.array(z.string()).optional(),
    }),
  ),
});

const responseBodySchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({ parts: z.array(z.object({ text: z.string() })).optional() })
          .optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().optional(),
      candidatesTokenCount: z.number().optional(),
      cachedContentTokenCount: z.number().optional(),
      thoughtsTokenCount: z.number().optional(),
    })
    .optional(),
});

export const gemini: TranslationProvider = {
  name: 'gemini',
  batchSize: BATCH_SIZE,

  isConfigured(): ConfigCheck {
    return process.env.GEMINI_API_KEY
      ? { ok: true }
      : { ok: false, missing: ['GEMINI_API_KEY'] };
  },

  async translateBatch(
    items: TranslationInput[],
    sourceLang: string,
    targetLang: string,
  ): Promise<TranslationBatchResult> {
    assertConfigured(gemini);
    assertBatch(gemini, items);

    const id = model();
    const res = await fetch(`${API_BASE}/models/${id}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': process.env.GEMINI_API_KEY!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: TRANSLATION_SYSTEM_PROMPT }] },
        contents: [
          {
            role: 'user',
            parts: [
              { text: translationUserMessage(items, sourceLang, targetLang) },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema,
          // Translation is mechanical: low temperature, no creative drift.
          temperature: 0.2,
          maxOutputTokens: 8000,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 404) {
        throw new Error(
          `Gemini model "${id}" not available for this key — set GEMINI_MODEL to one the key can use (list them: GET ${API_BASE}/models). Details: ${body.slice(0, 300)}`,
        );
      }
      throw requestFailed('gemini', res.status, body);
    }

    const body = responseBodySchema.parse(await res.json());
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      const reason = body.candidates?.[0]?.finishReason ?? 'no candidates';
      throw new Error(`Gemini returned no translation output (${reason})`);
    }

    let payload: z.infer<typeof payloadSchema>;
    try {
      payload = payloadSchema.parse(JSON.parse(text));
    } catch {
      throw new Error(
        `Gemini returned unparseable translation output: ${text.slice(0, 300)}`,
      );
    }

    const usage = {
      inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
      // Thinking tokens are billed as output where they exist; free tier bills nothing.
      outputTokens:
        (body.usageMetadata?.candidatesTokenCount ?? 0) +
        (body.usageMetadata?.thoughtsTokenCount ?? 0),
      cacheReadTokens: body.usageMetadata?.cachedContentTokenCount ?? 0,
    };

    return {
      translations: alignTranslations('gemini', items, payload.translations),
      usage,
      costMicros: 0,
      model: id,
      provider: 'gemini',
    };
  },
};
