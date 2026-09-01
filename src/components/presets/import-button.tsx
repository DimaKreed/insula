'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { importPresetIsland } from '@/actions/presets';
import { ChevronLeftIcon, PlusIcon } from '@/components/icons';

/**
 * Adds a topic to the user's islands, or opens the island they already have.
 *
 * "Open" rather than a dead "Added" because the useful answer to "you have this
 * already" is a way to get there. It is also the guard against the duplication
 * that already happened: the 12 seeded islands had no import row, so every topic
 * looked addable and adding one produced a second identical island.
 */
export function ImportButton({
  presetId,
  name,
  existingIslandId,
}: {
  presetId: string;
  name: string;
  existingIslandId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (existingIslandId) {
    return (
      <Link
        href={`/islands/${existingIslandId}`}
        className="flex h-11 shrink-0 items-center gap-1 rounded-xl border border-line px-3.5 text-[13.5px] font-semibold text-ink2 transition-colors hover:bg-surface2"
      >
        Open
        <ChevronLeftIcon size={16} className="rotate-180" />
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await importPresetIsland({ presetId });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`"${name}" added — now add a sentence of your own.`);
          router.push(`/islands/${result.data.islandId}`);
        })
      }
      className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-[13.5px] font-semibold text-on-primary disabled:opacity-50"
    >
      <PlusIcon size={16} />
      {pending ? 'Adding…' : 'Add'}
    </button>
  );
}
