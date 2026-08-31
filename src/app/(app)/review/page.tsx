import { requireUser } from '@/auth';
import {
  ReviewOutcome,
  ReviewSession,
} from '@/components/review/review-session';
import {
  dailyQueue,
  reviewStats,
  reviewSummary,
  type SessionUserRef,
} from '@/db/queries/review';

export const metadata = { title: 'Review · Insula' };

/**
 * The daily session. The queue is built here, on the server, so the client gets
 * a fixed list of cards with their four projected intervals already computed —
 * ts-fsrs never ships to the browser.
 */
export default async function ReviewPage() {
  const user = await requireUser();
  const now = new Date();
  const [cards, summary] = await Promise.all([
    dailyQueue(user, now),
    reviewSummary(user, now),
  ]);

  if (cards.length === 0) return <EmptyQueue user={user} now={now} />;

  return (
    <ReviewSession
      cards={cards}
      streakDays={summary.streakDays}
      reviewedToday={summary.reviewedToday}
      dueTomorrow={summary.dueTomorrow}
    />
  );
}

/**
 * Nothing to do, for one of two quite different reasons: the collection is empty
 * (or still being voiced), or today's cards are simply all done.
 */
async function EmptyQueue({
  user,
  now,
}: {
  user: SessionUserRef;
  now: Date;
}) {
  const stats = await reviewStats(user, now);
  const { learning, review, relearning } = stats.cards;
  const total = stats.cards.new + learning + review + relearning;

  if (total === 0) {
    return (
      <ReviewOutcome
        title="Nothing to review yet."
        lines={[
          'Capture a few sentences and Insula will start asking for them —',
          'a card appears as soon as its Romanian audio is ready.',
        ]}
        action={{ href: '/islands', label: 'Build an island' }}
      />
    );
  }

  const tomorrow =
    stats.dueTomorrow === 0
      ? 'Tomorrow: nothing due yet'
      : `Tomorrow: ${stats.dueTomorrow} ${stats.dueTomorrow === 1 ? 'card' : 'cards'} due`;

  return (
    <ReviewOutcome
      title={stats.reviewedToday > 0 ? 'Done for today.' : 'Nothing due yet.'}
      icon={stats.reviewedToday > 0 ? 'check' : 'flame'}
      lines={[
        stats.reviewedToday > 0
          ? `${stats.reviewedToday} ${stats.reviewedToday === 1 ? 'card' : 'cards'} reviewed today`
          : `${total} ${total === 1 ? 'card' : 'cards'} in your collection, all scheduled ahead`,
        `${stats.streakDays} ${stats.streakDays === 1 ? 'day' : 'days'} of daily reviews`,
      ]}
      note={tomorrow}
    />
  );
}
