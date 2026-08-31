'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  IslandsIcon,
  PresetsIcon,
  ReviewIcon,
  SettingsIcon,
  TranscriptsIcon,
  Wordmark,
} from '@/components/icons';

/**
 * The design ships two nav shapes for the same five destinations: a bottom tab
 * bar on mobile and a 248px sidebar at desktop width (HomeDesktop artboard).
 * Only the destinations that exist are links — the rest render inert rather
 * than lying about where they lead.
 */
const TABS = [
  { href: '/islands', label: 'Islands', Icon: IslandsIcon, live: true },
  { href: '/review', label: 'Review', Icon: ReviewIcon, live: true },
  { href: '/presets', label: 'Presets', Icon: PresetsIcon, live: false },
  {
    href: '/transcripts',
    label: 'Transcripts',
    Icon: TranscriptsIcon,
    live: false,
  },
  { href: '/settings', label: 'Settings', Icon: SettingsIcon, live: false },
] as const;

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

export function TabBar() {
  const isActive = useActive();

  return (
    <nav
      aria-label="Sections"
      className="flex items-stretch border-t border-line bg-surface px-2 pt-2 pb-5 lg:hidden"
    >
      {TABS.map(({ href, label, Icon, live }) => {
        const active = live && isActive(href);
        const body = (
          <>
            <Icon size={22} />
            <span
              className={`text-[10.5px] ${active ? 'font-semibold' : 'font-medium'}`}
            >
              {label}
            </span>
          </>
        );
        const shared = `flex flex-1 flex-col items-center gap-[3px] py-1.5 ${
          active ? 'text-teal' : 'text-ink3'
        }`;

        return live ? (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={shared}
          >
            {body}
          </Link>
        ) : (
          <span
            key={href}
            aria-disabled
            title="Coming soon"
            className={`${shared} opacity-45`}
          >
            {body}
          </span>
        );
      })}
    </nav>
  );
}

export function Sidebar({
  name,
  planLabel,
}: {
  name: string;
  planLabel: string;
}) {
  const isActive = useActive();
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <aside className="hidden w-62 flex-col border-r border-line bg-surface px-4 pt-7 pb-5 lg:flex">
      <div className="flex flex-col gap-2 px-3 pb-7">
        <div className="font-serif text-[26px] leading-none font-medium tracking-[-0.3px]">
          Insula
        </div>
        <Wordmark />
      </div>

      <nav aria-label="Sections" className="flex flex-col gap-0.5">
        {TABS.map(({ href, label, Icon, live }) => {
          const active = live && isActive(href);
          const shared = `flex h-10 items-center gap-[11px] rounded-[10px] px-3 text-sm ${
            active
              ? 'bg-surface2 font-semibold text-ink'
              : 'font-medium text-ink2'
          }`;
          const body = (
            <>
              <Icon size={19} className={active ? 'text-teal' : undefined} />
              <span className="flex-1">{label}</span>
            </>
          );

          return live ? (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={shared}
            >
              {body}
            </Link>
          ) : (
            <span
              key={href}
              aria-disabled
              title="Coming soon"
              className={`${shared} opacity-45`}
            >
              {body}
            </span>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="flex items-center gap-2.5 border-t border-line px-3 py-2.5">
        <div className="flex size-8 items-center justify-center rounded-full bg-sand-soft text-xs font-bold text-sand-ink">
          {initials || '—'}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-semibold">{name}</span>
          <span className="text-[11.5px] text-ink3">{planLabel}</span>
        </div>
      </div>
    </aside>
  );
}
