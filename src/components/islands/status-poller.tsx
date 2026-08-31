'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { statusFingerprint, type StatusRow } from '@/lib/status';

/**
 * Polls `/api/islands/[id]/status` while any sentence is still being
 * translated or voiced, and refreshes the server-rendered list when something
 * changed. Stops once every row is terminal (Implementation Plan section 4.1).
 *
 * The endpoint returns statuses only, so a quiet poll is a few hundred bytes;
 * the page itself re-renders only when the numbers actually move, which is what
 * keeps this cheap enough not to need a query library.
 */
const INTERVAL_MS = 2500;

interface StatusResponse {
  pending: number;
  sentences: StatusRow[];
}

export function StatusPoller({
  islandId,
  pending,
  fingerprint,
}: {
  islandId: string;
  /** Rows still translating or awaiting audio at render time. 0 = no polling. */
  pending: number;
  /** The rendered page's own fingerprint — the baseline a poll is compared to. */
  fingerprint: string;
}) {
  const router = useRouter();
  const seen = useRef(fingerprint);

  useEffect(() => {
    if (pending === 0) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const response = await fetch(`/api/islands/${islandId}/status`, {
          cache: 'no-store',
        });
        if (!response.ok) return;

        const data = (await response.json()) as StatusResponse;
        const current = statusFingerprint(data.sentences);

        if (seen.current !== current) {
          seen.current = current;
          router.refresh();
        }

        // Nothing left in flight: stop before `finally` arms the next tick.
        if (data.pending === 0) stopped = true;
      } catch {
        // Offline or a transient failure — try again on the next tick.
      } finally {
        if (!stopped) timer = setTimeout(poll, INTERVAL_MS);
      }
    }

    timer = setTimeout(poll, INTERVAL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [islandId, pending, router]);

  return null;
}
