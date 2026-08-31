import Anthropic from '@anthropic-ai/sdk';

import { env } from '@/env';

let client: Anthropic | undefined;

export function getAnthropic(): Anthropic {
  if (!client) {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set — add it to .env.local');
    }
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}

/** Model ids and per-MTok prices, per Implementation Plan section 1. */
export const MODELS = {
  translate: {
    id: 'claude-sonnet-5',
    inputPerMTok: 2.0,
    outputPerMTok: 10.0,
  },
} as const;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export function readUsage(usage: Anthropic.Usage): TokenUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
  };
}

/** Cost in micro-dollars, the unit `usage_events.cost_micros` stores. */
export function costMicros(
  model: { inputPerMTok: number; outputPerMTok: number },
  usage: TokenUsage,
): number {
  const dollars =
    ((usage.inputTokens + usage.cacheReadTokens * 0.1) / 1_000_000) *
      model.inputPerMTok +
    (usage.outputTokens / 1_000_000) * model.outputPerMTok;
  return Math.round(dollars * 1_000_000);
}
