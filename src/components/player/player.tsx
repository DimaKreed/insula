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
import { prepareListenHints } from '@/actions/player';
import { OfflineBadge } from '@/components/islands/offline-badge';
import { getAudioElement } from '@/lib/audio-element';
import type { PlaylistItem } from '@/lib/offline';
import {
  hintsSentence,
  missingHintAudio,
  type ListenHintMode,
} from '@/lib/player/listen-hints';
import {
  nextStep,
  startPhase,
  type Phase,
  type PlayerMode,
} from '@/lib/player/sequence';

/**
 * The Player artboard: one sentence at a time, four modes, one pair of thumbs.
 *
 * Everything plays through the app's single persistent audio element, whose
 * `src` is only ever swapped from the `ended` handler — the arrangement iOS
 * tolerates for background playback (Implementation Plan section 2.2). Gaps are
 * timeouts between `ended` and the next `play()`, which is honest about the
 * limitation: it works in the foreground, and Phase 4's compiled single-file
 * tracks are what make it reliable on a locked screen.
 *
 * Listen plays a sentence in up to two parts — the English hint, then the
 * Romanian — so playback is driven by a (sentence, phase) pair rather than an
 * index alone. Which sentences get a hint is decided per card by
 * `src/lib/player/listen-hints.ts`; the other three modes are Romanian only.
 */

const MODES = [
  {
    id: 'listen',
    label: 'Listen',
    live: true,
    hint: 'Ear training — take the sound in, nothing to say.',
  },
  {
    id: 'loop',
    label: 'Loop one',
    live: true,
    hint: 'Repeating this sentence until you switch.',
  },
  {
    id: 'shadow',
    label: 'Shadow',
    live: true,
    hint: 'Repeat each sentence aloud in the gap.',
  },
  {
    id: 'recall',
    label: 'Recall',
    live: false,
    hint: 'Produce the translation yourself in the gap.',
  },
] as const;

type Mode = (typeof MODES)[number]['id'] & PlayerMode;

/** What Listen's own line says about hints, per setting. */
const LISTEN_HINT_COPY: Record<ListenHintMode, string> = {
  auto: 'English first while a sentence is still new to you.',
  always: 'English before every sentence.',
  never: 'Romanian only.',
};
const GAP_STORAGE_KEY = 'insula:gap-factor';
const GAP_MIN = 1;
const GAP_MAX = 3;
const GAP_STEP = 0.5;

