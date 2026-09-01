'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { archiveIsland, unarchiveIsland } from '@/actions/islands';
import { MoreIcon } from '@/components/icons';

/**
 * Per-row island menu. Archiving lives here rather than inside the island
 * because the problem it solves is a list full of islands you don't want —
 * making you open each one first would be the slower half of the same chore.
 *
 * Archiving is reversible, and the Undo in the toast is the fast way back; the
 * Archived section at the foot of the list is the slow one.
 */
export function IslandMenu({
  islandId,
  name,
  sentenceCount,
}: {
  islandId: string;
  name: string;
  sentenceCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Click-away, so the menu never strands itself open over the list.
  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function archive() {
    setOpen(false);
    startTransition(async () => {
      const result = await archiveIsland({ islandId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`"${name}" archived.`, {
        action: {
          label: 'Undo',
          onClick: () => {
            void unarchiveIsland({ islandId }).then((undone) => {
              if (!undone.ok) toast.error(undone.error);
            });
          },
        },
      });
    });
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={`Options for ${name}`}
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        className="flex size-11 items-center justify-center rounded-full text-ink3 transition-colors hover:bg-surface2 hover:text-ink disabled:opacity-50"
      >
        <MoreIcon size={18} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 flex w-56 flex-col gap-0.5 rounded-xl border border-line bg-surface p-1.5 shadow-pop"
        >
          <button
            type="button"
            role="menuitem"
            onClick={archive}
            className="flex flex-col gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-surface2"
          >
            <span className="text-[13.5px] font-semibold">Archive</span>
            <span className="text-[11.5px] leading-snug text-ink3">
              Hides it from the list. {sentenceCount} sentence
              {sentenceCount === 1 ? '' : 's'} and their review history are kept.
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
