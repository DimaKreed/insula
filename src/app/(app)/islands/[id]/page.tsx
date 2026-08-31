import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireUser } from '@/auth';
import { CaptureBox } from '@/components/capture/capture-box';
import { ChevronLeftIcon, PlayIcon } from '@/components/icons';
import { OfflineBadge } from '@/components/islands/offline-badge';
import { SentenceRow } from '@/components/islands/sentence-row';
import { StatusPoller } from '@/components/islands/status-poller';
import { getIsland } from '@/db/queries/islands';
import { listSentences } from '@/db/queries/sentences';
import { statusFingerprint } from '@/lib/status';

export default async function IslandDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const island = await getIsland(user.id, id);
  if (!island) notFound();

  const sentences = await listSentences(user.id, island.id);
  const withAudio = sentences.filter((s) => s.audioUrl !== null).length;
  const pending = sentences.filter(
    (s) => s.status !== 'ready' && s.status !== 'error',
  ).length;
  const fingerprint = statusFingerprint(
    sentences.map((s) => ({
      id: s.id,
      status: s.status,
      hasAudio: s.audioUrl !== null,
    })),
  );

  return (
    <main className="mx-auto flex w-full max-w-[440px] flex-col pb-4 lg:max-w-none lg:px-12 lg:py-10">
      <StatusPoller
        islandId={island.id}
        pending={pending}
        fingerprint={fingerprint}
      />

      <div className="flex items-center gap-2.5 px-5 pt-14 pb-3 lg:px-0 lg:pt-0">
        <Link
          href="/islands"
          aria-label="Back to islands"
          className="-ml-3 flex size-11 items-center justify-center text-ink2 hover:text-ink"
        >
          <ChevronLeftIcon size={22} />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-xl">{island.emoji ?? '🏝️'}</span>
            <h1 className="truncate text-xl font-bold tracking-[-0.3px]">
              {island.name}
            </h1>
          </div>
          <div className="flex items-center gap-1.5 text-[12.5px] text-ink3">
            <span>
              {sentences.length === 0
                ? 'No sentences yet'
                : `${sentences.length} ${
                    sentences.length === 1 ? 'sentence' : 'sentences'
                  } · ${withAudio} with audio`}
            </span>
            <OfflineBadge islandId={island.id} />
          </div>
        </div>
        {withAudio > 0 ? (
          <Link
            href={`/player/${island.id}`}
            className="flex h-11 items-center gap-[7px] rounded-xl bg-teal-soft px-4 text-sm font-semibold text-teal"
          >
            <PlayIcon size={15} />
            Play
          </Link>
        ) : null}
      </div>

      <CaptureBox islandId={island.id} />

      <div className="flex items-center justify-between px-6 pt-4.5 pb-2 lg:px-0">
        <span className="text-[12px] font-bold tracking-[1.2px] text-ink3 uppercase">
          Sentences
        </span>
        {sentences.length > 0 ? (
          <span className="text-[12px] text-ink3">newest first</span>
        ) : null}
      </div>

      {sentences.length === 0 ? (
        <p className="mx-5 rounded-2xl border border-line bg-surface p-6 text-center text-[14px] leading-relaxed text-ink3 shadow-card lg:mx-0">
          Paste a few sentences you actually said today — one per line. Insula
          translates them into Romanian and voices them.
        </p>
      ) : (
        <ul className="mx-5 overflow-hidden rounded-2xl border border-line bg-surface shadow-card lg:mx-0">
          {sentences.map((sentence) => (
            <SentenceRow key={sentence.id} sentence={sentence} />
          ))}
        </ul>
      )}
    </main>
  );
}
