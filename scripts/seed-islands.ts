/**
 * Loads generated island content into a user's account — `npm run db:seed`.
 *
 * Input: the JSON files the `romanian-islands` skill writes to seed/. Sentences
 * land already translated (status 'translated', origin 'preset_import'), so they
 * cost nothing and need no API key. Phase 5 converts the same files into shared
 * preset islands; until then they seed one account directly.
 *
 * Idempotent: an island whose name already exists for the user is skipped, so
 * re-running after adding a file only inserts what is new.
 *
 * Usage:
 *   npm run db:seed -- --user=you@example.com [--file=seed/x.json] [--dry-run]
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

// tsx does not load .env files; do it before importing anything that reads env.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Absent file is fine — getDb() reports a missing DATABASE_URL itself.
  }
}

const SEED_DIR = path.resolve('seed');

interface Args {
  user: string;
  file?: string;
  dryRun: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string) =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

  const user = get('user');
  if (!user) {
    console.error(
      'Usage: npm run db:seed -- --user=you@example.com [--file=seed/x.json] [--dry-run]',
    );
    process.exit(1);
  }
  return { user, file: get('file'), dryRun: argv.includes('--dry-run') };
}

async function main() {
  const args = parseArgs();

  const { z } = await import('zod');
  const { and, eq } = await import('drizzle-orm');
  const { createId } = await import('@paralleldrive/cuid2');
  const { getDb } = await import('../src/db/index');
  const { islands, sentences, users } = await import('../src/db/schema');
  const { cacheTranslations } = await import('../src/db/queries/sentences');
  const { nextIslandPosition } = await import('../src/db/queries/islands');
  const { translationHash } = await import('../src/lib/hash');
  const { getTranslationProvider } = await import('../src/lib/translate/index');

  const fileSchema = z.object({
    island: z.object({
      name: z.string().min(1),
      emoji: z.string().optional(),
      level: z.string().optional(),
      description: z.string().optional(),
      sourceLang: z.string().default('en'),
      targetLang: z.string().default('ro'),
    }),
    sentences: z
      .array(
        z.object({
          en: z.string().min(1),
          ro: z.string().min(1),
          note: z.string().nullish(),
          lemmas: z.array(z.string()).default([]),
        }),
      )
      .min(1),
  });

  const files = args.file
    ? [path.resolve(args.file)]
    : (await readdir(SEED_DIR).catch(() => [] as string[]))
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => path.join(SEED_DIR, f));

  if (files.length === 0) {
    console.error(
      `\nNo seed files found in ${SEED_DIR}. Generate one first: /romanian-islands <topic>\n`,
    );
    process.exit(1);
  }

  const db = getDb();
  const found = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, args.user))
    .limit(1);
  const user = found[0];
  if (!user) {
    console.error(
      `\nNo user with email ${args.user}. Sign in to the app once, then re-run.\n`,
    );
    process.exit(1);
  }

  // The cache key carries the provider, so seeded text only counts as a cache
  // hit for the provider the app is currently configured with.
  const provider = getTranslationProvider().name;
  console.log(
    `\nuser: ${user.email}\nprovider (for cache keys): ${provider}${args.dryRun ? '\nDRY RUN — nothing is written' : ''}\n`,
  );

  let created = 0;
  let skipped = 0;
  let inserted = 0;

  for (const file of files) {
    const label = path.basename(file);
    let parsed;
    try {
      parsed = fileSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    } catch (error) {
      console.log(
        `  ✗ ${label} — invalid: ${error instanceof Error ? error.message.split('\n')[0] : error}`,
      );
      continue;
    }

    const existing = await db
      .select({ id: islands.id })
      .from(islands)
      .where(
        and(eq(islands.userId, user.id), eq(islands.name, parsed.island.name)),
      )
      .limit(1);

    if (existing.length > 0) {
      console.log(`  = ${label} — island "${parsed.island.name}" exists, skipped`);
      skipped++;
      continue;
    }

    const { sourceLang, targetLang } = parsed.island;
    const islandId = createId();
    const rows = parsed.sentences.map((s, i) => ({
      id: createId(),
      islandId,
      userId: user.id,
      sourceText: s.en,
      targetText: s.ro,
      sourceLang,
      targetLang,
      translationNote: s.note?.trim() ? s.note.trim() : null,
      status: 'translated' as const,
      contentHash: translationHash(s.en, sourceLang, targetLang, provider),
      origin: 'preset_import',
      position: i,
    }));

    if (args.dryRun) {
      console.log(
        `  + ${label} — would create "${parsed.island.name}" with ${rows.length} sentences`,
      );
      created++;
      inserted += rows.length;
      continue;
    }

    await db.insert(islands).values({
      id: islandId,
      userId: user.id,
      name: parsed.island.name,
      emoji: parsed.island.emoji ?? null,
      description: parsed.island.description ?? null,
      sourceLang,
      targetLang,
      position: await nextIslandPosition(user.id),
    });

    await db.insert(sentences).values(rows);

    // Warm the global cache so capturing the same sentence later is free.
    await cacheTranslations(
      rows.map((r) => ({
        contentHash: r.contentHash,
        targetText: r.targetText,
        translationNote: r.translationNote,
        lemmas:
          parsed.sentences.find((s) => s.en === r.sourceText)?.lemmas ?? [],
      })),
    );

    console.log(
      `  + ${label} — created "${parsed.island.name}" with ${rows.length} sentences`,
    );
    created++;
    inserted += rows.length;
  }

  console.log(
    `\n${created} island(s) ${args.dryRun ? 'to create' : 'created'}, ${skipped} skipped, ${inserted} sentence(s).\n`,
  );
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
