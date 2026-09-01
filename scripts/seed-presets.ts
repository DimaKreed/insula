/**
 * Converts the curated `seed/*.json` islands into published preset islands —
 * `npm run presets:seed`.
 *
 * Content is NOT regenerated: these 12 files are the quality bar, and their
 * Romanian is already translated. Audio is not regenerated either — the
 * recordings exist in `audio_assets` from seeding them into an account and
 * running `npm run audio:backfill`, and this script only links to them. So the
 * whole run costs nothing: no translation call, no TTS character.
 *
 * Idempotent by preset name: a preset that already exists is skipped, but its
 * audio links are refreshed, since recordings can appear after the preset does.
 *
 * Usage:
 *   npm run presets:seed -- [--user=you@example.com] [--file=seed/x.json] [--dry-run]
 *
 * --user only sets `created_by` for the audit trail; presets belong to nobody.
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

  const { z } = await import('zod');
  const { eq } = await import('drizzle-orm');
  const { createId } = await import('@paralleldrive/cuid2');
  const { getDb } = await import('../src/db/index');
  const { presetIslands, presetSentences, users } = await import(
    '../src/db/schema'
  );
  const { linkPresetAudio, nextPresetPosition } = await import(
    '../src/db/queries/presets'
  );

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

  const files = arg('file')
    ? [path.resolve(arg('file')!)]
    : (await readdir(SEED_DIR).catch(() => [] as string[]))
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => path.join(SEED_DIR, f));

  if (files.length === 0) {
    console.error(`\nNo seed files found in ${SEED_DIR}.\n`);
    process.exit(1);
  }

  const db = getDb();

  let createdBy: string | null = null;
  const email = arg('user');
  if (email) {
    const found = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!found[0]) {
      console.error(`\nNo user with email ${email}.\n`);
      process.exit(1);
    }
    createdBy = found[0].id;
  }

  console.log(
    `\n${files.length} seed file(s)${dryRun ? '\nDRY RUN — nothing is written' : ''}\n`,
  );

  let created = 0;
  let skipped = 0;
  let linked = 0;
  let missing = 0;

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
      .select({ id: presetIslands.id })
      .from(presetIslands)
      .where(eq(presetIslands.name, parsed.island.name))
      .limit(1);

    if (existing.length > 0) {
      // Skip the content, but still refresh audio links: recordings may have
      // been made since the preset was created.
      if (dryRun) {
        console.log(`  = ${label} — preset exists, would refresh audio links`);
      } else {
        const r = await linkPresetAudio(existing[0].id);
        linked += r.linked;
        missing += r.missing;
        console.log(
          `  = ${label} — preset exists; linked ${r.linked} more recording(s), ${r.missing} missing`,
        );
      }
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(
        `  + ${label} — would create "${parsed.island.name}" with ${parsed.sentences.length} sentences`,
      );
      created++;
      continue;
    }

    const presetId = createId();
    await db.insert(presetIslands).values({
      id: presetId,
      name: parsed.island.name,
      emoji: parsed.island.emoji ?? null,
      description: parsed.island.description ?? null,
      level: parsed.island.level ?? null,
      sourceLang: parsed.island.sourceLang,
      targetLang: parsed.island.targetLang,
      published: true,
      origin: 'seed',
      createdBy,
      position: await nextPresetPosition(),
    });

    await db.insert(presetSentences).values(
      parsed.sentences.map((s, i) => ({
        presetIslandId: presetId,
        sourceText: s.en,
        targetText: s.ro,
        translationNote: s.note?.trim() ? s.note.trim() : null,
        lemmas: s.lemmas,
        position: i,
      })),
    );

    const r = await linkPresetAudio(presetId);
    linked += r.linked;
    missing += r.missing;

    console.log(
      `  + ${label} — "${parsed.island.name}": ${parsed.sentences.length} sentences, ${r.linked} with audio, ${r.missing} without`,
    );
    created++;
  }

  console.log(
    `\n${created} preset(s) ${dryRun ? 'to create' : 'created'}, ${skipped} already existed.`,
  );
  if (!dryRun) {
    console.log(`${linked} recording(s) linked, ${missing} sentence(s) without audio.`);
    if (missing > 0) {
      console.log(
        'Sentences without audio: seed them into an account and run `npm run audio:backfill`,\nthen re-run this script to link what appeared.',
      );
    }
  }
  console.log();
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
