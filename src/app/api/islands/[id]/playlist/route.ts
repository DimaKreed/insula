import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { getIsland } from '@/db/queries/islands';
import { islandPlaylist } from '@/db/queries/sentences';

/**
 * The island's playlist manifest, consumed by two callers: the player, and the
 * "download for offline" action in the service worker's cache (Implementation
 * Plan section 2.2). One shape serves both — a list of audio URLs in study
 * order, with the text the player displays and the lock screen shows.
 *
 * Deliberately a route handler rather than server-component data: the manifest
 * itself is cached offline, so it has to be a URL.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const island = await getIsland(session.user.id, id);
  if (!island) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const items = await islandPlaylist(session.user.id, id);

  return NextResponse.json(
    {
      islandId: island.id,
      name: island.name,
      emoji: island.emoji,
      targetLang: island.targetLang,
      items,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
