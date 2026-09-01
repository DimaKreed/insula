'use client';

import { useRef, useState } from 'react';

import { SpeakerIcon } from '@/components/icons';

/**
 * Plays one preset sentence as a sample.
 *
 * Its own short-lived audio element rather than the player's persistent one:
 * this is a tap-to-hear preview, not playback, and borrowing the queue would
 * mean tearing down whatever the player was doing.
 */
export function SamplePlayer({ url }: { url: string | null }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  if (!url) {
    return (
      <span
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center text-ink3 opacity-30"
      >
        <SpeakerIcon size={18} />
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label="Play sentence"
      onClick={() => {
        const audio = (ref.current ??= new Audio(url));
        if (!audio.paused) {
          audio.pause();
          audio.currentTime = 0;
          setPlaying(false);
          return;
        }
        audio.onended = () => setPlaying(false);
        setPlaying(true);
        void audio.play().catch(() => setPlaying(false));
      }}
      className={`flex size-11 shrink-0 items-center justify-center rounded-full border border-line transition-colors ${
        playing ? 'bg-teal-soft text-teal' : 'text-ink2 hover:bg-surface2'
      }`}
    >
      <SpeakerIcon size={18} />
    </button>
  );
}
