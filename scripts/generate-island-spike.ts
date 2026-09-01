/**
 * Island-generation quality spike — `npm run island:spike`.
 *
 * Generates one island through the app's own path (the configured translation
 * provider, `src/lib/ai/island.ts`) for a topic that already exists in `seed/`,
 * and prints the two side by side. The seed files came from an Opus-class model
 * in a Claude Code session; the app runs on Gemini Flash. This script is how
 * that gap gets measured before any UI is built on top of it.
 *
 * Every run also writes the generated island as JSON under `bakeoff-output/islands/`
 * (gitignored, like the TTS bake-off's output), so a run can be read at leisure
 * instead of only in terminal scrollback, and two runs can be diffed. The file
 * is in the same shape as `seed/*.json`, so `npm run db:seed -- --file=<it>`
 * loads a generated island into an account exactly like a curated one.
 *
 * Usage:
 *   npm run island:spike -- [--topic="Restaurant & café"] [--hint="..."] [--save=path.json]
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// tsx does not load .env files; do it before importing anything that reads env.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Absent file is fine — the provider reports its own missing vars.
  }
}

const SEED_DIR = path.resolve('seed');
const OUT_DIR = path.resolve('bakeoff-output', 'islands');
const DEFAULT_TOPIC = 'Restaurant & café';

interface Seed {
  island: { name: string; emoji?: string; level?: string; description?: string };
  sentences: { en: string; ro: string; note?: string; lemmas?: string[] }[];
}

function arg(name: string): string | undefined {
  return process.argv
    .slice(2)
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=');
}

/** 'Restaurant & café' -> 'restaurant-cafe', matching the seed file naming. */
function slug(topic: string): string {
  return topic
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
}

/** The checks the skill's Step 4 self-check runs, applied to both sides. */
function audit(sentences: { en: string; ro: string; note: string | null }[]) {
  const questions = sentences.filter((s) => s.ro.trim().endsWith('?')).length;
  const negations = sentences.filter((s) =>
    /(^|\s)(nu|n-)/iu.test(s.ro),
  ).length;
  const missingDiacritics = sentences.filter(
    (s) => !/[ăâîșț]/iu.test(s.ro),
  ).length;
  const overLong = sentences.filter((s) => s.ro.split(/\s+/u).length > 12).length;
  const notes = sentences.filter((s) => s.note).length;
  const words =
    sentences.reduce((sum, s) => sum + s.ro.split(/\s+/u).length, 0) /
    sentences.length;
  return { questions, negations, missingDiacritics, overLong, notes, words };
}

function line(label: string, a: string | number, b: string | number) {
  return `  ${label.padEnd(26)} ${String(a).padEnd(12)} ${b}`;
}

async function findSeed(topic: string): Promise<Seed | null> {
  const files = (await readdir(SEED_DIR).catch(() => [] as string[])).filter(
    (f) => f.endsWith('.json'),
  );
  for (const file of files) {
    const parsed = JSON.parse(
      await readFile(path.join(SEED_DIR, file), 'utf8'),
    ) as Seed;
    if (parsed.island.name.toLowerCase() === topic.toLowerCase()) return parsed;
  }
  return null;
}

