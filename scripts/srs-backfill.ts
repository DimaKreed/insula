/**
 * Gives every sentence that predates Phase 3 an FSRS card in state New —
 * `npm run srs:backfill`.
 *
 * `review_states` is 1:1 with `sentences` and the daily queue reads it directly,
 * so the sentences captured and seeded in Phases 1–2 are invisible to review
 * until they have a row. Capture creates cards from now on; this covers what
 * came before. Idempotent (insert ... on conflict do nothing), so re-running it
 * only ever picks up what is still missing.
 *
 * Usage:
 *   npm run srs:backfill -- [--user=you@example.com] [--dry-run]
 */
// tsx does not load .env files; do it before importing anything that reads env.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Absent file is fine — getDb() reports what it needs.
  }
}

/** Rows per insert. Keeps each Neon HTTP round trip well inside its limits. */
const BATCH = 200;

async function main() {
  const argv = process.argv.slice(2);
  const email = argv
    .find((a) => a.startsWith('--user='))
    ?.slice('--user='.length);
  const dryRun = argv.includes('--dry-run');

  const { eq } = await import('drizzle-orm');
  const { getDb } = await import('../src/db/index');
  const { users } = await import('../src/db/schema');
  const { createReviewStates, sentencesWithoutReviewState } = await import(
    '../src/db/queries/review'
  );

  let userId: string | undefined;
  if (email) {
    const rows = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!rows[0]) {
      console.error(`✗ no user with email ${email}`);
      process.exit(1);
    }
    userId = rows[0].id;
  }

  const pending = await sentencesWithoutReviewState(userId);
  console.log(`\npending   ${pending.length} sentence(s) without a card\n`);

  if (pending.length === 0) {
    console.log('Nothing to do — every sentence already has a review state.\n');
    return;
  }

  if (dryRun) {
    console.log('--dry-run: nothing was written.\n');
    return;
  }

  const byUser = new Map<string, string[]>();
  for (const row of pending) {
    const ids = byUser.get(row.userId) ?? [];
    ids.push(row.id);
    byUser.set(row.userId, ids);
  }

  const now = new Date();
  let created = 0;
  for (const [owner, ids] of byUser) {
    for (let at = 0; at < ids.length; at += BATCH) {
      created += await createReviewStates(owner, ids.slice(at, at + BATCH), now);
      console.log(
        `  ${owner} · ${Math.min(at + BATCH, ids.length)}/${ids.length}`,
      );
    }
  }

  console.log(`\ncreated ${created} card(s) in state New\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

// Keeps this file an ES module, so its `main` does not collide with the other
// scripts that also run in the global scope (tsc checks them together).
export {};
