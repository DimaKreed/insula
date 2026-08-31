'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  ChevronDownIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
} from '@/components/icons';
import { OfflineBadge } from '@/components/islands/offline-badge';
import { getAudioElement } from '@/lib/audio-element';
import type { PlaylistItem } from '@/lib/offline';

/**
 * The Player artboard: one sentence at a time, four modes, one pair of thumbs.
 *
 * Everything plays through the app's single persistent audio element, whose
 * `src` is only ever swapped from the `ended` handler — the arrangement iOS
 * tolerates for background playback (Implementation Plan section 2.2). Gaps are
 * timeouts between `ended` and the next `play()`, which is honest about the
 * limitation: it works in the foreground, and Phase 4's compiled single-file
 * tracks are what make it reliable on a locked screen.
 */

const MODES = [
  { id: 'listen', label: 'Listen', live: true },
  { id: 'loop', label: 'Loop one', live: true },
  { id: 'shadow', label: 'Shadow', live: true },
  { id: 'recall', label: 'Recall', live: false },
] as const;

type Mode = (typeof MODES)[number]['id'];

/** Gap between clips in Listen mode. */
const LISTEN_GAP_MS = 1000;
const GAP_STORAGE_KEY = 'insula:gap-factor';
const GAP_MIN = 1;
const GAP_MAX = 3;
const GAP_STEP = 0.5;

