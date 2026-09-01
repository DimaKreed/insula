import { sentencesAwaitingAudio } from '@/db/queries/audio';
import { enqueue } from '@/lib/enqueue';

import { queueForAudio, synthesizeSentences } from './tts';

/**
 * Starts TTS for sentences that just got their Romanian text. Server actions
 * call this and return immediately; the island page polls the statuses.
 *
 * Filtering through `sentencesAwaitingAudio` is what keeps it safe to call with
 * any set of ids — rows already carrying audio drop out, so a double capture,
 * a retry, or a backfill running at the same time cannot double-synthesize.
 */
export async function startAudio(
  sentenceIds: string[],
  /**
   * Runs in the same background job, once synthesis has finished. Preset
   * generation is the caller that needs it: `preset_sentences.audio_asset_id`
   * can only be linked after the recordings exist, and scheduling that as a
   * second `enqueue` would race this one.
   */
  afterSynthesis?: () => Promise<void>,
): Promise<void> {
  const items = await sentencesAwaitingAudio({ ids: sentenceIds });
  if (items.length === 0) {
    // Nothing to synthesize does not mean nothing to do — every recording may
    // already exist, which is precisely when linking still has work.
    if (afterSynthesis) enqueue('tts-after', afterSynthesis);
    return;
  }

  await queueForAudio(items);
  enqueue('tts', async () => {
    await synthesizeSentences(items);
    if (afterSynthesis) await afterSynthesis();
  });
}
