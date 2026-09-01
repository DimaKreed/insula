'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { setListenHintMode } from '@/actions/settings';
import {
  LISTEN_HINT_MODES,
  type ListenHintMode,
} from '@/lib/player/listen-hints';

const COPY: Record<ListenHintMode, { label: string; description: string }> = {
  auto: {
    label: 'Auto',
    description:
      'Hint while a sentence is new or still being learned; Romanian only once it reaches review. Hints retire themselves as you learn.',
  },
  always: {
    label: 'Always',
    description: 'English before every sentence, whatever its review state.',
  },
  never: {
    label: 'Never',
    description: 'Romanian only — Listen as it was before hints.',
  },
};

/** The `users.settings.listenHint` control: when Listen plays its English hint. */
export function ListenHintControl({ value }: { value: ListenHintMode }) {
  const [mode, setMode] = useState(value);
  const [pending, startTransition] = useTransition();

  function choose(next: ListenHintMode) {
    if (next === mode) return;
    const previous = mode;
    setMode(next);
    startTransition(async () => {
      const result = await setListenHintMode({ listenHint: next });
      if (!result.ok) {
        setMode(previous);
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-px">
        <span className="text-[14.5px] font-semibold">English hint in Listen</span>
        <span className="text-[12.5px] text-ink3">
          Played before the Romanian sentence, with no pause to speak.
        </span>
      </div>

      <div
        role="radiogroup"
        aria-label="English hint in Listen"
        className="flex rounded-[13px] bg-surface2 p-1"
      >
        {LISTEN_HINT_MODES.map((option) => {
          const active = mode === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={pending}
              onClick={() => choose(option)}
              className={`flex h-11 flex-1 items-center justify-center rounded-[10px] text-[13px] disabled:opacity-60 ${
                active
                  ? 'bg-surface font-bold text-ink shadow-card'
                  : 'font-medium text-ink3'
              }`}
            >
              {COPY[option].label}
            </button>
          );
        })}
      </div>

      <p className="text-[12px] leading-relaxed text-ink3">
        {COPY[mode].description}
      </p>
    </div>
  );
}
