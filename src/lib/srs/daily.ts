/**
 * The review day: where it starts, how many new cards it admits, and how many
 * of them in a row the user has managed.
 *
 * Every boundary here is drawn in the user's own timezone (`users.timezone`),
 * the same rule `yearMonth` follows for quota periods — a session at 1am counts
 * towards the day the user thinks they are in, not towards UTC's.
 */

/** 'YYYY-MM-DD' for the calendar day `now` falls on in `timezone`. */
export function dayKey(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** How far ahead of UTC `timezone` is at that instant, in milliseconds. */
function offsetMs(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24, // 'en-US' hour12:false renders midnight as 24
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant midnight `timezone` local time, for the day `now` falls on. */
export function dayStart(now: Date, timezone: string): Date {
  const [year, month, day] = dayKey(now, timezone).split('-').map(Number);
  const localMidnight = Date.UTC(year, month - 1, day);
  // Two passes: the first uses the offset in force at UTC midnight, the second
  // the offset actually in force at the instant that produced — they differ on
  // a DST changeover day.
  const first = localMidnight - offsetMs(new Date(localMidnight), timezone);
  return new Date(localMidnight - offsetMs(new Date(first), timezone));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

// --- New cards per day -----------------------------------------------------

export const DEFAULT_NEW_CARDS_PER_DAY = 15;
const MAX_NEW_CARDS_PER_DAY = 200;

/** `users.settings.newCardsPerDay`, or the default if it is unset or nonsense. */
export function newCardsPerDay(settings: unknown): number {
  const raw = (settings as { newCardsPerDay?: unknown } | null)?.newCardsPerDay;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
    return DEFAULT_NEW_CARDS_PER_DAY;
  }
  return Math.min(raw, MAX_NEW_CARDS_PER_DAY);
}

// --- Streaks ---------------------------------------------------------------

/**
 * Consecutive review days ending today, and the best run ever. A day with no
 * reviews yet does not break the streak until it is over, so `days` counts back
 * from today when today has reviews and from yesterday when it does not.
 */
export function streaks(
  reviewDays: string[],
  today: string,
): { days: number; longest: number } {
  const seen = new Set(reviewDays);
  const sorted = [...seen].sort();

  let longest = 0;
  let run = 0;
  let previous: string | undefined;
  for (const day of sorted) {
    run = previous !== undefined && day === nextDay(previous) ? run + 1 : 1;
    previous = day;
    if (run > longest) longest = run;
  }

  let cursor = seen.has(today) ? today : previousDay(today);
  let days = 0;
  while (seen.has(cursor)) {
    days += 1;
    cursor = previousDay(cursor);
  }

  return { days, longest };
}

function shiftDay(day: string, delta: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + delta))
    .toISOString()
    .slice(0, 10);
}

const nextDay = (day: string) => shiftDay(day, 1);
const previousDay = (day: string) => shiftDay(day, -1);
