'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  deleteSentence,
  editSentence,
  retrySentence,
} from '@/actions/sentences';
import {
  CheckIcon,
  MoreIcon,
  PencilIcon,
  RetryIcon,
  TrashIcon,
} from '@/components/icons';
import type { Sentence } from '@/db/schema';

function StatusBadge({
  sentence,
  onRetry,
  busy,
}: {
  sentence: Sentence;
  onRetry: () => void;
  busy: boolean;
}) {
  const base =
    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold';

  if (sentence.status === 'error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        disabled={busy}
        title={sentence.errorMessage ?? undefined}
        className={`${base} bg-err-soft text-err disabled:opacity-60`}
      >
        <RetryIcon size={11} />
        {busy ? 'Retrying…' : 'Failed — Retry'}
      </button>
    );
  }

  if (sentence.status === 'translated' || sentence.status === 'ready') {
    return (
      <span className={`${base} bg-green-soft text-green`}>
        <CheckIcon size={11} />
        Translated
      </span>
    );
  }

  return (
    <span className={`${base} bg-teal-soft text-teal`}>
      <span
        className="size-1.5 rounded-full bg-current"
        style={{ animation: 'insula-pulse 1.4s infinite' }}
      />
      {sentence.status === 'pending' ? 'Queued' : 'Translating…'}
    </span>
  );
}

export function SentenceRow({ sentence }: { sentence: Sentence }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(sentence.sourceText);
  const [pending, startTransition] = useTransition();
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!menu.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error ?? 'Something went wrong.');
    });
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-2 border-b border-line p-3.5 last:border-b-0">
        <textarea
          autoFocus
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Sentence in English"
          className="resize-y rounded-xl border border-line bg-bg p-2.5 text-[14px] text-ink outline-none focus-visible:border-teal"
        />
        <div className="flex gap-2 self-end">
          <button
            type="button"
            onClick={() => {
              setDraft(sentence.sourceText);
              setEditing(false);
            }}
            className="h-9 rounded-[10px] border border-line px-3 text-[13px] font-semibold text-ink2"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || draft.trim() === ''}
            onClick={() =>
              startTransition(async () => {
                const result = await editSentence({
                  sentenceId: sentence.id,
                  sourceText: draft,
                });
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                setEditing(false);
              })
            }
            className="h-9 rounded-[10px] bg-primary px-3 text-[13px] font-semibold text-on-primary disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save & retranslate'}
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 border-b border-line p-3.5 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="text-[13px] text-ink3">{sentence.sourceText}</div>
        {sentence.targetText ? (
          <div className="font-serif text-[16.5px] leading-[1.35]">
            {sentence.targetText}
          </div>
        ) : (
          <div className="text-[14px] text-ink3">—</div>
        )}
        {sentence.translationNote ? (
          <div className="text-[12px] text-ink3 italic">
            {sentence.translationNote}
          </div>
        ) : null}
        <div className="flex pt-0.5">
          <StatusBadge
            sentence={sentence}
            busy={pending}
            onRetry={() => run(() => retrySentence({ sentenceId: sentence.id }))}
          />
        </div>
      </div>

      <div ref={menu} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Sentence actions"
          aria-expanded={menuOpen}
          className="flex size-10 items-center justify-center rounded-full text-ink3 hover:bg-surface2 hover:text-ink"
        >
          <MoreIcon size={18} />
        </button>

        {menuOpen ? (
          <div className="absolute right-0 z-10 mt-1 flex w-50 flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-pop">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setEditing(true);
              }}
              className="flex h-11 items-center gap-2.5 px-3.5 text-left text-sm font-medium hover:bg-surface2"
            >
              <PencilIcon size={15} />
              Edit sentence
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setMenuOpen(false);
                run(() => deleteSentence({ sentenceId: sentence.id }));
              }}
              className="flex h-11 items-center gap-2.5 border-t border-line px-3.5 text-left text-sm font-medium text-err hover:bg-surface2"
            >
              <TrashIcon size={15} />
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}
