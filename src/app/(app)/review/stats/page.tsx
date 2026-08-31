import Link from 'next/link';

import { requireUser } from '@/auth';
import { ChevronLeftIcon, FlameIcon } from '@/components/icons';
import { reviewStats } from '@/db/queries/review';
import { addDays, dayKey } from '@/lib/srs/daily';

export const metadata = { title: 'Review stats · Insula' };

/** Days of history in the activity strip — two weeks fits the mobile width. */
const ACTIVITY_DAYS = 14;

export default async function ReviewStatsPage() {
  const user = await requireUser();
  const now = new Date();
  const stats = await reviewStats(user, now);

  const byDay = new Map(stats.days.map((d) => [d.day, d.reviews]));
  const activity = Array.from({ length: ACTIVITY_DAYS }, (_, i) => {
    const day = dayKey(addDays(now, i - (ACTIVITY_DAYS - 1)), user.timezone);
    return { day, reviews: byDay.get(day) ?? 0 };
  });
  const busiest = Math.max(1, ...activity.map((d) => d.reviews));

  const { cards } = stats;
  const totalCards = cards.new + cards.learning + cards.review + cards.relearning;

  return (
    <main className="mx-auto w-full max-w-[440px] pb-6 lg:max-w-[720px] lg:px-12 lg:py-10">
      <div className="flex items-center gap-1 px-3 pt-13 pb-4 lg:px-0 lg:pt-0">
        <Link
          href="/review"
          aria-label="Back to the review session"
          className="flex size-11 items-center justify-center text-ink2 hover:text-ink"
        >
          <ChevronLeftIcon size={22} />
        </Link>
        <h1 className="text-[22px] font-bold tracking-[-0.3px]">Your reviews</h1>
      </div>

      <div className="flex flex-col gap-2.5 px-5 lg:px-0">
        <section className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card">
          <div className="flex size-13 shrink-0 items-center justify-center rounded-full bg-sand-soft text-sand-ink">
            <FlameIcon size={26} />
          </div>
          <div className="flex flex-col">
            <div className="text-[27px] leading-none font-bold tracking-[-0.5px]">
              {stats.streakDays}{' '}
              <span className="text-[15px] font-semibold text-ink2">
                {stats.streakDays === 1 ? 'day' : 'days'} in a row
              </span>
            </div>
            <div className="pt-1.5 text-[13px] text-ink3">
              {stats.reviewedToday > 0
                ? `${stats.reviewedToday} reviewed today`
                : 'Nothing reviewed today yet'}
              {' · '}
              best {stats.longestStreak}{' '}
              {stats.longestStreak === 1 ? 'day' : 'days'}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
          <h2 className="text-[13.5px] font-semibold text-ink2">
            Last {ACTIVITY_DAYS} days
          </h2>
          <ol className="flex h-25 items-end gap-1.5">
            {activity.map(({ day, reviews }) => (
              <li
                key={day}
                title={`${day}: ${reviews} ${reviews === 1 ? 'review' : 'reviews'}`}
                className="flex h-full flex-1 flex-col justify-end gap-1.5"
              >
                <div
                  className={`rounded-[4px] ${reviews > 0 ? 'bg-teal' : 'bg-surface2'}`}
                  style={{
                    height: `${reviews > 0 ? Math.max(8, (reviews / busiest) * 100) : 4}%`,
                  }}
                />
                <span className="text-center text-[9.5px] text-ink3">
                  {day.slice(8)}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <div className="grid grid-cols-2 gap-2.5">
          <Tile label="Reviews this week" value={stats.reviewedLast7Days} />
          <Tile label="Reviews all time" value={stats.reviewedTotal} />
          <Tile
            label="Recalled, last 30 days"
            value={
              stats.recall === null
                ? '—'
                : `${Math.round(stats.recall * 100)}%`
            }
          />
          <Tile
            label="Due now · tomorrow"
            value={`${stats.dueNow} · ${stats.dueTomorrow}`}
          />
        </div>

        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[13.5px] font-semibold text-ink2">
              {totalCards} {totalCards === 1 ? 'card' : 'cards'}
            </h2>
            {stats.suspended > 0 ? (
              <span className="text-[12px] text-ink3">
                {stats.suspended} suspended
              </span>
            ) : null}
          </div>

          {totalCards > 0 ? (
            <div className="flex h-2.5 overflow-hidden rounded-full bg-surface2">
              {STATES.map(({ key, bar }) => {
                const value = cards[key];
                return value === 0 ? null : (
                  <div
                    key={key}
                    className={bar}
                    style={{ width: `${(value / totalCards) * 100}%` }}
                  />
                );
              })}
            </div>
          ) : null}

          <ul className="flex flex-col gap-2">
            {STATES.map(({ key, label, bar, hint }) => (
              <li key={key} className="flex items-center gap-2.5">
                <span className={`size-2.5 shrink-0 rounded-full ${bar}`} />
                <span className="flex-1 text-[13.5px] font-medium">{label}</span>
                <span className="text-[12px] text-ink3">{hint}</span>
                <span className="min-w-8 text-right text-[13.5px] font-semibold">
                  {cards[key]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

const STATES = [
  {
    key: 'new',
    label: 'New',
    bar: 'bg-ink3',
    hint: 'never asked',
  },
  {
    key: 'learning',
    label: 'Learning',
    bar: 'bg-sand',
    hint: 'first days',
  },
  {
    key: 'review',
    label: 'Review',
    bar: 'bg-teal',
    hint: 'settled in',
  },
  {
    key: 'relearning',
    label: 'Relearning',
    bar: 'bg-err',
    hint: 'lapsed',
  },
] as const;

function Tile({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <span className="text-[22px] leading-none font-bold tracking-[-0.4px]">
        {value}
      </span>
      <span className="text-[12.5px] text-ink3">{label}</span>
    </div>
  );
}
