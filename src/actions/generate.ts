'use server';

import { createId } from '@paralleldrive/cuid2';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireAdmin, requireUser, type SessionUser } from '@/auth';
import { getDb } from '@/db';
import { recentOffenceDates, recordOffence } from '@/db/queries/generation';
import { linkPresetAudio, nextPresetPosition } from '@/db/queries/presets';
import {
  monthlyUsage,
  recordIslandGenerationUsage,
  recordRejectedGenerationUsage,
} from '@/db/queries/usage';
import { presetIslands, presetSentences } from '@/db/schema';
import { generateIsland, type GenerationResult } from '@/lib/ai/island';
import { startAudio } from '@/lib/audio/queue';
import {
  generationGate,
  offenceWindowStart,
} from '@/lib/islands/generation-gate';
import { createGeneratedIsland } from '@/lib/islands/generated';
import {
  checkIslandQuota,
  limitsFor,
  offenceWarning,
  yearMonth,
} from '@/lib/quota';

import { failed, type ActionResult } from './result';

/**
 * Island generation — a free-text brief becomes 20 EN→RO sentences.
 *
 * The brief is untrusted free text, and a free-text box wired to a model is a
 * free proxy to that model. The same call that writes the island also decides
 * whether the brief is a language-learning request at all; a refusal is logged
 * as an offence and escalates (`generationBlock` in `src/lib/quota.ts`). Only
 * generation is ever gated — capture, review and playback are untouched.
 *
 * Two entry points over one generator: a user generates a private island in
 * their own account, an admin generates a published preset everyone can import.
 * Both then fall into the existing pipeline unchanged — the sentences arrive
 * with Romanian already attached, so translation is skipped and only TTS runs
 * behind `enqueue`.
 *
 * The row-writing itself lives in `src/lib/islands/generated.ts`, free of
 * `next/server`, so `npm run generate:verify` exercises this exact path from a
 * plain script instead of reimplementing it.
 *
 * A generated island is a scaffold, not the point. The method works because the
 * sentences are the learner's own, so the UI that calls this frames it as
 * "start a topic, then add your own" and every copy here says the same.
 */

const inputSchema = z.object({
  brief: z
    .string()
    .trim()
    .min(10, 'Say a little more about what you want to be able to say.')
    .max(600, 'Keep it under 600 characters.'),
  name: z
    .string()
    .trim()
    .max(60, 'Keep the name under 60 characters.')
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
});

/**
 * Generates a private island in the caller's account.
 *
 * Order matters and is the same shape as the sentence quota:
 *
 *  1. block check, before anything else. Nothing is logged here — a blocked user
 *     pressing the button again must not extend their own block;
 *  2. quota check, still before the model, so someone at their cap never spends
 *     a request;
 *  3. the model;
 *  4. a refusal costs an offence but no quota unit — nothing was generated;
 *  5. the counter is bumped only once the model has returned, so a failure of
 *     any kind is free.
 */
export async function generateUserIsland(
  input: unknown,
): Promise<ActionResult<{ islandId: string; sentenceCount: number }>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return failed(parsed.error.issues[0].message);

  const user = await requireUser();

  const block = await generationGate(user);
  if (block.blocked) return failed(block.message);

  const period = yearMonth(new Date(), user.timezone);
  const quota = await checkQuota(user, period);
  if (!quota.allowed) return failed(quota.message);

  let result: GenerationResult;
  try {
    result = await generateIsland(parsed.data);
  } catch (error) {
    return failed(generationMessage(error));
  }

  if (result.kind === 'rejected') {
    await recordOffence({
      userId: user.id,
      brief: parsed.data.brief,
      reason: result.reason,
    });
    // Re-read rather than counting in memory: the row just written is what the
    // policy is derived from, so this reports the penalty actually in force.
    const dates = await recentOffenceDates(user.id, offenceWindowStart());
    // The tokens were spent even though nothing was created. Recorded without a
    // sentence count, so the month's island counter is left alone.
    await recordRejectedGenerationUsage({
      userId: user.id,
      yearMonth: period,
      provider: result.provider,
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadTokens: result.usage.cacheReadTokens,
      costMicros: result.costMicros,
    });
    return failed(`${result.reason} ${offenceWarning(dates.length)}`);
  }

  const generated = result;
  const { islandId, sentenceIds } = await createGeneratedIsland({
    userId: user.id,
    generated,
  });

  await recordIslandGenerationUsage({
    userId: user.id,
    yearMonth: period,
    provider: generated.provider,
    model: generated.model,
    inputTokens: generated.usage.inputTokens,
    outputTokens: generated.usage.outputTokens,
    cacheReadTokens: generated.usage.cacheReadTokens,
    costMicros: generated.costMicros,
    refId: islandId,
  });

  await startAudio(sentenceIds);

  revalidatePath('/islands');
  revalidatePath(`/islands/${islandId}`);
  return { ok: true, data: { islandId, sentenceCount: sentenceIds.length } };
}

