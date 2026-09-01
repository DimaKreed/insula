import { notFound } from 'next/navigation';

import { requireUser } from '@/auth';
import { Player } from '@/components/player/player';
import { getIsland } from '@/db/queries/islands';
import { islandPlaylist } from '@/db/queries/sentences';
import { userSettings } from '@/db/queries/users';
import { listenHintMode } from '@/lib/player/listen-hints';

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ islandId: string }>;
}) {
  const { islandId } = await params;
  const user = await requireUser();
  const island = await getIsland(user.id, islandId);
  if (!island) notFound();

  const [items, settings] = await Promise.all([
    islandPlaylist(user.id, island.id),
    userSettings(user.id),
  ]);
  if (items.length === 0) notFound();

  return (
    <Player
      islandId={island.id}
      islandName={island.name}
      islandEmoji={island.emoji}
      items={items}
      hintMode={listenHintMode(settings)}
    />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ islandId: string }>;
}) {
  const { islandId } = await params;
  const user = await requireUser();
  const island = await getIsland(user.id, islandId);
  return { title: island ? `${island.name} · Insula` : 'Insula' };
}
