import { createId } from '@paralleldrive/cuid2';

import { getDb } from '@/db';
import { nextIslandPosition } from '@/db/queries/islands';
import { createReviewStates } from '@/db/queries/review';
import { cacheTranslations } from '@/db/queries/sentences';
import { islands, sentences } from '@/db/schema';
import type { GeneratedIsland } from '@/lib/ai/island';
import { translationHash } from '@/lib/hash';
import { getTranslationProvider } from '@/lib/translate';

/**
 * Turns a generated island into rows.
 *
 * Deliberately free of any `next/server` import, for the same reason
 * `synthesizeSentences` is: the server action wraps this in auth, quota and
 * `revalidatePath`, and `npm run generate:verify` calls the very same function
 * from a plain tsx script. Two callers, one implementation — a verification
 * script that reimplemented these inserts would be testing itself.
 */

/** Generation is English-to-Romanian only; the prompt is written for that pair. */
export const SOURCE_LANG = 'en';
export const TARGET_LANG = 'ro';

export interface CreatedIsland {
  islandId: string;
  sentenceIds: string[];
}

export async function createGeneratedIsland(input: {
  userId: string;
  generated: GeneratedIsland;
  /** Set when the island is an admin's copy of a preset it was published as. */
  importedFromPresetId?: string;
}): Promise<CreatedIsland> {
  const { userId, generated } = input;
  const db = getDb();
  const provider = getTranslationProvider().name;
  const islandId = createId();

  const rows = generated.sentences.map((s, i) => ({
    id: createId(),
    islandId,
    userId,
    sourceText: s.en,
    targetText: s.ro,
    sourceLang: SOURCE_LANG,
    targetLang: TARGET_LANG,
    translationNote: s.note,
    // Romanian is already here, so the row skips 'translating' entirely and
    // goes straight into the TTS half of the pipeline.
    status: 'translated' as const,
    contentHash: translationHash(s.en, SOURCE_LANG, TARGET_LANG, provider),
    origin: 'generated',
    position: i,
  }));

  await db.insert(islands).values({
    id: islandId,
    userId,
    name: generated.name,
    emoji: generated.emoji ?? '🏝️',
    description: generated.description,
    sourceLang: SOURCE_LANG,
    targetLang: TARGET_LANG,
    origin: 'generated',
    importedFromPresetId: input.importedFromPresetId,
    position: await nextIslandPosition(userId),
  });

  await db.insert(sentences).values(rows);

  // Every sentence gets its FSRS card up front, in state New — the same
  // invariant capture maintains.
  await createReviewStates(
    userId,
    rows.map((r) => r.id),
    new Date(),
  );

  // Warm the global cache: if this user (or any other) later captures the same
  // English sentence by hand, it costs no translation call.
  const lemmasByEn = new Map(generated.sentences.map((s) => [s.en, s.lemmas]));
  await cacheTranslations(
    rows.map((r) => ({
      contentHash: r.contentHash,
      targetText: r.targetText,
      translationNote: r.translationNote,
      lemmas: lemmasByEn.get(r.sourceText) ?? [],
    })),
  );

  return { islandId, sentenceIds: rows.map((r) => r.id) };
}
