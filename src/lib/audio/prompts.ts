import {
  sentencesAwaitingPromptAudio,
  type AwaitingPromptAudio,
} from '@/db/queries/audio';

import { synthesizePromptAudio, type Summary } from './tts';

/**
 * English hint audio for an island, made on demand.
 *
 * Lazy by design (Implementation Plan section 4.3): the hint is what Listen
 * plays in front of a sentence that is still New or Learning, and most
 * sentences leave that window without ever having been listened to. Generating
 * the corpus up front would spend TTS characters on audio nobody hears.
 *
 * Called in batches so one request cannot sit through twenty syntheses — the
 * caller repeats while `remaining` is above zero, and each round is idempotent
 * because a linked sentence drops out of the work list.
 */

/** Sentences per call. Small enough that a server action returns promptly. */
const BATCH = 12;

export interface PromptAudioResult extends Summary {
  /** Hints still missing after this batch. */
  remaining: number;
}

export async function ensureIslandPromptAudio(
  userId: string,
  islandId: string,
  ids?: string[],
): Promise<PromptAudioResult> {
  const pending: AwaitingPromptAudio[] = await sentencesAwaitingPromptAudio({
    userId,
    islandId,
    ids,
  });

  const summary = await synthesizePromptAudio(pending.slice(0, BATCH), {
    concurrency: 4,
  });

  return { ...summary, remaining: Math.max(0, pending.length - BATCH) };
}
