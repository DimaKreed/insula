'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { createIsland } from '@/actions/islands';

const SUGGESTED = ['🏝️', '💼', '🍽️', '🏃', '☕', '🛒', '🚌', '🏥', '🎧', '👋'];

/**
 * Creating an empty island by hand — the sheet only. The trigger lives in
 * `start-island.tsx`, which is the single entry point for every way of starting
 * an island; splitting them is what stops one page branch from wiring a button
 * the other branch forgets.
 *
 * The design has no artboard for this form, so it borrows the sheet language of
 * the island-detail menu: surface card, pop shadow, 44px controls.
 */
export function NewIsland({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(SUGGESTED[0]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) return null;

  function submit() {
    startTransition(async () => {
      const result = await createIsland({ name, emoji });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setName('');
      onClose();
      router.push(`/islands/${result.data.id}`);
    });
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/30 p-4 sm:items-center">
      <div className="flex w-full max-w-[380px] flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-pop">
        <div className="flex flex-col gap-1.5">
          <div className="text-[17px] font-semibold">New island</div>
          <p className="text-[13px] leading-relaxed text-ink3">
            An empty island, ready for the sentences you actually said today.
          </p>
        </div>

        <label className="flex flex-col gap-2 text-[12px] font-bold tracking-[1.2px] text-ink3 uppercase">
          Name
          <input
            autoFocus
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) submit();
            }}
            placeholder="Work, Groceries, Small talk…"
            className="h-11 rounded-xl border border-line bg-bg px-3.5 text-[15px] font-normal tracking-normal text-ink normal-case outline-none placeholder:text-ink3 focus-visible:border-teal"
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-bold tracking-[1.2px] text-ink3 uppercase">
            Icon
          </span>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED.map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => setEmoji(candidate)}
                aria-pressed={emoji === candidate}
                className={`flex size-11 items-center justify-center rounded-xl text-xl ${
                  emoji === candidate
                    ? 'bg-teal-soft ring-2 ring-teal'
                    : 'bg-surface2'
                }`}
              >
                {candidate}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-11 flex-1 rounded-xl border border-line text-[14px] font-semibold text-ink2 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || name.trim() === ''}
            onClick={submit}
            className="h-11 flex-1 rounded-xl bg-primary text-[14px] font-semibold text-on-primary disabled:opacity-50"
          >
            {pending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
