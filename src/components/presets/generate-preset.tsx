'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { generatePresetIsland } from '@/actions/generate';
import { SparkIcon } from '@/components/icons';

/**
 * The admin preset builder — same machinery as the user-facing
 * `generate-island.tsx`, pointed at `preset_islands` instead of the admin's own
 * account, and published straight away.
 *
 * Not merged with that component: the copy differs (a curator is choosing what
 * every learner sees, not scaffolding their own day), and the admin form is
 * flat on the page rather than a sheet, since it is the page's whole purpose.
 */
export function GeneratePreset() {
  const [name, setName] = useState('');
  const [brief, setBrief] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    setRefusal(null);
    startTransition(async () => {
      const result = await generatePresetIsland({ brief, name });
      if (!result.ok) {
        setRefusal(result.error);
        return;
      }
      setBrief('');
      setName('');
      toast.success(
        `Published with ${result.data.sentenceCount} sentences. Audio is being synthesized.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex flex-col gap-1">
        <div className="text-[15px] font-semibold">Generate a topic</div>
        <p className="text-[12.5px] leading-relaxed text-ink3">
          Describe the topic the way a learner would, listing what it has to
          cover. Published immediately and importable by everyone. Audio runs in
          the background; the preset links to the shared recordings once they
          exist, so imports stay free.
        </p>
      </div>

      {refusal ? (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-xl border border-err/40 bg-err-soft px-3.5 py-3"
        >
          <span className="text-[13px] font-semibold text-err">
            Not generated
          </span>
          <span className="text-[12.5px] leading-relaxed text-ink2">
            {refusal}
          </span>
        </div>
      ) : null}

      <textarea
        value={brief}
        maxLength={600}
        rows={4}
        onChange={(e) => setBrief(e.target.value)}
        placeholder="Describe the topic and what it has to cover — e.g. At the post office: sending a parcel, asking about delivery time, picking something up with an ID."
        className="resize-none rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] leading-relaxed outline-none placeholder:text-ink3 focus-visible:border-teal"
      />

      <input
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        placeholder="Preset name (optional — one gets suggested)"
        className="h-11 rounded-xl border border-line bg-bg px-3.5 text-[15px] outline-none placeholder:text-ink3 focus-visible:border-teal"
      />

      <button
        type="button"
        disabled={pending || brief.trim().length < 10}
        onClick={submit}
        className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-[14px] font-semibold text-on-primary disabled:opacity-50"
      >
        <SparkIcon size={17} />
        {pending ? 'Writing 20 sentences…' : 'Generate & publish'}
      </button>
    </div>
  );
}
