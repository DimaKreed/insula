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
export async function startAudio(sentenceIds: string[]): Promise<void> {
  const items = await sentencesAwaitingAudio({ ids: sentenceIds });
  if (items.length === 0) return;

  await queueForAudio(items);
  enqueue('tts', async () => {
    await synthesizeSentences(items);
  });
}
