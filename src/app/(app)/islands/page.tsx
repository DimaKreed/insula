import Link from 'next/link';

import { requireUser } from '@/auth';
import { PlayIcon } from '@/components/icons';
import { DownloadButton } from '@/components/islands/download-button';
import { NewIsland } from '@/components/islands/new-island';
import { listIslands, type IslandListItem } from '@/db/queries/islands';

export const metadata = { title: 'Islands · Insula' };

/**
 * The island card from the Main artboard: the row itself opens the island, and
 * the two round buttons play it and save it for offline. They sit beside the
 * link rather than inside it — a button nested in an anchor is invalid markup
 * and taps land unpredictably on mobile.
 */
function IslandRow({ island }: { island: IslandListItem }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-card">
      <Link
        href={`/islands/${island.id}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <div className="flex size-11 items-center justify-center rounded-xl bg-surface2 text-[22px]">
          {island.emoji ?? '🏝️'}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="truncate text-base font-semibold">{island.name}</div>
          <div className="text-[13px] text-ink3">
            {island.sentenceCount === 0
              ? 'No sentences yet'
              : `${island.sentenceCount} ${
                  island.sentenceCount === 1 ? 'sentence' : 'sentences'
                } · ${island.audioCount} with audio`}
          </div>
        </div>
      </Link>

      {island.audioCount > 0 ? (
        <Link
          href={`/player/${island.id}`}
          aria-label={`Play ${island.name}`}
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line text-ink2 transition-colors hover:bg-surface2"
        >
          <PlayIcon size={18} />
        </Link>
      ) : null}
      <DownloadButton islandId={island.id} audioCount={island.audioCount} />
    </li>
  );
}

function EmptyState() {
  const steps = [
    'Capture sentences from your day — in English.',
    'Insula translates them into Romanian, with natural audio.',
    'Listen on your commute, recall daily — speak in weeks.',
  ];

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8">
        <svg
          width="110"
          height="90"
          viewBox="0 0 110 90"
          fill="none"
          stroke="var(--ink3)"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M30 52c0-16 11-28 25-28s25 12 25 28" />
          <path d="M38 52c0-11 7.5-19 17-19s17 8 17 19" />
          <path d="M46 52c0-6 4-10 9-10s9 4 9 10" />
          <path
            d="M10 66c5-4 10-4 15 0s10 4 15 0 10-4 15 0 10 4 15 0 10-4 15 0 10 4 15 0"
            stroke="var(--teal)"
          />
          <path
            d="M18 78c5-4 10-4 15 0s10 4 15 0 10-4 15 0 10 4 15 0 10-4 15 0"
            stroke="var(--teal)"
            opacity="0.5"
          />
        </svg>
        <h2 className="text-center text-[22px] font-semibold tracking-[-0.3px]">
          Build your first island
        </h2>
        <ol className="flex w-full max-w-[330px] flex-col gap-3.5">
          {steps.map((step, i) => (
            <li key={step} className="flex items-baseline gap-3">
              <span className="min-w-3.5 font-serif text-[15px] text-sand-ink">
                {i + 1}
              </span>
              <span className="text-[15px] leading-relaxed text-ink2">
                {step}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex flex-col gap-3 px-6 pb-5">
        <NewIsland variant="inline" />
      </div>
    </div>
  );
}

export default async function IslandsPage() {
  const user = await requireUser();
  const islands = await listIslands(user.id);

  if (islands.length === 0) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-[440px] flex-col lg:max-w-none lg:px-12 lg:py-10">
        <div className="px-6 pt-16 lg:px-0 lg:pt-0">
          <h1 className="text-[28px] font-bold tracking-[-0.4px] lg:text-[30px] lg:tracking-[-0.5px]">
            Islands
          </h1>
        </div>
        <EmptyState />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[440px] pb-4 lg:max-w-none lg:px-12 lg:py-10">
      <div className="flex items-center justify-between px-6 pt-15 pb-4 lg:px-0 lg:pt-0 lg:pb-6">
        <h1 className="text-[28px] font-bold tracking-[-0.4px] lg:text-[30px] lg:tracking-[-0.5px]">
          Islands
        </h1>
      </div>

      <ul className="flex flex-col gap-2.5 px-5 lg:grid lg:grid-cols-3 lg:gap-5 lg:px-0">
        {islands.map((island) => (
          <IslandRow key={island.id} island={island} />
        ))}
      </ul>

      <NewIsland variant="fab" />
    </main>
  );
}
