/**
 * Translation smoke test — run with `npm run translate:smoke`.
 *
 * Translates three fixed English sentences with the configured provider and
 * prints the result, so the translation path can be verified without the UI or
 * a database. Mirrors scripts/tts-bakeoff.ts.
 */
// tsx does not load .env files; do it before importing anything that reads env.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Absent file is fine — the provider reports its own missing vars.
  }
}

const SENTENCES = [
  'I am going to make coffee and check my email.',
  "Could you speak a bit slower, please? I don't understand.",
  'This meeting could have been an email.',
];

async function main() {
  const { getTranslationProvider } = await import('../src/lib/translate/index');

  const provider = getTranslationProvider();
  const config = provider.isConfigured();
  if (!config.ok) {
    console.error(
      `\n✗ provider "${provider.name}" is not configured — set ${config.missing.join(', ')} in .env.local\n`,
    );
    process.exit(1);
  }

  console.log(
    `\nprovider: ${provider.name} (batch size ${provider.batchSize})`,
  );

  const items = SENTENCES.map((text, i) => ({ id: `s${i + 1}`, text }));
  const result = await provider.translateBatch(items, 'en', 'ro');

  console.log(`model: ${result.model}\n`);
  for (const t of result.translations) {
    const source = items.find((i) => i.id === t.id)!.text;
    console.log(`  EN  ${source}`);
    console.log(`  RO  ${t.targetText}`);
    if (t.translationNote) console.log(`  ℹ   ${t.translationNote}`);
    console.log(`  ⌂   ${t.lemmas.join(', ')}\n`);
  }

  const { inputTokens, outputTokens, cacheReadTokens } = result.usage;
  console.log(
    `tokens: ${inputTokens} in / ${outputTokens} out / ${cacheReadTokens} cache-read`,
  );
  console.log(
    result.costMicros === 0
      ? 'cost: free tier\n'
      : `cost: $${(result.costMicros / 1_000_000).toFixed(4)}\n`,
  );
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
