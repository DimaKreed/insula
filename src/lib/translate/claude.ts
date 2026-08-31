import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

import {
  MODELS,
  costMicros,
  getAnthropic,
  readUsage,
} from '@/lib/ai/anthropic';
import {
  TRANSLATION_SYSTEM_PROMPT,
  translationUserMessage,
} from '@/lib/ai/prompts';

import {
  alignTranslations,
  assertBatch,
  assertConfigured,
  type ConfigCheck,
  type TranslationBatchResult,
  type TranslationInput,
  type TranslationProvider,
} from './provider';

/**
 * Anthropic Claude. Best notes and lemmas of the two providers, and the only
 * one that does not train on the input — chosen by setting
 * TRANSLATION_PROVIDER=claude. Costs roughly $0.10–0.30 per 500 sentences.
 */

/** 10 per call: Claude's structured output stays reliable at this size. */
const BATCH_SIZE = 10;

const translationSchema = z.object({
  translations: z.array(
    z.object({
      id: z.string(),
      translation: z.string(),
      note: z.string().nullable(),
      lemmas: z.array(z.string()),
    }),
  ),
});

export const claude: TranslationProvider = {
  name: 'claude',
  batchSize: BATCH_SIZE,

  isConfigured(): ConfigCheck {
    return process.env.ANTHROPIC_API_KEY
      ? { ok: true }
      : { ok: false, missing: ['ANTHROPIC_API_KEY'] };
  },

  async translateBatch(
    items: TranslationInput[],
    sourceLang: string,
    targetLang: string,
  ): Promise<TranslationBatchResult> {
    assertConfigured(claude);
    assertBatch(claude, items);

    const model = MODELS.translate;
    const response = await getAnthropic().messages.parse({
      model: model.id,
      max_tokens: 8000,
      system: [
        {
          type: 'text',
          text: TRANSLATION_SYSTEM_PROMPT,
          // Caching applies once the guide passes the model's minimum cacheable
          // prefix; below it the API silently skips caching and this is a no-op.
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: translationUserMessage(items, sourceLang, targetLang),
        },
      ],
      output_config: {
        effort: 'low',
        format: zodOutputFormat(translationSchema),
      },
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new Error('Claude returned no parseable translation output');
    }

    const usage = readUsage(response.usage);
    return {
      translations: alignTranslations('claude', items, parsed.translations),
      usage,
      costMicros: costMicros(model, usage),
      model: model.id,
      provider: 'claude',
    };
  },
};
