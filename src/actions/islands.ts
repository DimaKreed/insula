'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireUser } from '@/auth';
import { getDb } from '@/db';
import { nextIslandPosition } from '@/db/queries/islands';
import { islands } from '@/db/schema';

import { done, failed, type ActionResult } from './result';

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Give the island a name.')
  .max(60, 'Keep the name under 60 characters.');

// A single emoji, or nothing.
const emojiSchema = z
  .string()
  .trim()
  .max(8)
  .optional()
  .transform((v) => (v === '' ? undefined : v));

export async function createIsland(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = z
    .object({ name: nameSchema, emoji: emojiSchema })
    .safeParse(input);
  if (!parsed.success) {
    return failed(parsed.error.issues[0].message);
  }

  const user = await requireUser();
  const db = getDb();
  const [row] = await db
    .insert(islands)
    .values({
      userId: user.id,
      name: parsed.data.name,
      emoji: parsed.data.emoji ?? '🏝️',
      position: await nextIslandPosition(user.id),
    })
    .returning({ id: islands.id });

  revalidatePath('/islands');
  return { ok: true, data: { id: row.id } };
}

export async function renameIsland(input: unknown): Promise<ActionResult> {
  const parsed = z
    .object({ islandId: z.string().min(1), name: nameSchema, emoji: emojiSchema })
    .safeParse(input);
  if (!parsed.success) {
    return failed(parsed.error.issues[0].message);
  }

  const user = await requireUser();
  const db = getDb();
  const updated = await db
    .update(islands)
    .set({
      name: parsed.data.name,
      emoji: parsed.data.emoji,
      updatedAt: new Date(),
    })
    .where(
      and(eq(islands.id, parsed.data.islandId), eq(islands.userId, user.id)),
    )
    .returning({ id: islands.id });

  if (updated.length === 0) return failed('Island not found.');

  revalidatePath('/islands');
  revalidatePath(`/islands/${parsed.data.islandId}`);
  return done;
}

export async function archiveIsland(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ islandId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return failed('Island not found.');

  const user = await requireUser();
  const db = getDb();
  const updated = await db
    .update(islands)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(eq(islands.id, parsed.data.islandId), eq(islands.userId, user.id)),
    )
    .returning({ id: islands.id });

  if (updated.length === 0) return failed('Island not found.');

  revalidatePath('/islands');
  return done;
}
