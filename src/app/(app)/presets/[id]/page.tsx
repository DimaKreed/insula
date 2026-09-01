import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireUser } from '@/auth';
import { ChevronLeftIcon } from '@/components/icons';
import { ImportButton } from '@/components/presets/import-button';
import { SamplePlayer } from '@/components/presets/sample-player';
import {
  existingIslandForPreset,
  getPreset,
  listPresetSentences,
} from '@/db/queries/presets';

/**
 * Preview a topic before adding it: every sentence, its note, and a tap to hear
 * the Romanian. Reading the sentences first is the point — a topic whose
 * sentences do not sound like the learner's life is worth skipping.
 */
export default async function PresetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const preset = await getPreset(id);
  if (!preset || !preset.published) notFound();

  const [sentences, existingIslandId] = await Promise.all([
    listPresetSentences(preset.id),
    existingIslandForPreset(user.id, preset),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-[440px] flex-col pb-6 lg:max-w-none lg:px-12 lg:py-10">
      <div className="flex items-center gap-2.5 px-5 pt-14 pb-3 lg:px-0 lg:pt-0">
        <Link
          href="/presets"
          aria-label="Back to topics"
          className="-ml-3 flex size-11 items-center justify-center text-ink2 hover:text-ink"
        >
          <ChevronLeftIcon size={22} />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-xl">{preset.emoji ?? '🏝️'}</span>
            <h1 className="truncate text-xl font-bold tracking-[-0.3px]">
              {preset.name}
            </h1>
          </div>
          <div className="text-[12.5px] text-ink3">
            {sentences.length} sentences
            {preset.level ? ` · ${preset.level}` : ''}
          </div>
        </div>
        <ImportButton
          presetId={preset.id}
          name={preset.name}
          existingIslandId={existingIslandId}
        />
      </div>

      {preset.description ? (
        <p className="px-6 pb-3 text-[13.5px] leading-relaxed text-ink2 lg:px-0">
          {preset.description}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2 px-5 lg:px-0">
        {sentences.map((sentence) => (
          <li
            key={sentence.id}
            className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-card"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[15px] leading-snug font-medium">
                {sentence.targetText}
              </span>
              <span className="text-[13px] leading-snug text-ink3">
                {sentence.sourceText}
              </span>
              {sentence.translationNote ? (
                <span className="pt-0.5 text-[12.5px] leading-relaxed text-sand-ink">
                  {sentence.translationNote}
                </span>
              ) : null}
            </div>
            <SamplePlayer url={sentence.audioUrl} />
          </li>
        ))}
      </ul>

      {!existingIslandId ? (
        <p className="px-6 pt-5 text-center text-[12.5px] leading-relaxed text-ink3 lg:px-0">
          Adding this is free and instant. It gives you a scaffold — the island
          starts working once you add sentences from your own day.
        </p>
      ) : null}
    </main>
  );
}
