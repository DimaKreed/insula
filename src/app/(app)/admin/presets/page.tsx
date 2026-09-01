import Link from 'next/link';

import { requireAdmin } from '@/auth';
import { GeneratePreset } from '@/components/presets/generate-preset';
import { PresetAdminRow } from '@/components/presets/preset-admin-row';
import { listPresets } from '@/db/queries/presets';

export const metadata = { title: 'Presets · Admin · Insula' };

/**
 * The preset builder. Drafts are visible here and nowhere else — `listPresets`
 * only returns unpublished rows when asked.
 *
 * "audio n/m" is the number that matters on this screen: a preset whose
 * sentences have no linked recording makes every importer re-synthesize, which
 * is the one thing presets exist to avoid.
 */
export default async function AdminPresetsPage() {
  const admin = await requireAdmin();
  const presets = await listPresets(admin.id, true);

  const withoutAudio = presets.filter(
    (p) => p.audioCount < p.sentenceCount,
  ).length;

  return (
    <main className="mx-auto flex w-full max-w-[440px] flex-col gap-4 pb-6 lg:max-w-[760px] lg:px-12 lg:py-10">
      <div className="flex flex-col gap-1.5 px-6 pt-15 lg:px-0 lg:pt-0">
        <h1 className="text-[28px] font-bold tracking-[-0.4px]">Presets</h1>
        <p className="text-[13px] leading-relaxed text-ink3">
          {presets.length} preset(s)
          {withoutAudio > 0
            ? ` · ${withoutAudio} with unlinked audio`
            : ' · all audio linked'}
          . Seed the 12 curated topics with{' '}
          <code className="rounded bg-surface2 px-1 py-0.5 text-[12px]">
            npm run presets:seed
          </code>
          .
        </p>
      </div>

      <div className="px-5 lg:px-0">
        <GeneratePreset />
      </div>

      <ul className="flex flex-col gap-2 px-5 lg:px-0">
        {presets.map((preset) => (
          <li
            key={preset.id}
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-card"
          >
            <Link
              href={`/presets/${preset.id}`}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface2 text-[20px]">
                {preset.emoji ?? '🏝️'}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="truncate text-[15px] font-semibold">
                  {preset.name}
                </div>
                <div className="text-[12.5px] text-ink3">
                  {preset.sentenceCount} sentences · audio{' '}
                  {preset.audioCount}/{preset.sentenceCount} ·{' '}
                  {preset.origin === 'generated'
                    ? `generated (${preset.promptVersion ?? '?'})`
                    : 'seed'}
                </div>
              </div>
            </Link>

            <PresetAdminRow
              presetId={preset.id}
              name={preset.name}
              published={preset.published}
              audioCount={preset.audioCount}
              sentenceCount={preset.sentenceCount}
            />
          </li>
        ))}
      </ul>
    </main>
  );
}
