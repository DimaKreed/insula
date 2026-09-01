/**
 * Promotes an account to admin — `npm run admin`.
 *
 * `users.role` has no UI: the first admin has to be made from outside the app,
 * and there is no self-serve path to the admin surface by design.
 *
 * The role is read into the session JWT, so an already signed-in session keeps
 * its old role until the token refreshes — sign out and back in after running
 * this.
 *
 * Also the escape hatch for off-topic generation blocks: escalation plateaus at
 * two weeks with no automatic pardon, so a classifier false positive needs some
 * way out.
 *
 * Usage:
 *   npm run admin -- --user=you@example.com [--demote] [--list]
 *   npm run admin -- --clear-offences=someone@example.com
 */
// Marks the file a module rather than a global script, so `main` here does not
// collide with `main` in the other env-loading scripts.
export {};

for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Absent file is fine — getDb() reports a missing DATABASE_URL itself.
  }
}

function arg(name: string): string | undefined {
  return process.argv
    .slice(2)
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=');
}

async function main() {
  const argv = process.argv.slice(2);
  const { eq } = await import('drizzle-orm');
  const { getDb } = await import('../src/db/index');
  const { users } = await import('../src/db/schema');

  const db = getDb();

  if (argv.includes('--list')) {
    const rows = await db
      .select({ email: users.email, role: users.role, tier: users.tier })
      .from(users)
      .orderBy(users.email);
    console.log();
    for (const r of rows) {
      console.log(`  ${r.role === 'admin' ? '★' : ' '} ${r.email}  (${r.role}, ${r.tier})`);
    }
    console.log();
    return;
  }

  const pardon = arg('clear-offences');
  if (pardon) {
    const { clearOffences } = await import('../src/db/queries/generation');
    const found = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, pardon))
      .limit(1);
    if (!found[0]) {
      console.error(`
No user with email ${pardon}.
`);
      process.exit(1);
    }
    const cleared = await clearOffences(found[0].id);
    console.log(
      `
Cleared ${cleared} offence(s) for ${pardon}. Generation is open again.
`,
    );
    return;
  }

  const email = arg('user');
  if (!email) {
    console.error(
      '\nUsage: npm run admin -- --user=you@example.com [--demote] [--list]\n' +
        '       npm run admin -- --clear-offences=someone@example.com\n',
    );
    process.exit(1);
  }

  const role = argv.includes('--demote') ? 'user' : 'admin';
  const updated = await db
    .update(users)
    .set({ role })
    .where(eq(users.email, email))
    .returning({ email: users.email, role: users.role });

  if (updated.length === 0) {
    console.error(
      `\nNo user with email ${email}. Sign in to the app once, then re-run.\n`,
    );
    process.exit(1);
  }

  console.log(
    `\n${updated[0].email} is now ${updated[0].role}.\nSign out and back in for the session token to pick it up.\n`,
  );
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
