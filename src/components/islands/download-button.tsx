'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { CheckCircleIcon, DownloadIcon } from '@/components/icons';
import { downloadIsland, offlineState, offlineSupported } from '@/lib/offline';

/**
 * "Download island" from the Main artboard: the second round button on an
 * island row, teal with a check once the audio is on the device.
 *
 * Deliberately not a server action — the download *is* the client's cache, so
 * only the browser can know or change it.
 */
export function DownloadButton({
  islandId,
  audioCount,
}: {
  islandId: string;
  audioCount: number;
}) {
  const [downloaded, setDownloaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!offlineSupported()) return;
    let active = true;
    offlineState(islandId).then((state) => {
      if (active) setDownloaded(state.downloaded && state.cached > 0);
    });
    return () => {
      active = false;
    };
  }, [islandId]);

  async function download() {
    setBusy(true);
    try {
      const state = await downloadIsland(islandId);
      setDownloaded(state.cached > 0);
      toast.success(
        `${state.cached} ${state.cached === 1 ? 'sentence' : 'sentences'} saved for offline listening`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Download failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  const label = downloaded
    ? 'Saved for offline — tap to refresh'
    : 'Download for offline listening';

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy || audioCount === 0}
      aria-label={label}
      title={label}
      className={`flex size-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
        downloaded
          ? 'bg-teal-soft text-teal'
          : 'border border-line text-ink2 hover:bg-surface2'
      }`}
    >
      {busy ? (
        <span
          className="size-2 rounded-full bg-current"
          style={{ animation: 'insula-pulse 1.4s infinite' }}
        />
      ) : downloaded ? (
        <CheckCircleIcon size={19} />
      ) : (
        <DownloadIcon size={19} />
      )}
    </button>
  );
}
