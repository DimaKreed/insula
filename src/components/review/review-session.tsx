'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { gradeReview } from '@/actions/review';
import {
  CheckIcon,
  CloseIcon,
  FlameIcon,
  SpeakerIcon,
} from '@/components/icons';
import type { QueueCard } from '@/db/queries/review';
import { getAudioElement } from '@/lib/audio-element';

/**
 * The ReviewPrompt → ReviewReveal → ReviewDone artboards, one card at a time.
 *
 * Grading is optimistic (Implementation Plan section 4.2): the next card is on
 * screen before the server action resolves, because the FSRS transition is
 * deterministic — there is nothing to wait for, and a review that stalls behind
 * a request breaks the rhythm the session lives on. A failed write surfaces as a
 * toast and the card comes back in the next session, which is the same outcome
 * as grading it Again. Reviews therefore need network; offline queueing is an
 * explicit non-goal for the MVP.
 */

/** Grade tones from the artboard: Again → error, Hard → sand, Good/Easy → teal/green. */
const TONES: Record<number, string> = {
  1: 'bg-err-soft text-err',
  2: 'bg-sand-soft text-sand-ink',
  3: 'bg-teal-soft text-teal',
  4: 'bg-green-soft text-green',
};

export function ReviewSession({
  cards,
  streakDays,
  reviewedToday,
  dueTomorrow,
}: {
  cards: QueueCard[];
  streakDays: number;
  reviewedToday: number;
  dueTomorrow: number;
}) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [again, setAgain] = useState(0);
  const shownAt = useRef(Date.now());

  const card = cards[index];
  const finished = index >= cards.length;

  const playAudio = useCallback(() => {
    if (!card?.audioUrl) return;
    const audio = getAudioElement();
    audio.src = new URL(card.audioUrl, location.href).href;
    audio.currentTime = 0;
    audio.play().catch(() => {
      toast.error('Could not play this recording.');
    });
  }, [card]);

  const reveal = useCallback(() => {
    if (revealed) return;
    setRevealed(true);
    playAudio();
  }, [playAudio, revealed]);

  const grade = useCallback(
    (rating: number) => {
      if (!card) return;
      const durationMs = Date.now() - shownAt.current;

      void gradeReview({ sentenceId: card.sentenceId, rating, durationMs }).then(
        (result) => {
          if (!result.ok) toast.error(result.error);
        },
        () => toast.error('That review did not save — check your connection.'),
      );

      if (rating === 1) setAgain((n) => n + 1);
      getAudioElement().pause();
      shownAt.current = Date.now();
      setRevealed(false);
      setIndex((at) => at + 1);
    },
    [card],
  );

  // Space reveals, 1–4 grade: this screen is used dozens of times a day.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!revealed) {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          reveal();
        }
        return;
      }
      const rating = Number(event.key);
      if (rating >= 1 && rating <= 4) {
        event.preventDefault();
        grade(rating);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [grade, reveal, revealed]);

  // The audio element outlives this page.
  useEffect(() => () => getAudioElement().pause(), []);

  if (finished) {
    return (
      <Done
        reviewed={cards.length}
        again={again}
        // The streak query ran before this session did, so today counts here.
        streakDays={streakDays + (reviewedToday === 0 ? 1 : 0)}
        dueTomorrow={dueTomorrow}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col">
      <Header done={index} total={cards.length} />

      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
        {revealed ? (
          <>
            <p className="text-[15px] leading-relaxed text-ink3">
              {card.sourceText}
            </p>
            <div className="h-px w-9 bg-line" />
            <p className="font-serif text-[32px] leading-[1.3] font-medium tracking-[-0.2px]">
              {card.targetText}
            </p>
            {card.audioUrl ? (
              <button
                type="button"
                onClick={playAudio}
                className="flex h-12 items-center gap-2 rounded-full bg-teal-soft px-5 text-sm font-semibold text-teal"
              >
                <SpeakerIcon size={17} />
                Play audio
              </button>
            ) : null}
          </>
        ) : (
          <>
            <p className="text-[11px] font-bold tracking-[2px] text-teal uppercase">
              {card.isNew ? 'New — say it in Romanian' : 'Say it in Romanian, out loud'}
            </p>
            <p className="text-[28px] leading-[1.35] font-semibold tracking-[-0.3px]">
              {card.sourceText}
            </p>
            <p className="flex items-center gap-1.5 text-[12.5px] text-ink3">
              {card.islandEmoji ? <span>{card.islandEmoji}</span> : null}
              <span>{card.islandName}</span>
            </p>
          </>
        )}
      </div>

      {revealed ? (
        <div className="flex flex-col gap-2.5 px-4 pb-11">
          <p className="text-center text-xs text-ink3">How close were you?</p>
          <div className="grid grid-cols-4 gap-2">
            {card.grades.map(({ rating, label, interval }) => (
              <button
                key={rating}
                type="button"
                onClick={() => grade(rating)}
                className={`flex h-19 flex-col items-center justify-center gap-[3px] rounded-[14px] ${TONES[rating]}`}
              >
                <span className="text-[14.5px] font-bold">{label}</span>
                <span className="text-xs opacity-75">{interval}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-6 pb-11">
          <button
            type="button"
            onClick={reveal}
            className="flex h-16 w-full items-center justify-center rounded-2xl border border-line bg-surface2 text-base font-semibold text-ink2"
          >
            Tap to reveal
          </button>
        </div>
      )}
    </div>
  );
}

function Header({ done, total }: { done: number; total: number }) {
  return (
    <>
      <div className="flex items-center justify-between px-5 pt-13 pb-2.5">
        <div className="text-[15px] font-semibold text-ink2">Daily review</div>
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-ink3">
            {done} / {total}
          </span>
          <Link
            href="/islands"
            aria-label="Leave the review session"
            className="-mr-3 flex size-11 items-center justify-center text-ink3 hover:text-ink"
          >
            <CloseIcon size={20} />
          </Link>
        </div>
      </div>
      <div className="mx-5 h-1 rounded-full bg-surface2">
        <div
          className="h-1 rounded-full bg-sand transition-[width]"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>
    </>
  );
}

function Done({
  reviewed,
  again,
  streakDays,
  dueTomorrow,
}: {
  reviewed: number;
  again: number;
  streakDays: number;
  dueTomorrow: number;
}) {
  return (
    <ReviewOutcome
      title="Done for today."
      lines={[
        `${reviewed} ${reviewed === 1 ? 'card' : 'cards'} reviewed · ${again} to relearn`,
        `${streakDays} ${streakDays === 1 ? 'day' : 'days'} of daily reviews`,
      ]}
      note={
        dueTomorrow === 0
          ? 'Tomorrow: nothing due yet'
          : `Tomorrow: ${dueTomorrow} ${dueTomorrow === 1 ? 'card' : 'cards'} due`
      }
    />
  );
}

/**
 * The ReviewDone artboard, also used for the two ways of arriving with an empty
 * queue: nothing due yet, and nothing to review at all.
 */
export function ReviewOutcome({
  title,
  lines,
  note,
  icon = 'check',
  action,
}: {
  title: string;
  lines: string[];
  note?: string;
  icon?: 'check' | 'flame';
  action?: { href: string; label: string };
}) {
  const { href, label } = action ?? { href: '/islands', label: 'Back to islands' };

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[440px] flex-col overflow-hidden">
      <svg
        width="390"
        height="280"
        viewBox="0 0 390 280"
        fill="none"
        aria-hidden
        className="pointer-events-none absolute bottom-22 left-0 opacity-40"
      >
        <path
          d="M-30 80C50 140 140 165 230 140s150-85 190-60"
          stroke="var(--line)"
          strokeWidth="1.5"
        />
        <path
          d="M-30 120C60 185 160 210 250 180s130-95 170-75"
          stroke="var(--line)"
          strokeWidth="1.5"
        />
        <path
          d="M-30 160C70 230 180 250 270 215s110-100 150-85"
          stroke="var(--line)"
          strokeWidth="1.5"
        />
      </svg>

      <div className="flex items-center justify-between px-5 pt-13 pb-2.5">
        <div className="text-[15px] font-semibold text-ink2">Daily review</div>
        <Link
          href="/review/stats"
          className="text-[13px] font-semibold text-teal"
        >
          Stats
        </Link>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-4.5 px-8 text-center">
        <div className="flex size-17 items-center justify-center rounded-full bg-teal-soft text-teal">
          {icon === 'flame' ? <FlameIcon size={30} /> : <CheckIcon size={30} />}
        </div>
        <h1 className="font-serif text-[34px] font-medium tracking-[-0.3px]">
          {title}
        </h1>
        <p className="text-[15px] leading-[1.6] text-ink2">
          {lines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </p>
        {note ? (
          <p className="mt-1.5 rounded-full bg-surface2 px-3.5 py-2 text-[12.5px] text-ink3">
            {note}
          </p>
        ) : null}
      </div>

      <div className="relative px-6 pb-11">
        <Link
          href={href}
          className="flex h-13.5 items-center justify-center rounded-[14px] bg-primary text-[15px] font-semibold text-on-primary"
        >
          {label}
        </Link>
      </div>
    </div>
  );
}
