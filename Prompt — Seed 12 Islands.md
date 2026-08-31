---
title: Промпт — наповнити 12 стартових островів
date: 2026-08-31
tags: [румунська/додаток, промпт]
---

# Prompt — Seed the 12 starter islands

Drives the [[romanian-islands]] skill over the 12 planned starter topics (240
sentences), then loads them into the database. Zero API cost — the content is
generated in the session, not through a paid endpoint.

**How to use:** open a Claude Code session **in this folder** (`c:\Блог\Румунська\app`,
where the skill lives) and paste the block below. Expect it to take a while:
one topic per turn is deliberate.

````
Generate the 12 starter islands for Insula using the `romanian-islands` skill, then seed them.

Work through these topics, ONE PER TURN — invoke `/romanian-islands <topic>` for each and
let it finish writing its file before starting the next. Do not batch several topics into
one generation: long JSON gets truncated and the diacritics are the first thing to break.

1. Greetings & small talk
2. Restaurant & café
3. Shopping & groceries
4. Transport & directions
5. Work & meetings (IT)
6. Apartment & daily routine
7. Health & pharmacy
8. Running & sport
9. Phone, internet & paperwork
10. Weather & time
11. Opinions & feelings
12. Making plans & socializing

After each topic, before moving on, verify its file:
- it parses as JSON and has exactly 20 sentences
- Romanian diacritics are present (ă â î ș ț) — a file with plain a/i/s/t instead is wrong
- at least 3 questions and 2 negations
- no `en` sentence duplicates one already in another seed/*.json

If a topic fails verification, fix that file before continuing. If you cannot fix it,
STOP and tell me which topic failed and why — do not plow ahead through the remaining topics.

Skip any topic whose seed file already exists (the skill will tell you); never overwrite
without asking me.

When all 12 files exist:
1. `npm run db:seed -- --user=vadm@zoop.com --dry-run` and show me the output
2. if it looks right, run it for real: `npm run db:seed -- --user=vadm@zoop.com`
3. re-run the same command once more to prove it is idempotent (everything should say "skipped")

Then report: how many islands and sentences landed, and anything you had to fix along the way.
Do not commit — I commit myself.
````

## After seeding

- The islands appear in the app under `/islands` with their sentences already
  translated (`status: 'translated'`); audio arrives when Phase 2 lands the TTS
  pipeline, and reviews when Phase 3 lands SRS.
- `seed/*.json` stays the source of truth: Phase 5 converts the same files into
  shared **preset islands** every user can import, reusing the audio generated
  once — see [[Implementation Plan]] §7.
- Sanity-check a few sentences with a native speaker before this content ships
  to other users as presets.

Related: [[README]] • [[Implementation Plan]]
