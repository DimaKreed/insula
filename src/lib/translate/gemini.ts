import { z } from 'zod';

import {
  assertConfigured,
  requestFailed,
  type ConfigCheck,
  type StructuredRequest,
  type StructuredResult,
  type TranslationProvider,
} from './provider';

/**
 * Google Gemini via the REST API — raw fetch, no SDK, like every TTS adapter.
 *
 * Runs on the free tier: Flash models are free of charge, so costMicros is 0
 * and only unit counts feed quotas. Two free-tier caveats, both deliberate (see
 * Implementation Plan section 7): Google states free-tier content may be used
 * to improve its products, and enabling billing on the project replaces the
 * free allowance rather than adding to it.
 */

/** Free-tier Flash model. Others available: gemini-3.7-flash, gemini-2.5-flash. */
const DEFAULT_MODEL = 'gemini-3.5-flash';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * 20 sentences per translation call: Gemini's free tier caps requests per day
 * (not tokens), so larger batches spend the scarce resource better. 20 stay
 * well inside maxOutputTokens with lemmas and notes attached.
 */
const BATCH_SIZE = 20;

/**
 * Gemini answers 503 UNAVAILABLE ("high demand") and 429 whenever a Flash model
 * is congested, which on the free tier is routine rather than exceptional — a
 * model can be unavailable for minutes at a time. Without this, a congested
 * model surfaces as a failed capture with every row marked 'error'.
 *
 * Short and finite on purpose: translation runs inside a server action the user
 * is waiting on, so the ceiling is a few seconds, not a real backoff schedule.
 * A model that is still down after this is genuinely down, and the per-row Retry
 * button is the next line of defence.
 */
const RETRY_STATUSES = new Set([429, 500, 503]);
const RETRY_DELAYS_MS = [1_000, 3_000];

function model(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

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

/** POSTs one completion, retrying only the statuses that mean "come back later". */
async function post(
  id: string,
  payload: string,
  label: string,
): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API_BASE}/models/${id}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': process.env.GEMINI_API_KEY!,
        'content-type': 'application/json',
      },
      body: payload,
    });

    if (res.ok) return res.json();

    const text = await res.text();
    if (res.status === 404) {
      throw new Error(
        `Gemini model "${id}" not available for this key — set GEMINI_MODEL to one the key can use (list them: GET ${API_BASE}/models). Details: ${text.slice(0, 300)}`,
      );
    }
    if (!RETRY_STATUSES.has(res.status) || attempt >= RETRY_DELAYS_MS.length) {
      throw requestFailed('gemini', res.status, text);
    }

    const delay = RETRY_DELAYS_MS[attempt];
    console.warn(
      `[gemini] ${label} got HTTP ${res.status} on "${id}", retrying in ${delay}ms (attempt ${attempt + 2}/${RETRY_DELAYS_MS.length + 1})`,
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export const gemini: TranslationProvider = {
  name: 'gemini',
  batchSize: BATCH_SIZE,

  isConfigured(): ConfigCheck {
    return process.env.GEMINI_API_KEY
      ? { ok: true }
      : { ok: false, missing: ['GEMINI_API_KEY'] };
  },

  async complete<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    assertConfigured(gemini);

    const id = model();
    const payload = JSON.stringify({
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [{ role: 'user', parts: [{ text: request.user }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: request.responseSchema,
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
      },
    });

    const body = responseBodySchema.parse(await post(id, payload, request.label));
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      const reason = body.candidates?.[0]?.finishReason ?? 'no candidates';
      throw new Error(`Gemini returned no ${request.label} output (${reason})`);
    }

    let data: T;
    try {
      data = request.parse.parse(JSON.parse(text));
    } catch (error) {
      throw new Error(
        `Gemini returned unparseable ${request.label} output (${error instanceof Error ? error.message.split('\n')[0] : error}): ${text.slice(0, 300)}`,
      );
    }

    return {
      data,
      usage: {
        inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
        // Thinking tokens are billed as output where they exist; free tier bills nothing.
        outputTokens:
          (body.usageMetadata?.candidatesTokenCount ?? 0) +
          (body.usageMetadata?.thoughtsTokenCount ?? 0),
        cacheReadTokens: body.usageMetadata?.cachedContentTokenCount ?? 0,
      },
      costMicros: 0,
      model: id,
      provider: 'gemini',
    };
  },
};
