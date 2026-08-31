'use server';

import { createId } from '@paralleldrive/cuid2';
import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireUser, type SessionUser } from '@/auth';
import { getDb } from '@/db';
import { getIsland } from '@/db/queries/islands';
import {
  cacheTranslations,
  findCachedTranslations,
  getSentence,
  nextSentencePosition,
} from '@/db/queries/sentences';
import { monthlyUsage, recordTranslationUsage } from '@/db/queries/usage';
import { sentences } from '@/db/schema';
import { parseCaptureLines } from '@/lib/capture';
import { translationHash } from '@/lib/hash';
import { checkSentenceQuota, limitsFor, yearMonth } from '@/lib/quota';
import { chunk, getTranslationProvider } from '@/lib/translate';

import { done, failed, type ActionResult } from './result';

/**
 * Capture → translate. Phase 1 translates inline in the action (Implementation
 * Plan section 6): the caller waits, no queue. Phase 2 moves the translation
 * half behind QStash and the statuses written here become the polled ones.
 */
export async function captureSentences(
  input: unknown,
): Promise<ActionResult<{ added: number; cached: number }>> {
  const parsed = z
    .object({ islandId: z.string().min(1), text: z.string() })
    .safeParse(input);
  if (!parsed.success) return failed('Nothing to add.');

  const user = await requireUser();
  const island = await getIsland(user.id, parsed.data.islandId);
  if (!island) return failed('Island not found.');

  const lines = parseCaptureLines(parsed.data.text);
  if (!lines.ok) return failed(lines.error);

  const { sourceLang, targetLang } = island;
  const provider = getTranslationProvider();
  const hashes = lines.lines.map((text) =>
    translationHash(text, sourceLang, targetLang, provider.name),
  );
  const cached = await findCachedTranslations([...new Set(hashes)]);

  const uncachedCount = hashes.filter((h) => !cached.has(h)).length;
  const quota = await checkQuota(user, uncachedCount);
  if (!quota.allowed) return failed(quota.message);

  // Every row is inserted up front so the list shows the sentences even if the
  // translation call then fails. Ids are generated here rather than read back,
  // so each row's id is known without relying on RETURNING's order.
  const db = getDb();
  const basePosition = await nextSentencePosition(island.id);
  const rows = lines.lines.map((text, i) => ({
    id: createId(),
    text,
    hash: hashes[i],
    position: basePosition + i,
  }));

  await db.insert(sentences).values(
    rows.map((row) => {
      const hit = cached.get(row.hash);
      return {
        id: row.id,
        islandId: island.id,
        userId: user.id,
        sourceText: row.text,
        sourceLang,
        targetLang,
        contentHash: row.hash,
        position: row.position,
        ...(hit
          ? {
              targetText: hit.targetText,
              translationNote: hit.translationNote,
              status: 'translated' as const,
            }
          : { status: 'translating' as const }),
      };
    }),
  );

  const toTranslate = rows.filter((row) => !cached.has(row.hash));

  await runTranslation(user, toTranslate, sourceLang, targetLang);

  revalidatePath(`/islands/${island.id}`);
  revalidatePath('/islands');
  return {
    ok: true,
    data: { added: rows.length, cached: rows.length - toTranslate.length },
  };
}

