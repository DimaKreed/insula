'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import {
  deletePreset,
  relinkPresetAudio,
  setPresetPublished,
} from '@/actions/presets';
import { RetryIcon, TrashIcon } from '@/components/icons';

/**
 * Admin controls for one preset: publish/unpublish, re-link audio, delete.
 *
 * Re-link exists as its own button because recordings can appear after the
 * preset does — `npm run audio:backfill` finishing, or another user capturing
 * the same sentence — and until they are linked, an import re-synthesizes what
 * already exists.
 */
export function PresetAdminRow({
  presetId,
  name,
  published,
  audioCount,
  sentenceCount,
}: {
  presetId: string;
  name: string;
  published: boolean;
  audioCount: number;
  sentenceCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(work: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work.');
        return;
      }
      if (done) toast.success(done);
      router.refresh();
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(
            () => setPresetPublished({ presetId, published: !published }),
            published ? `"${name}" unpublished.` : `"${name}" published.`,
          )
        }
        className={`h-9 rounded-lg px-2.5 text-[12.5px] font-semibold disabled:opacity-50 ${
          published
            ? 'bg-teal-soft text-teal'
            : 'border border-line text-ink3'
        }`}
      >
        {published ? 'Published' : 'Draft'}
      </button>

      {audioCount < sentenceCount ? (
        <button
          type="button"
          disabled={pending}
          aria-label="Re-link audio"
          title={`${sentenceCount - audioCount} sentence(s) without audio — re-link`}
          onClick={() =>
            startTransition(async () => {
              const result = await relinkPresetAudio({ presetId });
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success(
                `Linked ${result.data.linked}; ${result.data.missing} still without audio.`,
              );
              router.refresh();
            })
          }
          className="flex size-9 items-center justify-center rounded-lg border border-line text-ink2 disabled:opacity-50"
        >
          <RetryIcon size={15} />
        </button>
      ) : null}

      <button
        type="button"
        disabled={pending}
        aria-label={`Delete ${name}`}
        onClick={() => {
          if (
            !confirm(
              `Delete the preset "${name}"? Islands people already imported are kept.`,
            )
          ) {
            return;
          }
          run(() => deletePreset({ presetId }), `"${name}" deleted.`);
        }}
        className="flex size-9 items-center justify-center rounded-lg border border-line text-ink3 hover:text-ink disabled:opacity-50"
      >
        <TrashIcon size={15} />
      </button>
    </div>
  );
}
