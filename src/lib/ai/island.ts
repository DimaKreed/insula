import { z } from 'zod';

import { ISLAND_PROMPT_VERSION } from '@/lib/hash';
import { getTranslationProvider, type TokenUsage } from '@/lib/translate';

import {
  ISLAND_GENERATION_SYSTEM_PROMPT,
  islandGenerationUserMessage,
} from './prompts';

/**
 * Island generation: a free-text brief becomes 20 EN→RO sentences. The second
 * caller of `provider.complete()`, alongside `translateBatch` — no new provider,
 * client or key (Implementation Plan section 7: text generation at this volume
 * is free on the Gemini tier).
 *
 * The same call also decides whether the brief is a language-learning request at
 * all, and can refuse. Folding the decision in rather than running a separate
 * moderation pass is deliberate: Gemini's free tier caps requests per DAY, so a
 * pre-classifier would double consumption of the scarce resource on every
 * legitimate generation.
 *
 * Island output matches the shape of `seed/*.json` on purpose: the curated
 * islands are the quality bar, and `scripts/generate-island-spike.ts` compares
 * the two directly.
 */

/** What the generator asks for. The caller decides what to do with it. */
export const SENTENCES_PER_ISLAND = 20;

/** Falls back into `islands.name`, so it respects that column's 60-char UI cap. */
const MAX_NAME_CHARS = 60;
const FALLBACK_NAME = 'New topic';

/**
 * OpenAPI subset. `assessment` and `decision` come first so the model states
 * what it thinks the brief is before committing to an answer; `island` and
 * `sentences` are optional here because a rejection carries neither, and the
 * zod schema below is what actually enforces the pairing.
 */
const responseSchema = {
  type: 'object',
  properties: {
    assessment: { type: 'string' },
    decision: { type: 'string', enum: ['generate', 'reject'] },
    rejectionReason: { type: 'string' },
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
  required: ['assessment', 'decision'],
  propertyOrdering: [
    'assessment',
    'decision',
    'rejectionReason',
    'island',
    'sentences',
  ],
} as const;

const payloadSchema = z.object({
  assessment: z.string().default(''),
  decision: z.enum(['generate', 'reject']),
  rejectionReason: z.string().nullish(),
  island: z
    .object({
      name: z.string().nullish(),
      emoji: z.string().nullish(),
      level: z.string().nullish(),
      description: z.string().nullish(),
    })
    .nullish(),
  sentences: z
    .array(
      z.object({
        en: z.string().min(1),
        ro: z.string().min(1),
        note: z.string().nullish(),
        lemmas: z.array(z.string()).default([]),
      }),
    )
    .nullish(),
});

export interface GeneratedSentence {
  en: string;
  ro: string;
  note: string | null;
  lemmas: string[];
}

/** Shared by both outcomes — the tokens were spent either way. */
interface GenerationCost {
  promptVersion: string;
  model: string;
  provider: string;
  usage: TokenUsage;
  costMicros: number;
  /** The model's one-clause reading of the brief. Logged, never shown. */
  assessment: string;
}

export interface GeneratedIsland extends GenerationCost {
  kind: 'island';
  name: string;
  emoji: string | null;
  level: string | null;
  description: string | null;
  sentences: GeneratedSentence[];
}

export interface RejectedBrief extends GenerationCost {
  kind: 'rejected';
  /** One sentence, already addressed to the learner. Safe to show verbatim. */
  reason: string;
}

export type GenerationResult = GeneratedIsland | RejectedBrief;

export interface GenerateIslandInput {
  /** The learner's request, in their own words and any language. */
  brief: string;
  /** Their own name for the island, when they typed one. */
  name?: string | null;
}

const DEFAULT_REJECTION =
  "That doesn't look like a request for things to say. Insula writes phrases for real situations — your job, the doctor, the shop, talking to friends.";

export async function generateIsland(
  input: GenerateIslandInput,
): Promise<GenerationResult> {
  const provider = getTranslationProvider();
  const result = await provider.complete({
    system: ISLAND_GENERATION_SYSTEM_PROMPT,
    user: islandGenerationUserMessage(input),
    responseSchema,
    parse: payloadSchema,
    // 20 sentences with notes and lemmas run ~1500 tokens; headroom for thinking.
    maxOutputTokens: 8000,
    // Higher than translation: varied constructions are the point here, and a
    // near-deterministic sample gives 20 rows off the same template.
    temperature: 0.9,
    label: 'island generation',
  });

  const cost: GenerationCost = {
    promptVersion: ISLAND_PROMPT_VERSION,
    model: result.model,
    provider: result.provider,
    usage: result.usage,
    costMicros: result.costMicros,
    assessment: result.data.assessment.trim(),
  };

  if (result.data.decision === 'reject') {
    return {
      kind: 'rejected',
      reason: result.data.rejectionReason?.trim() || DEFAULT_REJECTION,
      ...cost,
    };
  }

  // Trim, drop empties, dedup by normalized English. The model is asked for 20
  // distinct sentences; the caller is told how many actually survived rather
  // than being handed a padded list.
  const seen = new Set<string>();
  const sentences: GeneratedSentence[] = [];
  for (const s of result.data.sentences ?? []) {
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
      `${result.provider} chose to generate but returned no usable sentences — try again or reword the brief.`,
    );
  }

  return {
    kind: 'island',
    // The learner's own name wins; then the model's; then a placeholder. Never
    // the brief itself — it can run to hundreds of characters.
    name: (input.name?.trim() || result.data.island?.name?.trim() || FALLBACK_NAME).slice(
      0,
      MAX_NAME_CHARS,
    ),
    emoji: result.data.island?.emoji?.trim() || null,
    level: result.data.island?.level?.trim() || null,
    description: result.data.island?.description?.trim() || null,
    sentences,
    ...cost,
  };
}