export async function retrySentence(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ sentenceId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return failed('Sentence not found.');

  const user = await requireUser();
  const sentence = await getSentence(user.id, parsed.data.sentenceId);
  if (!sentence) return failed('Sentence not found.');
  if (sentence.targetText) return done; // already translated; nothing to retry

  const quota = await checkQuota(user, 1);
  if (!quota.allowed) return failed(quota.message);

  // Re-hash: TRANSLATION_PROVIDER may have changed since the row was captured,
  // and the cache key carries the provider.
  const hash = translationHash(
    sentence.sourceText,
    sentence.sourceLang,
    sentence.targetLang,
    getTranslationProvider().name,
  );

  const db = getDb();
  await db
    .update(sentences)
    .set({
      status: 'translating',
      contentHash: hash,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(sentences.id, sentence.id));

  await runTranslation(
    user,
    [{ id: sentence.id, text: sentence.sourceText, hash }],
    sentence.sourceLang,
    sentence.targetLang,
  );

  revalidatePath(`/islands/${sentence.islandId}`);
  return done;
}

export async function editSentence(input: unknown): Promise<ActionResult> {
  const parsed = z
    .object({ sentenceId: z.string().min(1), sourceText: z.string() })
    .safeParse(input);
  if (!parsed.success) return failed('Sentence not found.');

  const user = await requireUser();
  const sentence = await getSentence(user.id, parsed.data.sentenceId);
  if (!sentence) return failed('Sentence not found.');

  const lines = parseCaptureLines(parsed.data.sourceText);
  if (!lines.ok) return failed(lines.error);
  if (lines.lines.length !== 1) {
    return failed('An edit has to stay a single sentence.');
  }
  const sourceText = lines.lines[0];
  const hash = translationHash(
    sourceText,
    sentence.sourceLang,
    sentence.targetLang,
    getTranslationProvider().name,
  );

  const db = getDb();
  // Unchanged text (after normalization) re-runs nothing — the plan's rule.
  if (hash === sentence.contentHash) {
    await db
      .update(sentences)
      .set({ sourceText, updatedAt: new Date() })
      .where(eq(sentences.id, sentence.id));
    revalidatePath(`/islands/${sentence.islandId}`);
    return done;
  }

  const cached = await findCachedTranslations([hash]);
  const hit = cached.get(hash);
  if (!hit) {
    const quota = await checkQuota(user, 1);
    if (!quota.allowed) return failed(quota.message);
  }

  await db
    .update(sentences)
    .set({
      sourceText,
      contentHash: hash,
      targetText: hit?.targetText ?? null,
      translationNote: hit?.translationNote ?? null,
      status: hit ? 'translated' : 'translating',
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(sentences.id, sentence.id));

  if (!hit) {
    await runTranslation(
      user,
      [{ id: sentence.id, text: sourceText, hash }],
      sentence.sourceLang,
      sentence.targetLang,
    );
  }

  revalidatePath(`/islands/${sentence.islandId}`);
  return done;
}

export async function deleteSentence(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ sentenceId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return failed('Sentence not found.');

  const user = await requireUser();
  const db = getDb();
  const deleted = await db
    .delete(sentences)
    .where(
      and(
        eq(sentences.id, parsed.data.sentenceId),
        eq(sentences.userId, user.id),
      ),
    )
    .returning({ islandId: sentences.islandId });

  if (deleted.length === 0) return failed('Sentence not found.');

  revalidatePath(`/islands/${deleted[0].islandId}`);
  revalidatePath('/islands');
  return done;
}

// --- internals -------------------------------------------------------------

async function checkQuota(user: SessionUser, requested: number) {
  if (requested === 0) return { allowed: true as const, message: '' };
  const period = yearMonth(new Date(), user.timezone);
  const used = await monthlyUsage(user.id, period);
  const check = checkSentenceQuota(
    limitsFor(user.tier, user.role),
    used?.sentencesTranslated ?? 0,
    requested,
  );
  return check.allowed
    ? { allowed: true as const, message: '' }
    : { allowed: false as const, message: check.message };
}

interface PendingSentence {
  id: string;
  text: string;
  hash: string;
}

/**
 * Translates in batches sized by the configured provider. A failed batch marks
 * only its own rows 'error' — the rest of the capture still lands, and each
 * failed row gets a Retry button.
 */
async function runTranslation(
  user: SessionUser,
  pending: PendingSentence[],
  sourceLang: string,
  targetLang: string,
): Promise<void> {
  if (pending.length === 0) return;

  const db = getDb();
  const period = yearMonth(new Date(), user.timezone);
  const provider = getTranslationProvider();

  await Promise.all(
    chunk(pending, provider.batchSize).map(async (batch) => {
      try {
        const result = await provider.translateBatch(
          batch.map((s) => ({ id: s.id, text: s.text })),
          sourceLang,
          targetLang,
        );

        const byId = new Map(batch.map((s) => [s.id, s]));
        await Promise.all(
          result.translations.map((t) =>
            db
              .update(sentences)
              .set({
                targetText: t.targetText,
                translationNote: t.translationNote,
                status: 'translated',
                errorMessage: null,
                updatedAt: new Date(),
              })
              .where(eq(sentences.id, t.id)),
          ),
        );

        await cacheTranslations(
          result.translations.map((t) => ({
            contentHash: byId.get(t.id)!.hash,
            targetText: t.targetText,
            translationNote: t.translationNote,
            lemmas: t.lemmas,
          })),
        );

        await recordTranslationUsage({
          userId: user.id,
          yearMonth: period,
          provider: result.provider,
          model: result.model,
          sentenceCount: result.translations.length,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cacheReadTokens: result.usage.cacheReadTokens,
          costMicros: result.costMicros,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Translation failed';
        console.error('[translate] batch failed', message);
        await db
          .update(sentences)
          .set({
            status: 'error',
            errorMessage: message.slice(0, 500),
            updatedAt: new Date(),
          })
          .where(
            inArray(
              sentences.id,
              batch.map((s) => s.id),
            ),
          );
      }
    }),
  );
}
