/**
 * Generates audio for sentences that already have Romanian text but no
 * recording — `npm run audio:backfill`.
 *
 * The islands seeded in Phase 1 landed as 'translated' with no audio, so this
 * is how they get voiced without re-capturing anything. It shares the exact
 * pipeline the app uses (`src/lib/audio/tts.ts`), including the `audio_assets`
 * content-hash dedup, so a sentence identical to one already voiced costs
 * nothing and re-running the script only ever picks up what is still missing.
 *
 * Usage:
 *   npm run audio:backfill -- [--user=you@example.com] [--island=<id>]
 *                             [--limit=N] [--concurrency=N] [--dry-run]
 */
// tsx does not load .env files; do it before importing anything that reads env.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Absent file is fine — getDb() and the adapters report what they need.
  }
}

interface Args {
  user?: string;
  island?: string;
  limit?: number;
  concurrency: number;
  dryRun: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string) =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const num = (name: string) => {
    const raw = get(name);
    if (raw === undefined) return undefined;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
      console.error(`--${name} must be a positive integer`);
      process.exit(1);
    }
    return value;
  };

  return {
    user: get('user'),
    island: get('island'),
    limit: num('limit'),
    concurrency: num('concurrency') ?? 3,
    dryRun: argv.includes('--dry-run'),
  };
}

async function main() {
  const args = parseArgs();

  const { eq } = await import('drizzle-orm');
  const { getDb } = await import('../src/db/index');
  const { users } = await import('../src/db/schema');
  const { sentencesAwaitingAudio } = await import('../src/db/queries/audio');
  const { synthesizeSentences, voiceFor } = await import(
    '../src/lib/audio/tts'
  );
  const { getStorage } = await import('../src/lib/storage/index');
  const { getTtsProvider } = await import('../src/lib/tts/index');

  const provider = getTtsProvider();
  const config = provider.isConfigured();
  if (!config.ok) {
    console.error(
      `\n✗ TTS provider "${provider.name}" is not configured — set ${config.missing.join(', ')} in .env.local\n`,
    );
    process.exit(1);
  }
  const storage = getStorage();

  let userId: string | undefined;
  if (args.user) {
    const rows = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, args.user))
      .limit(1);
    if (!rows[0]) {
      console.error(`✗ no user with email ${args.user}`);
      process.exit(1);
    }
    userId = rows[0].id;
  }

  const items = await sentencesAwaitingAudio({
    userId,
    islandId: args.island,
    limit: args.limit,
  });

  const chars = items.reduce((sum, i) => sum + i.targetText.length, 0);
  const { voiceId } = items[0]
    ? voiceFor(provider, items[0].targetLang)
    : { voiceId: '—' };

  console.log(`\nprovider  ${provider.name} · voice ${voiceId}`);
  console.log(`storage   ${storage.name}`);
  console.log(
    `pending   ${items.length} sentence(s) · ${chars.toLocaleString()} characters before dedup\n`,
  );

  if (items.length === 0) {
    console.log('Nothing to do — every translated sentence already has audio.\n');
    return;
  }

  if (args.dryRun) {
    for (const item of items.slice(0, 10)) {
      console.log(`  ${item.targetText}`);
    }
    if (items.length > 10) console.log(`  … and ${items.length - 10} more`);
    console.log('\n--dry-run: nothing was synthesized.\n');
    return;
  }

  const started = Date.now();
  const summary = await synthesizeSentences(items, {
    concurrency: args.concurrency,
    onOutcome: (outcome, done, total) => {
      const mark =
        outcome.kind === 'synthesized'
          ? '♪'
          : outcome.kind === 'deduped'
            ? '='
            : '✗';
      const suffix = outcome.message ? ` — ${outcome.message}` : '';
      console.log(
        `  [${String(done).padStart(String(total).length)}/${total}] ${mark} ${outcome.sentenceId}${suffix}`,
      );
    },
  });

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `\nsynthesized ${summary.synthesized} · deduped ${summary.deduped} · failed ${summary.errors}`,
  );
  console.log(
    `${summary.chars.toLocaleString()} characters billed · ${seconds}s\n`,
  );

  if (summary.errors > 0) {
    console.log(
      'Failed rows carry their error message and a Retry button in the UI;\nre-running this script picks them up again.\n',
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

// Keeps this file an ES module, so its `main` does not collide with the other
// scripts that also run in the global scope (tsc checks them together).
export {};