async function main() {
  const topic = arg('topic') ?? DEFAULT_TOPIC;
  const hint = arg('hint');

  const { generateIsland } = await import('../src/lib/ai/island');
  const { getTranslationProvider } = await import('../src/lib/translate/index');

  const provider = getTranslationProvider();
  const config = provider.isConfigured();
  if (!config.ok) {
    console.error(
      `\n✗ provider "${provider.name}" is not configured — set ${config.missing.join(', ')} in .env.local\n`,
    );
    process.exit(1);
  }

  const seed = await findSeed(topic);
  console.log(
    `\ntopic: ${topic}\nprovider: ${provider.name}${hint ? `\nhint: ${hint}` : ''}\nseed baseline: ${seed ? `${seed.sentences.length} sentences` : 'none for this topic'}\n`,
  );

  const started = Date.now();
  const generated = await generateIsland({ topic, hint });
  const elapsed = Date.now() - started;

  console.log(
    `model: ${generated.model} (prompt ${generated.promptVersion}) in ${(elapsed / 1000).toFixed(1)}s`,
  );
  console.log(
    `island: ${generated.emoji ?? ''} ${generated.name} [${generated.level ?? '?'}] — ${generated.description ?? ''}\n`,
  );

  const seedSentences = (seed?.sentences ?? []).map((s) => ({
    en: s.en,
    ro: s.ro,
    note: s.note ?? null,
    lemmas: s.lemmas ?? [],
  }));

  const rows = Math.max(generated.sentences.length, seedSentences.length);
  console.log('─'.repeat(78));
  console.log('SIDE BY SIDE  —  A: seed (Claude Code / Opus)   B: app path\n');
  for (let i = 0; i < rows; i++) {
    const a = seedSentences[i];
    const b = generated.sentences[i];
    console.log(`${String(i + 1).padStart(2)}.`);
    console.log(`   A  EN  ${a?.en ?? '—'}`);
    console.log(`      RO  ${a?.ro ?? '—'}`);
    if (a?.note) console.log(`      ℹ   ${a.note}`);
    if (a) console.log(`      ⌂   ${a.lemmas.join(', ')}`);
    console.log(`   B  EN  ${b?.en ?? '—'}`);
    console.log(`      RO  ${b?.ro ?? '—'}`);
    if (b?.note) console.log(`      ℹ   ${b.note}`);
    if (b) console.log(`      ⌂   ${b.lemmas.join(', ')}`);
    console.log();
  }

  const a = audit(seedSentences);
  const b = audit(generated.sentences);
  console.log('─'.repeat(78));
  console.log('AUDIT (the skill\'s own self-check, both sides)\n');
  console.log(line('', 'A seed', 'B app'));
  console.log(line('sentences', seedSentences.length, generated.sentences.length));
  console.log(line('questions (>=3)', a.questions, b.questions));
  console.log(line('negations (>=2)', a.negations, b.negations));
  console.log(line('no diacritics (want 0)', a.missingDiacritics, b.missingDiacritics));
  console.log(line('over 12 words (want 0)', a.overLong, b.overLong));
  console.log(line('notes attached', a.notes, b.notes));
  console.log(line('avg RO words', a.words.toFixed(1), b.words.toFixed(1)));

  const overlap = seedSentences.filter((s) =>
    generated.sentences.some(
      (g) => g.en.toLowerCase().replace(/[^a-z ]/gu, '') === s.en.toLowerCase().replace(/[^a-z ]/gu, ''),
    ),
  ).length;
  console.log(line('identical EN to seed', overlap, overlap));

  const { inputTokens, outputTokens, cacheReadTokens } = generated.usage;
  console.log(
    `\ntokens: ${inputTokens} in / ${outputTokens} out / ${cacheReadTokens} cache-read`,
  );
  console.log(
    generated.costMicros === 0
      ? 'cost: free tier\n'
      : `cost: $${(generated.costMicros / 1_000_000).toFixed(4)}\n`,
  );

  // Always written, not just on --save: a 20-sentence island is worth reading
  // outside the terminal, and the file doubles as the input to `npm run db:seed`.
  const stamp = new Date().toISOString().slice(11, 19).replace(/:/gu, '');
  const outPath =
    arg('save') ??
    path.join(OUT_DIR, `${slug(topic)}-${generated.model}-${stamp}.json`);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(
    outPath,
    JSON.stringify(
      {
        island: {
          name: generated.name,
          emoji: generated.emoji,
          level: generated.level,
          description: generated.description,
        },
        sentences: generated.sentences,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  console.log(`saved: ${path.relative(process.cwd(), outPath)}\n`);
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
