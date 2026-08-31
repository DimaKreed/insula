import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { Sidebar, TabBar } from '@/components/nav/app-nav';

/** The authed shell. Guarding here keeps the Neon/Drizzle adapter off the edge. */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { name, email, tier } = session.user;

  return (
    <div className="flex min-h-dvh bg-bg text-ink">
      <Sidebar
        name={name ?? email}
        planLabel={tier === 'pro' ? 'Pro plan' : 'Free plan'}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1">{children}</div>
        <TabBar />
      </div>
    </div>
  );
}
