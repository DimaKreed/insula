/**
 * Links islands to the presets they duplicate — `npm run presets:link`.
 *
 * The 12 curated `seed/*.json` islands were loaded by `npm run db:seed` before
 * presets existed, so they carry no `imported_from_preset_id` and no
 * `preset_imports` row. Browse therefore showed every one of them as not-added,
 * and adding one produced a second identical island.
 *
 * This is the data half of the fix (the query half is `existingIslandForPreset`,
 * which also matches by name so a future unlinked island is still recognised).
 *
 * Deliberately conservative: it links, and it REPORTS duplicates without
 * touching them. Deciding which of two copies to keep is not a script's call —
 * archive the one you don't want from the islands list.
 *
 * Idempotent: an already-linked island is skipped.
 *
 * Usage:
 *   npm run presets:link -- [--user=you@example.com] [--dry-run]
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
  const dryRun = process.argv.slice(2).includes('--dry-run');
  const onlyUser = arg('user');

  const { and, eq, isNull, sql } = await import('drizzle-orm');
  const { getDb } = await import('../src/db/index');
  const { islands, presetImports, presetIslands, users } = await import(
    '../src/db/schema'
  );

  const db = getDb();

  let userId: string | undefined;
  if (onlyUser) {
    const found = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, onlyUser))
      .limit(1);
    if (!found[0]) {
      console.error(`\nNo user with email ${onlyUser}.\n`);
      process.exit(1);
    }
    userId = found[0].id;
  }

  // Live, unlinked islands whose name matches a published preset.
  const candidates = await db
    .select({
      islandId: islands.id,
      islandName: islands.name,
      userId: islands.userId,
      email: users.email,
      presetId: presetIslands.id,
      presetName: presetIslands.name,
    })
    .from(islands)
    .innerJoin(users, eq(users.id, islands.userId))
    .innerJoin(
      presetIslands,
      sql`lower(${presetIslands.name}) = lower(${islands.name})`,
    )
    .where(
      and(
        isNull(islands.importedFromPresetId),
        isNull(islands.archivedAt),
        eq(presetIslands.published, true),
        userId ? eq(islands.userId, userId) : undefined,
      ),
    );

  console.log(
    `\n${candidates.length} unlinked island(s) matching a published preset${dryRun ? '\nDRY RUN — nothing is written' : ''}\n`,
  );

  let linked = 0;
  for (const row of candidates) {
    if (dryRun) {
      console.log(`  + would link "${row.islandName}" (${row.email})`);
      linked++;
      continue;
    }

    await db
      .update(islands)
      .set({ importedFromPresetId: row.presetId, updatedAt: new Date() })
      .where(eq(islands.id, row.islandId));

    await db
      .insert(presetImports)
      .values({
        userId: row.userId,
        presetIslandId: row.presetId,
        islandId: row.islandId,
      })
      .onConflictDoUpdate({
        target: [presetImports.userId, presetImports.presetIslandId],
        set: { islandId: row.islandId },
      });

    console.log(`  + linked "${row.islandName}" (${row.email})`);
    linked++;
  }

  // Duplicates are reported, never resolved: which copy to keep is the user's
  // call, and they now have an Archive control for it.
  const duplicates = await db
    .select({
      email: users.email,
      name: islands.name,
      copies: sql<number>`count(*)`,
    })
    .from(islands)
    .innerJoin(users, eq(users.id, islands.userId))
    .where(
      and(isNull(islands.archivedAt), userId ? eq(islands.userId, userId) : undefined),
    )
    .groupBy(users.email, islands.name)
    .having(sql`count(*) > 1`);

  console.log(`\n${linked} island(s) ${dryRun ? 'to link' : 'linked'}.`);

  if (duplicates.length > 0) {
    console.log(
      `\n${duplicates.length} duplicated island name(s) — archive the copy you don't want from the islands list:`,
    );
    for (const d of duplicates) {
      console.log(`  ! ${d.email}: "${d.name}" × ${Number(d.copies)}`);
    }
  } else {
    console.log('No duplicated island names.');
  }
  console.log();
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
