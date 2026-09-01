'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';

import { unarchiveIsland } from '@/actions/islands';

/** Brings one archived island back. The slow way back, next to the fast Undo. */
export function RestoreIsland({
  islandId,
  name,
}: {
  islandId: string;
  name: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await unarchiveIsland({ islandId });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`"${name}" is back in your islands.`);
        })
      }
      className="h-9 shrink-0 rounded-lg border border-line px-3 text-[12.5px] font-semibold text-ink2 disabled:opacity-50"
    >
      {pending ? 'Restoring…' : 'Restore'}
    </button>
  );
}
