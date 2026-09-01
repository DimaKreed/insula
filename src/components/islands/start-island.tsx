'use client';

import Link from 'next/link';
import { useState } from 'react';

import { PlusIcon, PresetsIcon, SparkIcon } from '@/components/icons';
import { GenerateIsland } from '@/components/islands/generate-island';
import { NewIsland } from '@/components/islands/new-island';

/**
 * The one way to start an island, in every state of the islands page.
 *
 * This component exists because the previous shape put a button in each page
 * branch: the empty state offered generation, the populated state offered only
 * manual creation, and generation was therefore invisible to anyone who already
 * had an island — which is everyone after their first day. One trigger, one
 * choice sheet, rendered by both branches, makes that class of bug impossible.
 *
 * Order is a claim about the method: describing a topic comes first because it
 * is what gets someone unstuck, but the copy underneath says plainly that the
 * sentences that matter are the ones you add yourself.
 */
export function StartIsland({
  variant,
  generationBlocked = false,
  blockedReason,
}: {
  variant: 'fab' | 'inline';
  /** Off-topic cooldown in force. The option is shown disabled, never hidden. */
  generationBlocked?: boolean;
  blockedReason?: string;
}) {
  const [choosing, setChoosing] = useState(false);
  const [sheet, setSheet] = useState<'generate' | 'manual' | null>(null);

  return (
    <>
      {variant === 'fab' ? (
        <button
          type="button"
          onClick={() => setChoosing(true)}
          aria-label="Start an island"
          className="fixed right-5 bottom-24 flex size-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-pop lg:right-10 lg:bottom-10"
        >
          <PlusIcon size={24} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setChoosing(true)}
          className="flex h-[54px] items-center justify-center gap-2 rounded-[14px] bg-primary text-[15px] font-semibold text-on-primary"
        >
          <PlusIcon size={18} />
          Start your first island
        </button>
      )}

      {choosing ? (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/30 p-4 sm:items-center">
          <div className="flex w-full max-w-[380px] flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-pop">
            <div className="text-[17px] font-semibold">Start an island</div>

            <button
              type="button"
              disabled={generationBlocked}
              onClick={() => {
                setChoosing(false);
                setSheet('generate');
              }}
              className="flex items-start gap-3 rounded-xl border border-line p-3.5 text-left hover:bg-surface2 disabled:opacity-50 disabled:hover:bg-transparent"
            >
              <SparkIcon size={20} className="mt-0.5 shrink-0 text-teal" />
              <span className="flex flex-col gap-0.5">
                <span className="text-[14.5px] font-semibold">
                  Describe a topic
                </span>
                <span className="text-[12.5px] leading-relaxed text-ink3">
                  {generationBlocked
                    ? blockedReason
                    : 'Say what you want to be able to say. You get 20 sentences to start from.'}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setChoosing(false);
                setSheet('manual');
              }}
              className="flex items-start gap-3 rounded-xl border border-line p-3.5 text-left hover:bg-surface2"
            >
              <PlusIcon size={20} className="mt-0.5 shrink-0 text-ink2" />
              <span className="flex flex-col gap-0.5">
                <span className="text-[14.5px] font-semibold">
                  Create an empty island
                </span>
                <span className="text-[12.5px] leading-relaxed text-ink3">
                  Start from nothing and add your own sentences. This is the
                  method working properly.
                </span>
              </span>
            </button>

            <Link
              href="/presets"
              onClick={() => setChoosing(false)}
              className="flex items-start gap-3 rounded-xl border border-line p-3.5 text-left hover:bg-surface2"
            >
              <PresetsIcon size={20} className="mt-0.5 shrink-0 text-ink2" />
              <span className="flex flex-col gap-0.5">
                <span className="text-[14.5px] font-semibold">
                  Browse ready-made topics
                </span>
                <span className="text-[12.5px] leading-relaxed text-ink3">
                  Curated islands with audio already made. Free to add.
                </span>
              </span>
            </Link>

            <button
              type="button"
              onClick={() => setChoosing(false)}
              className="mt-1 h-11 rounded-xl border border-line text-[14px] font-semibold text-ink2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <GenerateIsland
        open={sheet === 'generate'}
        onClose={() => setSheet(null)}
      />
      <NewIsland open={sheet === 'manual'} onClose={() => setSheet(null)} />
    </>
  );
}
