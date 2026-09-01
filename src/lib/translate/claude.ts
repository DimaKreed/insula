import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import {
  MODELS,
  costMicros,
  getAnthropic,
  readUsage,
} from '@/lib/ai/anthropic';

import {
  assertConfigured,
  type ConfigCheck,
  type StructuredRequest,
  type StructuredResult,
  type TranslationProvider,
} from './provider';

/**
 * Anthropic Claude. Best notes and lemmas of the two providers, and the only
 * one that does not train on the input — chosen by setting
 * TRANSLATION_PROVIDER=claude. Costs roughly $0.10–0.30 per 500 sentences.
 */

/** 10 sentences per translation call: structured output stays reliable at this size. */
const BATCH_SIZE = 10;

export const claude: TranslationProvider = {
  name: 'claude',
  batchSize: BATCH_SIZE,

  isConfigured(): ConfigCheck {
    return process.env.ANTHROPIC_API_KEY
      ? { ok: true }
      : { ok: false, missing: ['ANTHROPIC_API_KEY'] };
  },

  async complete<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    assertConfigured(claude);

    const model = MODELS.translate;
    const response = await getAnthropic().messages.parse({
      model: model.id,
      max_tokens: request.maxOutputTokens,
      temperature: request.temperature,
      system: [
        {
          type: 'text',
          text: request.system,
          // Caching applies once the prompt passes the model's minimum cacheable
          // prefix; below it the API silently skips caching and this is a no-op.
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: request.user }],
      output_config: {
        effort: 'low',
        // The zod schema is authoritative here; `responseSchema` is for the
        // providers that need the OpenAPI subset instead.
        format: zodOutputFormat(request.parse),
      },
    });

    const parsed = response.parsed_output as T | null;
    if (!parsed) {
      throw new Error(`Claude returned no parseable ${request.label} output`);
    }

    const usage = readUsage(response.usage);
    return {
      data: parsed,
      usage,
      costMicros: costMicros(model, usage),
      model: model.id,
      provider: 'claude',
    };
  },
};
