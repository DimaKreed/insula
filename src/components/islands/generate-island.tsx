'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { generateUserIsland } from '@/actions/generate';

/**
 * Describing a topic in your own words — the sheet only; the trigger is in
 * `start-island.tsx`.
 *
 * One free-text brief carries everything: who you are, the situation, and the
 * specific things you want to be able to say. That last part is the point — the
 * prompt treats a list of wants as a specification, not a hint.
 *
 * Framed throughout as a scaffold, not a substitute. The method works because
 * the sentences are the learner's own; twenty machine-written ones are only a
 * way to stop staring at an empty screen.
 */

const EXAMPLES = [
  {
    label: 'Taxi driver',
    brief:
      "Hi, I work as a taxi driver. Write me some basic phrases: how to greet clients, how to give change, and how to ask for the address.",
  },
  {
    label: 'At the doctor',
    brief:
      'I need to describe symptoms at the doctor, ask what a medicine is for, and understand what they tell me to do.',
  },
  {
    label: 'Standups in English',
    brief:
      'I work remotely as a backend developer and my standups are in English. I want to say what I did yesterday, what I am doing today, and what is blocking me.',
  },
];

export function GenerateIsland({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [brief, setBrief] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) return null;

  function close() {
    setRefusal(null);
    onClose();
  }

  function submit() {
    setRefusal(null);
    startTransition(async () => {
      const result = await generateUserIsland({ brief, name });
      if (!result.ok) {
        // Kept on screen rather than toasted: a refusal carries a consequence
        // the reader has to actually read, and the brief stays for rewriting.
        setRefusal(result.error);
        return;
      }
      setBrief('');
      setName('');
      onClose();
      toast.success(
        `${result.data.sentenceCount} sentences to start with — now add your own.`,
      );
      router.push(`/islands/${result.data.islandId}`);
    });
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center overflow-y-auto bg-black/30 p-4 sm:items-center">
      <div className="flex w-full max-w-[420px] flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-pop">
        <div className="flex flex-col gap-1.5">
          <div className="text-[17px] font-semibold">Describe a topic</div>
          <p className="text-[13px] leading-relaxed text-ink3">
            Say what you want to be able to say, in your own words — any
            language. You&apos;ll get 20 sentences to start from, then fill the
            island out with the ones from your own day.
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

        <label className="flex flex-col gap-2 text-[12px] font-bold tracking-[1.2px] text-ink3 uppercase">
          What do you want to be able to say?
          <textarea
            autoFocus
            value={brief}
            maxLength={600}
            rows={5}
            onChange={(e) => setBrief(e.target.value)}
            placeholder={
              'Hi, I work as a taxi driver. Write me some basic phrases: how to greet clients, how to give change, how to ask for the address.'
            }
            className="resize-none rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[14px] leading-relaxed font-normal tracking-normal text-ink normal-case outline-none placeholder:text-ink3 focus-visible:border-teal"
          />
          <span className="text-[12px] font-normal tracking-normal normal-case">
            Listing what you need — greetings, paying, asking directions — is the
            best way to use this. {600 - brief.length} characters left.
          </span>
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-bold tracking-[1.2px] text-ink3 uppercase">
            Or start from an example
          </span>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => setBrief(example.brief)}
                className="rounded-full border border-line px-3 py-1.5 text-[12.5px] text-ink2 hover:bg-surface2"
              >
                {example.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-2 text-[12px] font-bold tracking-[1.2px] text-ink3 uppercase">
          Island name (optional)
          <input
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="Left blank, one gets suggested for you"
            className="h-11 rounded-xl border border-line bg-bg px-3.5 text-[15px] font-normal tracking-normal text-ink normal-case outline-none placeholder:text-ink3 focus-visible:border-teal"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={close}
            disabled={pending}
            className="h-11 flex-1 rounded-xl border border-line text-[14px] font-semibold text-ink2 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || brief.trim().length < 10}
            onClick={submit}
            className="h-11 flex-1 rounded-xl bg-primary text-[14px] font-semibold text-on-primary disabled:opacity-50"
          >
            {pending ? 'Writing 20 sentences…' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}
