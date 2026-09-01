import Link from 'next/link';

import { requireUser } from '@/auth';
import { StartIsland } from '@/components/islands/start-island';
import { ImportButton } from '@/components/presets/import-button';
import { listPresets, type PresetListItem } from '@/db/queries/presets';
import { generationGate } from '@/lib/islands/generation-gate';

export const metadata = { title: 'Topics · Insula' };

/**
 * Browse the shared starter topics. Adding one is free and consumes no quota:
 * the sentences are already translated and the recordings are shared, so an
 * import clones rows and links the same `audio_assets` ids.
 *
 * Framed as topics-to-start-from rather than as a library to collect. The copy
 * says so in one line, and every path out of here lands on capture.
 */
function PresetRow({ preset }: { preset: PresetListItem }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-card">
      <Link
        href={`/presets/${preset.id}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface2 text-[22px]">
          {preset.emoji ?? '🏝️'}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-semibold">
              {preset.name}
            </span>
            {preset.level ? (
              <span className="shrink-0 rounded-full bg-surface2 px-2 py-0.5 text-[11px] font-bold text-ink3">
                {preset.level}
              </span>
            ) : null}
          </div>
          <div className="truncate text-[13px] text-ink3">
            {preset.description ??
              `${preset.sentenceCount} sentences · ${preset.audioCount} with audio`}
          </div>
        </div>
      </Link>

      <ImportButton
        presetId={preset.id}
        name={preset.name}
        existingIslandId={preset.existingIslandId}
      />
    </li>
  );
}

export default async function PresetsPage() {
  const user = await requireUser();
  const [presets, gate] = await Promise.all([
    listPresets(user.id),
    generationGate(user),
  ]);

  return (
    <main className="mx-auto w-full max-w-[440px] pb-4 lg:max-w-none lg:px-12 lg:py-10">
      <div className="flex flex-col gap-1.5 px-6 pt-15 pb-4 lg:px-0 lg:pt-0 lg:pb-6">
        <h1 className="text-[28px] font-bold tracking-[-0.4px] lg:text-[30px] lg:tracking-[-0.5px]">
          Topics
        </h1>
        <p className="text-[13.5px] leading-relaxed text-ink3">
          Ready-made islands to get a subject off the ground. Adding one is
          free — then fill it out with sentences from your own day. Nothing here
          fits? Describe your own topic instead.
        </p>
      </div>

      {presets.length === 0 ? (
        <p className="mx-5 rounded-2xl border border-line bg-surface p-6 text-center text-[14px] leading-relaxed text-ink3 shadow-card lg:mx-0">
          No topics published yet. You can still{' '}
          <Link href="/islands" className="font-semibold text-teal">
            start one from a topic
          </Link>{' '}
          of your own.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5 px-5 lg:grid lg:grid-cols-2 lg:gap-5 lg:px-0">
          {presets.map((preset) => (
            <PresetRow key={preset.id} preset={preset} />
          ))}
        </ul>
      )}

      <StartIsland
        variant="fab"
        generationBlocked={gate.blocked}
        blockedReason={gate.blocked ? gate.message : undefined}
      />
    </main>
  );
}