export function Player({
  islandId,
  islandName,
  islandEmoji,
  items,
}: {
  islandId: string;
  islandName: string;
  islandEmoji: string | null;
  items: PlaylistItem[];
}) {
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('listen');
  const [playing, setPlaying] = useState(false);
  const [gapFactor, setGapFactor] = useState(1.5);

  // Read by the `ended` handler, which is registered once and must not close
  // over stale state.
  const state = useRef({ index, mode, gapFactor });
  state.current = { index, mode, gapFactor };
  const gapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const stored = Number(localStorage.getItem(GAP_STORAGE_KEY));
    if (stored >= GAP_MIN && stored <= GAP_MAX) setGapFactor(stored);
  }, []);

  const current = items[index];

  const play = useCallback(
    (at: number) => {
      const item = items[at];
      if (!item) return;
      const audio = getAudioElement();
      const src = new URL(item.audioUrl, location.href).href;
      if (audio.src !== src) audio.src = src;
      audio.currentTime = 0;
      audio
        .play()
        .then(() => setPlaying(true))
        .catch(() => {
          setPlaying(false);
          toast.error(
            'Could not play this sentence. If you are offline, download the island again.',
          );
        });
    },
    [items],
  );

  const stop = useCallback(() => {
    clearTimeout(gapTimer.current);
    getAudioElement().pause();
    setPlaying(false);
  }, []);

  const goTo = useCallback(
    (at: number, autoplay: boolean) => {
      clearTimeout(gapTimer.current);
      const next = (at + items.length) % items.length;
      setIndex(next);
      if (autoplay) play(next);
      else getAudioElement().pause();
    },
    [items.length, play],
  );

  // One `ended` listener for the whole session; the mode decides what follows.
  useEffect(() => {
    const audio = getAudioElement();

    function onEnded() {
      const { index: at, mode: current, gapFactor: factor } = state.current;

      if (current === 'loop') {
        gapTimer.current = setTimeout(() => play(at), LISTEN_GAP_MS);
        return;
      }

      const next = (at + 1) % items.length;
      const wait =
        current === 'shadow'
          ? Math.round((audio.duration || 2) * 1000 * factor)
          : LISTEN_GAP_MS;

      gapTimer.current = setTimeout(() => {
        setIndex(next);
        play(next);
      }, wait);
    }

    function onError() {
      setPlaying(false);
      toast.error(
        'That audio is missing. Re-download the island to listen offline.',
      );
    }

    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [items.length, play]);

  // Leaving the player stops playback: the audio element outlives this page.
  useEffect(
    () => () => {
      clearTimeout(gapTimer.current);
      getAudioElement().pause();
    },
    [],
  );

  // Lock-screen / notification controls.
  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session || !current) return;

    session.metadata = new MediaMetadata({
      title: current.targetText,
      artist: current.sourceText,
      album: `${islandEmoji ? `${islandEmoji} ` : ''}${islandName} · Insula`,
    });
    session.playbackState = playing ? 'playing' : 'paused';
    session.setActionHandler('play', () => play(state.current.index));
    session.setActionHandler('pause', stop);
    session.setActionHandler('nexttrack', () =>
      goTo(state.current.index + 1, true),
    );
    session.setActionHandler('previoustrack', () =>
      goTo(state.current.index - 1, true),
    );

    return () => {
      for (const action of [
        'play',
        'pause',
        'nexttrack',
        'previoustrack',
      ] as const) {
        session.setActionHandler(action, null);
      }
    };
  }, [current, islandEmoji, islandName, playing, play, stop, goTo]);

  function changeGap(delta: number) {
    setGapFactor((value) => {
      const next = Math.min(GAP_MAX, Math.max(GAP_MIN, value + delta));
      localStorage.setItem(GAP_STORAGE_KEY, String(next));
      return next;
    });
  }

  const progress = ((index + 1) / items.length) * 100;

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[440px] flex-col overflow-hidden">
      <svg
        width="390"
        height="360"
        viewBox="0 0 390 360"
        fill="none"
        aria-hidden
        className="pointer-events-none absolute top-10 left-0 opacity-45"
      >
        <path
          d="M-30 300C50 240 140 215 230 240s150 85 190 60"
          stroke="var(--line)"
          strokeWidth="1.5"
        />
        <path
          d="M-30 260C60 195 160 170 250 200s130 95 170 75"
          stroke="var(--line)"
          strokeWidth="1.5"
        />
        <path
          d="M-30 220C70 150 180 130 270 165s110 100 150 85"
          stroke="var(--line)"
          strokeWidth="1.5"
        />
      </svg>

      <header className="relative flex items-center px-5 pt-13 pb-2">
        <Link
          href={`/islands/${islandId}`}
          aria-label="Close the player"
          className="-ml-3 flex size-11 items-center justify-center text-ink2 hover:text-ink"
        >
          <ChevronDownIcon size={24} />
        </Link>
        <div className="flex flex-1 items-center justify-center gap-[7px] text-[15px] font-semibold">
          {islandEmoji ? <span>{islandEmoji}</span> : null}
          <span className="truncate">{islandName}</span>
        </div>
        <div className="flex min-w-11 justify-end text-[11.5px]">
          <OfflineBadge islandId={islandId} />
        </div>
      </header>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="font-serif text-[31px] leading-[1.3] font-medium tracking-[-0.2px]">
          {current.targetText}
        </p>
        <p className="text-[15px] leading-relaxed text-ink3">
          {current.sourceText}
        </p>
      </div>

      <div className="relative flex flex-col gap-[7px] px-6 pb-4.5">
        <div className="h-1 rounded-full bg-surface2">
          <div
            className="h-1 rounded-full bg-sand transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-center text-xs text-ink3">
          Sentence {index + 1} of {items.length}
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Playback mode"
        className="mx-5 mb-3 flex rounded-[13px] bg-surface2 p-1"
      >
        {MODES.map(({ id, label, live }) => {
          const active = mode === id;
          const shared =
            'flex h-10 flex-1 items-center justify-center rounded-[10px] text-[13px]';
          return live ? (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMode(id)}
              className={`${shared} ${
                active
                  ? 'bg-surface font-bold text-ink shadow-card'
                  : 'font-medium text-ink3'
              }`}
            >
              {label}
            </button>
          ) : (
            <span
              key={id}
              role="tab"
              aria-selected={false}
              aria-disabled
              title="Coming soon"
              className={`${shared} font-medium text-ink3 opacity-45`}
            >
              {label}
            </span>
          );
        })}
      </div>

      {mode === 'shadow' ? (
        <div className="mx-5 mb-6 flex items-center gap-3 rounded-[14px] border border-line bg-surface px-3.5 py-2.5">
          <div className="flex flex-1 flex-col gap-px">
            <span className="text-[13.5px] font-semibold">Shadow gap</span>
            <span className="text-[11.5px] text-ink3">
              Pause after each sentence — repeat aloud
            </span>
          </div>
          <button
            type="button"
            onClick={() => changeGap(-GAP_STEP)}
            disabled={gapFactor <= GAP_MIN}
            aria-label="Shorter gap"
            className="flex size-11 items-center justify-center rounded-full border border-line text-xl text-ink2 disabled:opacity-40"
          >
            −
          </button>
          <span className="min-w-11 text-center text-[15px] font-bold">
            {gapFactor}×
          </span>
          <button
            type="button"
            onClick={() => changeGap(GAP_STEP)}
            disabled={gapFactor >= GAP_MAX}
            aria-label="Longer gap"
            className="flex size-11 items-center justify-center rounded-full border border-line text-xl text-ink2 disabled:opacity-40"
          >
            +
          </button>
        </div>
      ) : (
        <p className="mx-5 mb-6 px-1 text-center text-[11.5px] text-ink3">
          {mode === 'loop'
            ? 'Repeating this sentence until you switch.'
            : 'Playing the island end to end, then starting over.'}
        </p>
      )}

      <div className="relative flex items-center justify-center gap-[30px] px-6 pb-14">
        <button
          type="button"
          onClick={() => goTo(index - 1, playing)}
          aria-label="Previous sentence"
          className="flex size-[62px] items-center justify-center rounded-full bg-surface2 text-ink"
        >
          <PrevIcon size={26} />
        </button>
        <button
          type="button"
          onClick={() => (playing ? stop() : play(index))}
          aria-label={playing ? 'Pause' : 'Play'}
          className="flex size-23 items-center justify-center rounded-full bg-sand text-on-sand shadow-pop"
        >
          {playing ? <PauseIcon size={34} /> : <PlayIcon size={34} />}
        </button>
        <button
          type="button"
          onClick={() => goTo(index + 1, playing)}
          aria-label="Next sentence"
          className="flex size-[62px] items-center justify-center rounded-full bg-surface2 text-ink"
        >
          <NextIcon size={26} />
        </button>
      </div>
    </div>
  );
}
