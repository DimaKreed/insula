'use client';

import { useEffect, useState } from 'react';

import { CheckCircleIcon } from '@/components/icons';
import { offlineState, offlineSupported } from '@/lib/offline';

/**
 * The teal "Offline" mark from the IslandDetail and Player artboards. Renders
 * nothing until the island's audio is actually on the device — an absent badge
 * is the honest state, a greyed-out one would just be noise.
 */
export function OfflineBadge({ islandId }: { islandId: string }) {
  const [cached, setCached] = useState(0);

  useEffect(() => {
    if (!offlineSupported()) return;
    let active = true;
    offlineState(islandId).then((state) => {
      if (active) setCached(state.cached);
    });
    return () => {
      active = false;
    };
  }, [islandId]);

  if (cached === 0) return null;

  return (
    <span className="flex items-center gap-1.5 font-semibold text-teal">
      <CheckCircleIcon size={13} />
      Offline
    </span>
  );
}
