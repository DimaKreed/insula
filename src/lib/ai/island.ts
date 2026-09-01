import { z } from 'zod';

import { ISLAND_PROMPT_VERSION } from '@/lib/hash';
import { getTranslationProvider, type TokenUsage } from '@/lib/translate';

import {
  ISLAND_GENERATION_SYSTEM_PROMPT,
  islandGenerationUserMessage,
} from './prompts';

/**
 * Island generation: a topic and an optional free-text hint become 20 EN→RO
 * sentences. The second caller of `provider.complete()`, alongside
 * `translateBatch` — no new provider, client or key (Implementation Plan
 * section 7: text generation at this volume is free on the Gemini tier).
 *
 * Output matches the shape of `seed/*.json` on purpose: the curated islands are
 * the quality bar, and `scripts/generate-island-spike.ts` compares the two
 * directly.
 */

/** What the generator asks for. The caller decides what to do with it. */
export const SENTENCES_PER_ISLAND = 20;

const responseSchema = {
  type: 'object',
  properties: {
    island: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        emoji: { type: 'string' },
        level: { type: 'string', enum: ['A1', 'A2'] },
        description: { type: 'string' },
      },
      required: ['name', 'emoji', 'level', 'description'],
      propertyOrdering: ['name', 'emoji', 'level', 'description'],
    },
    sentences: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          en: { type: 'string' },
          ro: { type: 'string' },
          note: { type: 'string' },
          lemmas: { type: 'array', items: { type: 'string' } },
        },
        required: ['en', 'ro', 'lemmas'],
        propertyOrdering: ['en', 'ro', 'note', 'lemmas'],
      },
    },
  },
  required: ['island', 'sentences'],
} as const;

const payloadSchema = z.object({
  island: z.object({
    name: z.string().min(1),
    emoji: z.string().optional(),
    level: z.string().optional(),
    description: z.string().optional(),
  }),
  sentences: z
    .array(
      z.object({
        en: z.string().min(1),
        ro: z.string().min(1),
        note: z.string().nullish(),
        lemmas: z.array(z.string()).default([]),
      }),
    )
    .min(1),
});

export interface GeneratedSentence {
  en: string;
  ro: string;
  note: string | null;
  lemmas: string[];
}

export interface GeneratedIsland {
  name: string;
  emoji: string | null;
  level: string | null;
  description: string | null;
  sentences: GeneratedSentence[];
  promptVersion: string;
  model: string;
  provider: string;
  usage: TokenUsage;
  costMicros: number;
}

export interface GenerateIslandInput {
  topic: string;
  /** Free text about the learner, e.g. "my standups are in English". */
  hint?: string | null;
  /** English sentences the learner already has, so the model doesn't repeat them. */
  existingSentences?: string[];
}

export async function generateIsland(
  input: GenerateIslandInput,
): Promise<GeneratedIsland> {
  const provider = getTranslationProvider();
  const result = await provider.complete({
    system: ISLAND_GENERATION_SYSTEM_PROMPT,
    user: islandGenerationUserMessage(
      input.topic,
      input.hint,
      input.existingSentences,
    ),
    responseSchema,
    parse: payloadSchema,
    // 20 sentences with notes and lemmas run ~1500 tokens; headroom for thinking.
    maxOutputTokens: 8000,
    // Higher than translation: varied constructions are the point here, and a
    // near-deterministic sample gives 20 rows off the same template.
    temperature: 0.9,
    label: 'island generation',
  });

  // Trim, drop empties, dedup by normalized English. The model is asked for 20
  // distinct sentences; the caller is told how many actually survived rather
  // than being handed a padded list.
  const seen = new Set<string>();
  const sentences: GeneratedSentence[] = [];
  for (const s of result.data.sentences) {
    const en = s.en.trim();
    const ro = s.ro.trim();
    const key = en.toLowerCase();
    if (!en || !ro || seen.has(key)) continue;
    seen.add(key);
    sentences.push({
      en,
      ro,
      note: s.note?.trim() ? s.note.trim() : null,
      lemmas: [...new Set(s.lemmas.map((l) => l.trim()).filter(Boolean))],
    });
  }

  if (sentences.length === 0) {
    throw new Error(
      `${result.provider} generated no usable sentences for "${input.topic}" — try again or reword the topic.`,
    );
  }

  return {
    name: result.data.island.name.trim() || input.topic.trim(),
    emoji: result.data.island.emoji?.trim() || null,
    level: result.data.island.level?.trim() || null,
    description: result.data.island.description?.trim() || null,
    sentences,
    promptVersion: ISLAND_PROMPT_VERSION,
    model: result.model,
    provider: result.provider,
    usage: result.usage,
    costMicros: result.costMicros,
  };
}
