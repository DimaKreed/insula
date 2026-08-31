import { redirect } from 'next/navigation';

import { auth } from '@/auth';

/**
 * The player's own shell: authed, but without the tab bar or sidebar. The
 * Player artboard is a full-bleed screen dismissed with the chevron in its
 * header, so a nav bar underneath would only compete with the controls.
 */
export default async function PlayerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  return <div className="min-h-dvh bg-bg text-ink">{children}</div>;
}
