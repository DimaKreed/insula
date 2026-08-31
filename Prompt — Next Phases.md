---
title: Промпти — фази 3–7
date: 2026-09-01
tags: [румунська/додаток, промпт]
---

# Prompts — Phases 3 to 7

One session per phase, run in this folder. Paste the **shared preamble**, then the
block for the phase you are starting. Phases 0–2 are done: auth, capture,
Gemini-free translation, Azure TTS with local storage, player, PWA.

## Shared preamble (always paste this first)

````
Continue building Insula. Read `Implementation Plan.md` for the plan and phase table,
check git log and the codebase for what is already done, then implement the phase named below.

Standing context:
- Phases 0–2 are complete. The database holds 13 islands / 242 sentences, all status='ready'
  with audio generated (244 audio_assets, ~15 MB).
- Translation: Gemini free tier behind `src/lib/translate/`. There is deliberately NO Anthropic
  key — anything needing an LLM must go through that adapter, never a new paid client.
- TTS: Azure Free F0, voice ro-RO-AlinaNeural, adapter in `src/lib/tts/`.
- Storage: adapter in `src/lib/storage/`, `local` by default (public/audio/), `r2` for deploy.
- Background work: `after()` behind the `enqueue` seam in `src/lib/enqueue.ts`. No queue service.
- NO new external accounts or paid services without asking me first.
- `npm run dev` uses webpack, not Turbopack — Smart App Control blocks the unsigned SWC binary
  (README → Troubleshooting). Don't "fix" it by re-adding --turbopack.

Working conventions: verify end-to-end before calling anything done (run it, show me output),
simplicity first, never modify the planning .md notes, and do not commit — I commit myself.
UI follows the approved design: https://claude.ai/code/artifact/43bd08cf-e20c-4c2c-9901-3eb9deefdff9
````

## Phase 3 — SRS (active recall)

The third pillar of the method: until this exists there is listening but no recall.

````
Implement Phase 3 — SRS with ts-fsrs.

Scope: review_states (1:1 with sentence, ts-fsrs Card fields stored verbatim, INDEX (user_id, due))
and review_logs (full ReviewLog jsonb, so a future FSRS optimizer run has the data); the daily
queue (due cards + new cards up to a per-user daily limit, honouring users.timezone for the day
boundary); the review session UI — English shown, "say it in Romanian out loud", tap to reveal,
audio playback, four grade buttons each labelled with its projected interval; a streak/stats view.

Notes:
- All 242 existing sentences need review_states rows in state New — backfill them.
- Only status='ready' sentences enter the queue.
- Reviews require network in this phase; offline review queueing is an explicit non-goal.
- Grade optimistically on the client; the server action persists state + log.
````

## Phase 4 — Shadowing polish + iOS hardening

````
Implement Phase 4 — Recall mode, compiled playlist tracks, iOS hardening.

Scope: Recall mode (EN prompt audio generated lazily per island on first use, cheap EN voice,
same TTS pipeline); compiled single-file playlist tracks per (island, mode) with silence gaps
baked in, invalidated by manifest_hash; navigator.storage.persist(); a real-device QA pass.

The compiled track is the point of this phase: it is what makes lock-screen playback survive on
iOS, where swapping src on auto-advance is fragile. Byte-concatenate CBR MP3 segments from one
provider and voice; fall back to ffmpeg-static only if naive concat breaks seek-bar duration.

I will test on a real iPhone — tell me exactly what to check and in what order.
````

## Phase 5 — Admin presets

````
Implement Phase 5 — admin preset islands.

Scope: preset_islands / preset_sentences / preset_imports; an admin route group gated on
users.role='admin' with a requireAdmin() helper; the preset builder (reusing the existing
translate + TTS pipeline); browse/preview/import for users, where import clones rows and
REUSES the same audio_asset ids so an import costs nothing.

Important: `seed/*.json` already holds the 12 curated islands. Convert those files into published
presets rather than re-generating content, and reuse the audio already in audio_assets.
Also give me a way to promote my own account to admin.
````

## Phase 6 — Pre-input comprehension

````
Implement Phase 6 — transcript pre-study.

Scope: user_vocab (lemmas, learning|known — backfill from the lemmas already in translation_cache);
transcripts + transcript_items; the two-pass analysis; the study-list UI showing "you already know
N% of this", per-word "I know this", and bulk "add to island".

Deviation from the plan to respect: the plan names Haiku for pass 1 and Sonnet for pass 2, but
there is no Anthropic key. Route both passes through the existing translation adapter (Gemini free
tier) — extend it with the calls you need rather than adding a second AI client.

Keep the SQL diff between the passes: the model extracts lemmas, Postgres diffs them against
user_vocab. Do not ask the model to do the diffing.
````

## Phase 7 — Hardening (pre-launch)

````
Implement Phase 7 — hardening.

Scope: enforce usage_monthly quotas at every entry point; a usage meter in settings; error surfaces
and empty states; first-run onboarding that teaches the method in three lines and points at presets.

On rate limiting: the plan names @upstash/ratelimit, which needs an Upstash account. Do not add it
yet — implement the limiter behind a small interface with an in-memory implementation, and tell me
what changes when we deploy. Same for storage: list exactly what must happen to move from local to
R2 before the first Vercel deploy.
````

Related: [[README]] • [[Implementation Plan]]
