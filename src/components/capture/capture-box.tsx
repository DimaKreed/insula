'use client';

import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { captureSentences } from '@/actions/sentences';
import { MicIcon } from '@/components/icons';
import { MAX_CAPTURE_LINES } from '@/lib/quota';

/**
 * The capture card from the IslandDetail artboard. Phase 1 translates inside
 * the action, so the button stays busy until the Romanian is in the list — no
 * polling needed yet.
 */
export function CaptureBox({ islandId }: { islandId: string }) {
  const [text, setText] = useState('');
  const [pending, startTransition] = useTransition();
  const textarea = useRef<HTMLTextAreaElement>(null);

  const lineCount = text
    .split('\n')
    .filter((line) => line.trim() !== '').length;

  function submit() {
    startTransition(async () => {
      const result = await captureSentences({ islandId, text });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setText('');
      textarea.current?.focus();
      const { added, cached } = result.data;
      toast.success(
        `Added ${added} ${added === 1 ? 'sentence' : 'sentences'}${
          cached > 0 ? ` · ${cached} already in the shared cache` : ''
        }`,
      );
    });
  }

  return (
    <div className="mx-5 mt-1 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-card lg:mx-0">
      <textarea
        ref={textarea}
        value={text}
        rows={2}
        disabled={pending}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && lineCount > 0) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Add sentences — one per line"
        aria-label="Sentences to add, one per line"
        className="min-h-11 resize-y bg-transparent text-[15px] leading-normal text-ink outline-none placeholder:text-ink3 disabled:opacity-60"
      />
      <div className="flex items-center gap-2">
        <MicIcon size={14} className="shrink-0 text-ink3" />
        <span className="flex-1 text-xs text-ink3">
          {lineCount > 1
            ? `${lineCount} sentences${
                lineCount > MAX_CAPTURE_LINES
                  ? ` — ${MAX_CAPTURE_LINES} at a time, max`
                  : ''
              }`
            : "Tip: use your keyboard's mic to dictate"}
        </span>
        <button
          type="button"
          disabled={pending || lineCount === 0}
          onClick={submit}
          className="flex h-10 items-center rounded-[11px] bg-primary px-4 text-[13.5px] font-semibold text-on-primary disabled:opacity-50"
        >
          {pending ? 'Translating…' : 'Add & translate'}
        </button>
      </div>
    </div>
  );
}
