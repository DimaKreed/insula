/**
 * End-to-end check of island generation — `npm run generate:verify`.
 *
 * Runs the real path: the quota check from `src/lib/quota.ts`, the model call
 * from `src/lib/ai/island.ts`, the row writing from `src/lib/islands/generated.ts`
 * and the synthesis from `src/lib/audio/tts.ts` — the same functions the server
 * action calls. Only two things differ, both unavailable to a plain script:
 * there is no session (the user is looked up by email) and TTS runs inline
 * rather than behind `enqueue`/`after()`.
 *
 * Prints the generated sentences, what audio each one got, and the
 * `usage_monthly.islands_generated` counter before and after.
 *
 * Usage:
 *   npm run generate:verify -- --user=you@example.com [--brief="..."] [--name="..."] [--keep]
 *
 * Without --keep the island it created is deleted again, so a verification run
 * leaves no clutter. The audio assets and the warmed translation cache stay —
 * they are global and shared, and throwing them away would waste real TTS spend.
 */
import path from 'node:path';

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
  const email = arg('user');
  if (!email) {
    console.error(
      '\nUsage: npm run generate:verify -- --user=you@example.com [--brief="..."] [--name="..."] [--keep]\n',
    );
    process.exit(1);
  }
  const brief =
    arg('brief') ??
    'I need phrases for the pharmacy. I run most mornings and get blisters and sore knees.';
  const name = arg('name');
  const keep = process.argv.slice(2).includes('--keep');

  const { eq } = await import('drizzle-orm');
  const { getDb } = await import('../src/db/index');
  const { islands, users } = await import('../src/db/schema');
  const { monthlyUsage, recordIslandGenerationUsage } = await import(
    '../src/db/queries/usage'
  );
  const { sentencesAwaitingAudio } = await import('../src/db/queries/audio');
  const { recentOffenceDates, recordOffence } = await import(
    '../src/db/queries/generation'
  );
  const { listSentences } = await import('../src/db/queries/sentences');
  const { generateIsland } = await import('../src/lib/ai/island');
  const { createGeneratedIsland } = await import(
    '../src/lib/islands/generated'
  );
  const { synthesizeSentences } = await import('../src/lib/audio/tts');
  const {
    OFFENCE_WINDOW_DAYS,
    checkIslandQuota,
    generationBlock,
    limitsFor,
    offenceWarning,
    yearMonth,
  } = await import('../src/lib/quota');

  const db = getDb();
  const found = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      tier: users.tier,
      timezone: users.timezone,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const user = found[0];
  if (!user) {
    console.error(`\nNo user with email ${email}.\n`);
    process.exit(1);
  }

  const period = yearMonth(new Date(), user.timezone);
  const limits = limitsFor(user.tier, user.role);
  const before = (await monthlyUsage(user.id, period))?.islandsGenerated ?? 0;

  console.log(
    `\nuser: ${user.email} (${user.role}, ${user.tier})\nperiod: ${period}\nbrief: ${brief}${name ? `\nname: ${name}` : ''}`,
  );
  console.log(
    `quota: islands_generated ${before}/${limits ? limits.islandsGenerated : '∞ (admin exempt)'}`,
  );

  // 1. The block gate, before anything else — the order the action uses. No
  // offence is logged for hitting it, so retrying cannot extend a block.
  const offenceWindowStart = new Date(
    Date.now() - OFFENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const existing = await recentOffenceDates(user.id, offenceWindowStart);
  const gate = generationBlock(existing, new Date(), limits);
  console.log(`offences in window: ${existing.length}`);
  if (gate.blocked) {
    console.log(`\n⊘ BLOCKED before the model ran\n  ${gate.message}\n`);
    console.log(
      'Clear it with: npm run admin -- --clear-offences=' + user.email + '\n',
    );
    return;
  }
  console.log('block check: allowed');

  // 2. Quota, still before the model is called.
  const quota = checkIslandQuota(limits, before);
  if (!quota.allowed) {
    console.error(`\n✗ quota refused: ${quota.message}\n`);
    process.exit(1);
  }
  console.log('quota check: allowed\n');

  // 3. The model — which also decides whether the brief is in scope at all.
  const started = Date.now();
  const result = await generateIsland({ brief, name });
  console.log(
    `model: ${result.model} (prompt ${result.promptVersion})
assessment: ${result.assessment || '(none)'}`,
  );

  if (result.kind === 'rejected') {
    // Same consequence the action applies: an offence row, no island, and the
    // month's island counter untouched.
    await recordOffence({ userId: user.id, brief, reason: result.reason });
    const dates = await recentOffenceDates(user.id, offenceWindowStart);
    const after = (await monthlyUsage(user.id, period))?.islandsGenerated ?? 0;
    console.log(`
⊘ REJECTED
  ${result.reason}`);
    console.log(`  ${offenceWarning(dates.length)}`);
    console.log(`
offences in window: ${dates.length}`);
    console.log(`islands_generated: ${before} -> ${after} (must not change)`);
    const block = generationBlock(dates, new Date(), limits);
    console.log(
      block.blocked
        ? `next attempt: refused before the model runs — ${block.message}`
        : 'next attempt: allowed (admin exempt)',
    );
    console.log(
      after === before
        ? '\n✅ rejection handled: offence logged, no quota spent.\n'
        : '\n⚠️  islands_generated moved on a rejection.\n',
    );
    if (after !== before) process.exit(1);
    return;
  }

  const generated = result;
  console.log(
    `generated: ${generated.sentences.length} sentences via ${generated.provider}/${generated.model} (prompt ${generated.promptVersion}) in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  console.log(
    `island: ${generated.emoji ?? ''} ${generated.name} [${generated.level ?? '?'}] — ${generated.description ?? ''}\n`,
  );

  // 4. The rows.
  const { islandId, sentenceIds } = await createGeneratedIsland({
    userId: user.id,
    generated,
  });
  console.log(`island row: ${islandId}, ${sentenceIds.length} sentence(s)`);

  // 5. Usage accounting.
  await recordIslandGenerationUsage({
    userId: user.id,
    yearMonth: period,
    provider: generated.provider,
    model: generated.model,
    inputTokens: generated.usage.inputTokens,
    outputTokens: generated.usage.outputTokens,
    cacheReadTokens: generated.usage.cacheReadTokens,
    costMicros: generated.costMicros,
    refId: islandId,
  });

  // 6. Audio — inline here, behind `enqueue` in the action.
  const awaiting = await sentencesAwaitingAudio({ ids: sentenceIds });
  console.log(`awaiting audio: ${awaiting.length}\nsynthesizing…`);
  const summary = await synthesizeSentences(awaiting);
  console.log(
    `audio: ${summary.synthesized} synthesized, ${summary.deduped} reused, ${summary.errors} failed, ${summary.chars} chars billed\n`,
  );
  for (const outcome of summary.outcomes.filter((o) => o.kind === 'error')) {
    console.log(`  ✗ ${outcome.sentenceId}: ${outcome.message}`);
  }

  // 7. Read the island back the way the UI does.
  const rows = await listSentences(user.id, islandId);
  console.log('─'.repeat(74));
  for (const [i, row] of rows.entries()) {
    console.log(
      `${String(i + 1).padStart(2)}. [${row.status}${row.audioUrl ? ' ♪' : '  '}] ${row.targetText}`,
    );
    console.log(`    EN   ${row.sourceText}`);
    if (row.translationNote) console.log(`    NOTE ${row.translationNote}`);
  }
  console.log('─'.repeat(74));

  const after = (await monthlyUsage(user.id, period))?.islandsGenerated ?? 0;
  const ready = rows.filter((r) => r.status === 'ready').length;
  const withAudio = rows.filter((r) => r.audioUrl !== null).length;

  console.log(`\nsentences:  ${rows.length}`);
  console.log(`status ready: ${ready}/${rows.length}`);
  console.log(`with audio:   ${withAudio}/${rows.length}`);
  console.log(`islands_generated: ${before} -> ${after}`);
  console.log(
    `tokens: ${generated.usage.inputTokens} in / ${generated.usage.outputTokens} out · ${generated.costMicros === 0 ? 'free tier' : `$${(generated.costMicros / 1_000_000).toFixed(4)}`}`,
  );

  if (keep) {
    console.log(`\nkept: /islands/${islandId}\n`);
  } else {
    await db.delete(islands).where(eq(islands.id, islandId));
    console.log(
      '\nisland deleted (pass --keep to leave it). Audio assets and the warmed\ntranslation cache are global and were left in place.\n',
    );
  }

  const ok = rows.length > 0 && ready === rows.length && after === before + 1;
  console.log(
    ok
      ? '✅ end to end: generated, voiced, counted.\n'
      : `⚠️  check the numbers above (${path.basename(process.argv[1])}).\n`,
  );
  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
