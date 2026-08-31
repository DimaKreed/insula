import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { getIsland } from '@/db/queries/islands';
import { sentenceStatuses } from '@/db/queries/sentences';

/**
 * Lightweight polling endpoint for the island page: statuses only, no text.
 * The client refreshes the server-rendered list when the aggregate changes and
 * stops polling once every row is terminal (Implementation Plan section 4.1).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const island = await getIsland(session.user.id, id);
  if (!island) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rows = await sentenceStatuses(session.user.id, id);
  const pending = rows.filter(
    (r) => r.status !== 'ready' && r.status !== 'error',
  ).length;

  return NextResponse.json(
    {
      islandId: id,
      pending,
      sentences: rows,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