/**
 * Generates a preset island, published and importable by everyone.
 *
 * Admin-only, and admins are quota-exempt (`limitsFor` returns null for them),
 * so no counter is checked here — but the generation is still recorded in
 * `usage_events` so preset content has the same audit trail as user content.
 *
 * The preset's own TTS runs against a holder island in the admin's account:
 * `audio_assets` is global and keyed by content hash, so the recordings the
 * holder produces are exactly the ones importers will link to. Once synthesis
 * finishes, `linkPresetAudio` draws the line from the preset rows to those
 * assets — without it an import would re-synthesize, which is the one cost
 * presets exist to avoid.
 */
export async function generatePresetIsland(
  input: unknown,
): Promise<ActionResult<{ presetId: string; sentenceCount: number }>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return failed(parsed.error.issues[0].message);

  const admin = await requireAdmin();

  let result: GenerationResult;
  try {
    result = await generateIsland(parsed.data);
  } catch (error) {
    return failed(generationMessage(error));
  }

  // A curator gets the refusal as feedback but is never strike-tracked: the
  // escalation exists to stop anonymous abuse, not to police the person
  // deciding what every learner sees.
  if (result.kind === 'rejected') return failed(result.reason);

  const generated = result;
  const db = getDb();
  const presetId = createId();

  await db.insert(presetIslands).values({
    id: presetId,
    name: generated.name,
    emoji: generated.emoji ?? '🏝️',
    description: generated.description,
    level: generated.level,
    // Published straight away: an admin generating a preset means to ship it,
    // and `deletePreset` is the undo.
    published: true,
    origin: 'generated',
    promptVersion: generated.promptVersion,
    createdBy: admin.id,
    position: await nextPresetPosition(),
  });

  await db.insert(presetSentences).values(
    generated.sentences.map((s, i) => ({
      presetIslandId: presetId,
      sourceText: s.en,
      targetText: s.ro,
      translationNote: s.note,
      lemmas: s.lemmas,
      position: i,
    })),
  );

  await recordIslandGenerationUsage({
    userId: admin.id,
    yearMonth: yearMonth(new Date(), admin.timezone),
    provider: generated.provider,
    model: generated.model,
    inputTokens: generated.usage.inputTokens,
    outputTokens: generated.usage.outputTokens,
    cacheReadTokens: generated.usage.cacheReadTokens,
    costMicros: generated.costMicros,
    refId: presetId,
  });

  const { sentenceIds } = await createGeneratedIsland({
    userId: admin.id,
    generated,
    importedFromPresetId: presetId,
  });

  await startAudio(sentenceIds, async () => {
    const { linked, missing } = await linkPresetAudio(presetId);
    console.log(
      `[generate] preset ${presetId}: linked ${linked} recording(s), ${missing} still missing`,
    );
  });

  revalidatePath('/admin/presets');
  revalidatePath('/presets');
  return { ok: true, data: { presetId, sentenceCount: sentenceIds.length } };
}

// --- internals -------------------------------------------------------------

async function checkQuota(user: SessionUser, period: string) {
  const used = await monthlyUsage(user.id, period);
  const check = checkIslandQuota(
    limitsFor(user.tier, user.role),
    used?.islandsGenerated ?? 0,
  );
  return check.allowed
    ? { allowed: true as const, message: '' }
    : { allowed: false as const, message: check.message };
}

/** Model and network failures both land here; neither should leak a stack. */
function generationMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : 'Island generation failed';
  console.error('[generate] failed', message);
  return `Couldn't generate that island: ${message.slice(0, 200)}`;
}
