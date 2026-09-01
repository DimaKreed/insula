import { requireAdmin } from '@/auth';

/**
 * The admin gate. A layout rather than a check in each page: it runs for every
 * route beneath it, so a new admin screen is gated by existing where it is.
 *
 * It lives inside the `(app)` group deliberately, so the admin screens keep the
 * app's nav and chrome instead of becoming a separate shell.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return children;
}
