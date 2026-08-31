import { notFound } from 'next/navigation';

import { requireUser } from '@/auth';
import { Player } from '@/components/player/player';
import { getIsland } from '@/db/queries/islands';
import { islandPlaylist } from '@/db/queries/sentences';

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ islandId: string }>;
}) {
  const { islandId } = await params;
  const user = await requireUser();
  const island = await getIsland(user.id, islandId);
  if (!island) notFound();

  const items = await islandPlaylist(user.id, island.id);
  if (items.length === 0) notFound();

  return (
    <Player
      islandId={island.id}
      islandName={island.name}
      islandEmoji={island.emoji}
      items={items}
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
