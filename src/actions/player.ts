'use server';

import { z } from 'zod';

import { requireUser } from '@/auth';
import { getIsland } from '@/db/queries/islands';
import { islandPlaylist, type PlaylistItem } from '@/db/queries/sentences';
import { ensureIslandPromptAudio } from '@/lib/audio/prompts';

import { failed, type ActionResult } from './result';

const input = z.object({
  islandId: z.string().min(1),
  /** Limits the batch to the sentences the player actually needs hints for. */
  sentenceIds: z.array(z.string().min(1)).max(500).optional(),
});

export interface ListenHintsResult {
  items: PlaylistItem[];
  /** Hints still missing — the player calls again until this reaches zero. */
  remaining: number;
}

/**
 * Makes the English hint audio Listen mode needs, then hands back the playlist
 * with the fresh URLs in it.
 *
 * The player calls this rather than the page pre-generating: an island's hints
 * are only worth synthesizing once someone actually opens it in Listen mode
 * with hints on, and until they exist the player simply plays Romanian only.
 */
export async function prepareListenHints(
  raw: unknown,
): Promise<ActionResult<ListenHintsResult>> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return failed('That island did not make sense.');

  const user = await requireUser();
  const island = await getIsland(user.id, parsed.data.islandId);
  if (!island) return failed('That island is no longer in your collection.');

  try {
    const { remaining, errors } = await ensureIslandPromptAudio(
      user.id,
      island.id,
      parsed.data.sentenceIds,
    );
    const items = await islandPlaylist(user.id, island.id);
    // A partial batch is still progress; only a wholly failed one is worth
    // saying out loud, because the player has nothing new to play.
    if (errors > 0 && items.every((item) => !item.promptAudioUrl)) {
      return failed('Could not make the English hints just now.');
    }
    return { ok: true, data: { items, remaining } };
  } catch (error) {
    console.error('[listen-hints]', error);
    return failed('Could not make the English hints just now.');
  }
}