export function Player({
  islandId,
  islandName,
  islandEmoji,
  items: initialItems,
  hintMode,
}: {
  islandId: string;
  islandName: string;
  islandEmoji: string | null;
  items: PlaylistItem[];
  hintMode: ListenHintMode;
}) {
  const [items, setItems] = useState(initialItems);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('listen');
  const [playing, setPlaying] = useState(false);
  const [speaking, setSpeaking] = useState<Phase>('target');
  const [preparingHints, setPreparingHints] = useState(false);
  const [gapFactor, setGapFactor] = useState(1.5);

  // Read by the `ended` handler, which is registered once and must not close
  // over stale state.
  const state = useRef({ index, mode, gapFactor, items, hintMode });
  state.current = { index, mode, gapFactor, items, hintMode };
  // Kept out of `state`: playback sets the phase, no render produces it.
  const phase = useRef<Phase>('target');
  const gapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const stored = Number(localStorage.getItem(GAP_STORAGE_KEY));
    if (stored >= GAP_MIN && stored <= GAP_MAX) setGapFactor(stored);
  }, []);

  const current = items[index];
  const currentHinted =
    mode === 'listen' && hintsSentence(hintMode, current?.srsState ?? null);

  /**
   * Plays one half of a sentence. `want: 'hint'` means "start this sentence
   * from the top": it falls back to the Romanian whenever a hint does not
   * apply, is not this mode's business, or has not been synthesized yet, so
   * every caller can simply ask for the beginning.
   */
  const playAt = useCallback((at: number, want: Phase) => {
    const { items, mode, hintMode } = state.current;
    const item = items[at];
    if (!item) return;

    phase.current =
      want === 'hint' ? startPhase(mode, hintMode, item) : 'target';
    const useHint = phase.current === 'hint';

    setSpeaking(phase.current);

    const audio = getAudioElement();
    const src = new URL(
      useHint ? item.promptAudioUrl! : item.audioUrl,
      location.href,
    ).href;
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
  }, []);

  const stop = useCallback(() => {
    clearTimeout(gapTimer.current);
    getAudioElement().pause();
    setPlaying(false);
  }, []);

  const goTo = useCallback(
    (at: number, autoplay: boolean) => {
      clearTimeout(gapTimer.current);
      const { length } = state.current.items;
      const next = (at + length) % length;
      setIndex(next);
      if (autoplay) playAt(next, 'hint');
      else getAudioElement().pause();
    },
    [playAt],
  );

  // One `ended` listener for the whole session; the mode decides what follows.
  useEffect(() => {
    const audio = getAudioElement();

    function onEnded() {
      const { index: at, gapFactor, ...rest } = state.current;
      const step = nextStep({
        ...rest,
        index: at,
        phase: phase.current,
        gapFactor,
        clipMs: (audio.duration || 2) * 1000,
      });
      if (!step) return;

      gapTimer.current = setTimeout(() => {
        setIndex(step.index);
        playAt(step.index, step.phase);
      }, step.waitMs);
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
  }, [playAt]);

  // Leaving the player stops playback: the audio element outlives this page.
  useEffect(
    () => () => {
      clearTimeout(gapTimer.current);
      getAudioElement().pause();
    },
    [],
  );

  /**
   * Makes the English hints this island needs, the first time Listen runs with
   * hints switched on. Playback never waits for it: a sentence whose hint is
   * not ready yet plays Romanian only and picks the hint up on the next lap,
   * which is why this can run in batches without a loading screen in front of
   * the player.
   */
  const hintsRequested = useRef('');
  useEffect(() => {
    if (mode !== 'listen' || hintMode === 'never') return;
    const key = `${islandId}:${hintMode}`;
    if (hintsRequested.current === key) return;
    if (missingHintAudio(hintMode, state.current.items).length === 0) return;
    hintsRequested.current = key;

    let cancelled = false;
    setPreparingHints(true);

    void (async () => {
      let list = state.current.items;
      // Bounded so a batch that keeps failing cannot spin: 12 sentences a call
      // covers any island the capture limits allow.
      for (let round = 0; round < 50; round++) {
        const missing = missingHintAudio(hintMode, list);
        if (cancelled || missing.length === 0) break;

        const result = await prepareListenHints({
          islandId,
          sentenceIds: missing,
        });
        if (cancelled) return;
        if (!result.ok) {
          toast.error(result.error);
          break;
        }

        list = result.data.items;
        setItems(list);
        if (result.data.remaining === 0) break;
      }
      if (!cancelled) setPreparingHints(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, hintMode, islandId]);

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
    session.setActionHandler('play', () =>
      playAt(state.current.index, 'hint'),
    );
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
  }, [current, islandEmoji, islandName, playing, playAt, stop, goTo]);

  function changeGap(delta: number) {
    setGapFactor((value) => {
      const next = Math.min(GAP_MAX, Math.max(GAP_MIN, value + delta));
      localStorage.setItem(GAP_STORAGE_KEY, String(next));
      return next;
    });
  }

  const progress = ((index + 1) / items.length) * 100;
  const hintLabel = !currentHinted
    ? 'Romanian only'
    : current.promptAudioUrl
      ? 'English hint first'
      : preparingHints
        ? 'Preparing English hint…'
        : 'English hint unavailable';

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
        {mode === 'listen' ? (
          <span
            className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold tracking-[0.6px] uppercase ${
              currentHinted
                ? 'bg-teal-soft text-teal'
                : 'bg-surface2 text-ink3'
            }`}
          >
            {hintLabel}
          </span>
        ) : null}
        <p className="font-serif text-[31px] leading-[1.3] font-medium tracking-[-0.2px]">
          {current.targetText}
        </p>
        <p
          className={`text-[15px] leading-relaxed ${
            playing && speaking === 'hint'
              ? 'font-medium text-teal'
              : 'text-ink3'
          }`}
        >
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
          {MODES.find((m) => m.id === mode)?.hint}
          {mode === 'listen' ? ` ${LISTEN_HINT_COPY[hintMode]}` : null}
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
          onClick={() => (playing ? stop() : playAt(index, 'hint'))}
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
