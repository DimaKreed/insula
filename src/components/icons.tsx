/**
 * The design's own icon set, traced from the artboards. Lucide covers most of
 * an app's needs but not the island/wave marks this design is built around, so
 * all of them live here and stay visually consistent.
 */

type Props = { size?: number; className?: string };

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Svg({
  size = 22,
  className,
  children,
  filled,
}: Props & { children: React.ReactNode; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      {...(filled
        ? { fill: 'currentColor', stroke: 'currentColor', strokeWidth: 1 }
        : stroke)}
    >
      {children}
    </svg>
  );
}

export function IslandsIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="M7 15c0-4 2.2-7 5-7s5 3 5 7" />
      <path d="M3 19c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4.5 0" />
    </Svg>
  );
}

export function ReviewIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </Svg>
  );
}

export function PresetsIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="m12 3 9 5-9 5-9-5 9-5" />
      <path d="m3 13 9 5 9-5" />
    </Svg>
  );
}

export function TranscriptsIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </Svg>
  );
}

export function SettingsIcon(p: Props) {
  return (
    <Svg {...p}>
      <line x1="6" y1="4" x2="6" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <line x1="18" y1="4" x2="18" y2="20" />
      <line x1="4" y1="9" x2="8" y2="9" />
      <line x1="10" y1="15" x2="14" y2="15" />
      <line x1="16" y1="7" x2="20" y2="7" />
    </Svg>
  );
}

export function PlusIcon(p: Props) {
  return (
    <Svg {...p}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Svg>
  );
}

export function PlayIcon(p: Props) {
  return (
    <Svg {...p} filled>
      <polygon points="7 4.5 20 12 7 19.5 7 4.5" />
    </Svg>
  );
}

export function CheckCircleIcon(p: Props) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </Svg>
  );
}

export function CheckIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}

export function RetryIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <polyline points="21 3 21 8.6 15.4 8.6" />
    </Svg>
  );
}

export function ChevronLeftIcon(p: Props) {
  return (
    <Svg {...p}>
      <polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

export function MicIcon(p: Props) {
  return (
    <Svg {...p}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
    </Svg>
  );
}

export function TrashIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </Svg>
  );
}

export function PencilIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </Svg>
  );
}

export function MoreIcon({ size = 18, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

export function PauseIcon(p: Props) {
  return (
    <Svg {...p}>
      <line x1="9" y1="5" x2="9" y2="19" />
      <line x1="15" y1="5" x2="15" y2="19" />
    </Svg>
  );
}

export function PrevIcon(p: Props) {
  return (
    <Svg {...p} filled>
      <polygon points="19 20 9 12 19 4 19 20" />
      <line x1="5" y1="19" x2="5" y2="5" strokeWidth="1.6" />
    </Svg>
  );
}

export function NextIcon(p: Props) {
  return (
    <Svg {...p} filled>
      <polygon points="5 4 15 12 5 20 5 4" />
      <line x1="19" y1="5" x2="19" y2="19" strokeWidth="1.6" />
    </Svg>
  );
}

export function DownloadIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="M12 4v11" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 20h14" />
    </Svg>
  );
}

export function SpeakerIcon(p: Props) {
  return (
    <Svg {...p}>
      <polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5" fill="currentColor" />
      <path d="M15 9a4 4 0 0 1 0 6" />
      <path d="M17.5 6.5a8 8 0 0 1 0 11" />
    </Svg>
  );
}

export function CloseIcon(p: Props) {
  return (
    <Svg {...p}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </Svg>
  );
}

export function FlameIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="M12 2c1 4-3 5-3 8a3 3 0 0 0 6 0c0-1-.4-2-1-2.6 2.5 1.3 4 3.7 4 6.1a6 6 0 0 1-12 0C6 9.5 9 6 12 2Z" />
    </Svg>
  );
}

/** Generation — a four-pointed spark, kept flatter than a star so it reads at 18px. */
export function SparkIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="M12 3.5 13.6 9 19 10.6 13.6 12.2 12 17.7 10.4 12.2 5 10.6 10.4 9 12 3.5Z" />
      <path d="M18 16.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z" />
    </Svg>
  );
}

export function ChevronDownIcon(p: Props) {
  return (
    <Svg {...p}>
      <polyline points="6 9 12 15 18 9" />
    </Svg>
  );
}

/** The sand-coloured wave under the wordmark. */
export function Wordmark({ width = 44 }: { width?: number }) {
  return (
    <svg
      width={width}
      height={(width / 44) * 8}
      viewBox="0 0 44 8"
      fill="none"
      stroke="var(--sand)"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M3 5c2.5-3.2 5-3.2 7.5 0s5 3.2 7.5 0 5-3.2 7.5 0 5 3.2 7.5 0" />
    </svg>
  );
}
