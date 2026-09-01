'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireUser } from '@/auth';
import { updateUserSettings } from '@/db/queries/users';
import { LISTEN_HINT_MODES } from '@/lib/player/listen-hints';

import { done, failed, type ActionResult } from './result';

const input = z.object({ listenHint: z.enum(LISTEN_HINT_MODES) });

/** When Listen mode plays the English hint: auto | always | never. */
export async function setListenHintMode(raw: unknown): Promise<ActionResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return failed('That is not a hint setting.');

  const user = await requireUser();
  await updateUserSettings(user.id, { listenHint: parsed.data.listenHint });
  revalidatePath('/settings');
  return done;
}
