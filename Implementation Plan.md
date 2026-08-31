---
title: Insula — технічний план реалізації
date: 2026-08-19
tags: [румунська/додаток, проект, план]
---

# Insula — Implementation Plan

Mobile-first PWA implementing the language-islands method (see [[README]]). Product-ready multi-user, EN→RO MVP, multi-language-pair-ready schema. TTS provider decided by [[TTS Bake-off]].

## 1. Locked stack decisions

| Decision | Choice | Why (one line) |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript strict, single repo on Vercel | Familiar React/Node world, one deploy |
| Database | Neon serverless Postgres | HTTP driver built for Vercel functions; DB branching pairs with preview deploys; we don't need Supabase's bundled auth/storage |
| ORM | Drizzle (drizzle-orm + drizzle-kit) | SQL-first API for a Postgres-fluent dev, no codegen binary, smallest serverless footprint, first-class Neon + Auth.js adapters |
| Auth | Auth.js v5: Google OAuth + Resend email magic link, Drizzle adapter, JWT sessions with `role`/`tier` in token | Product requirement; Resend doubles as transactional email |
| Object storage | Pluggable `Storage` adapter (`src/lib/storage/`): **`local`** default (writes `public/audio/`), **`r2`** for deploy. Keys = content hashes either way | Local needs no account and is enough while developing; Vercel's filesystem is ephemeral and read-only, so R2 becomes mandatory **before the first deploy**. R2 over S3/Vercel Blob for zero egress fees — audio is replayed on repeat, so bandwidth dominates cost |
| Background jobs | **`after()` from `next/server`** for capture-time TTS + a local backfill script; **QStash deferred** until deploy/multi-user | `after()` runs work after the response is sent, so nobody waits on a spinner, with no extra service to run. A queue earns its place when retries, fan-out past the function timeout, and other users' load are real — none of which is true for a single local user. Kept behind one `enqueue` seam so QStash slots in without touching call sites |
| Translation | Pluggable `TranslationProvider` adapter (`src/lib/translate/`): **`gemini`** default, `claude` selectable via `TRANSLATION_PROVIDER` | Gemini's free Flash tier removes the need for a paid key; the adapter mirrors `TtsProvider` so switching back to Claude (~$0.10–0.30 per 500 sentences, better notes, no training on input) is one env var. Both share one prompt so output stays comparable |
| AI (transcripts, Phase 6) | `@anthropic-ai/sdk`: `claude-sonnet-5` pass 2, `claude-haiku-4-5` pass 1 | Quality where it matters, 3× cheaper model for the mechanical pass; structured outputs with zod, `effort: "low"` on mechanical calls, prompt caching |
| TTS | Pluggable `TtsProvider` adapter: ElevenLabs / Google / Azure / OpenAI, chosen by `TTS_PROVIDER` env | [[TTS Bake-off]] decides the default; swap is one env var |
| SRS | `ts-fsrs` | Maintained FSRS-5/6 implementation; ships the exact Card/ReviewLog types we persist |
| PWA | Serwist (`@serwist/next`) | Maintained Workbox successor to abandoned next-pwa, App Router support |
| UI | Tailwind v4 + shadcn/ui, lucide icons, sonner toasts | Sensible defaults, fast to build |
| Client state | Zustand (player + review session); TanStack Query (status polling only) | Everything else stays in server components + server actions |

## 2. Architecture overview

### 2.1 Repo layout

```
src/
  app/
    (marketing)/page.tsx                 # landing, unauthenticated
    (auth)/login/page.tsx                # Google + magic-link
    (app)/                               # authed shell: bottom tab nav (mobile-first)
      islands/page.tsx                   # island list (RSC)
      islands/[id]/page.tsx              # sentence list + capture box + statuses
      review/page.tsx                    # SRS daily session (client)
      player/[islandId]/page.tsx         # playlist player (client)
      presets/page.tsx, presets/[id]/    # browse + preview preset islands
      transcripts/page.tsx, [id]/        # pre-input comprehension
      settings/page.tsx                  # voice, daily limits, usage meter
    (admin)/admin/presets/               # admin-only preset builder
    api/
      auth/[...nextauth]/route.ts
      jobs/translate/route.ts            # QStash targets (signature-verified,
      jobs/tts/route.ts                  #   export const maxDuration = 300)
      jobs/compile-playlist/route.ts
      jobs/transcript/route.ts
      islands/[id]/status/route.ts       # lightweight polling endpoint
      islands/[id]/playlist/route.ts     # JSON manifest for player + offline download
  actions/                               # server actions, one file per domain
  db/schema.ts, db/index.ts, db/queries/ # Drizzle schema, client, data-access layer
  lib/ai/        (anthropic.ts, prompts.ts, transcript.ts)   # shared prompt + Claude client
  lib/translate/ (provider.ts, gemini.ts, claude.ts, index.ts)
  lib/tts/   (provider.ts, elevenlabs.ts, google.ts, azure.ts, openai.ts, index.ts)
  lib/srs/fsrs.ts
  lib/storage/r2.ts
  lib/quota.ts
  lib/audio/concat.ts                    # playlist-track compilation
  components/player/, review/, capture/
scripts/tts-bakeoff.ts                   # Phase 0
public/                                  # manifest, icons; SW via Serwist
```

**Server vs client split.** Server components render all lists/detail pages (islands, sentences, presets, stats) with data fetched directly via Drizzle. Client components only where interactivity demands: capture form, review session, player, transcript wizard. All mutations are **server actions** (zod-validated); **route handlers** exist only where an external caller needs a URL (Auth.js, QStash callbacks, polling/playlist JSON consumed by the service worker).

**Data isolation.** A thin data-access layer (`db/queries/*.ts`) where every function takes `userId` from the session as its first argument; no query touches user data without a `user_id` predicate. Postgres RLS deliberately out of scope for MVP.

### 2.2 PWA + offline audio

- **Service worker (Serwist):** precache app shell; NetworkFirst for navigations, StaleWhileRevalidate for static assets, **CacheFirst for R2 audio** in a dedicated `audio-v1` cache with range-request handling (audio elements issue `Range` requests; without it, cached audio fails on Safari).
- **Explicit offline download:** "Download island" fetches the playlist manifest, stores metadata in IndexedDB (`idb`), and `cache.addAll`s all audio into cache `island-{id}`. Metadata in IndexedDB, blobs in Cache Storage (streams to audio elements natively). Call `navigator.storage.persist()` after first download.
- **Media Session API:** island name + sentence text as track metadata, play/pause/next/prev handlers for lock-screen controls.
- **iOS reality check:** in an installed PWA, background playback of an HTMLAudioElement works, but auto-advance is fragile. Mitigations, in order:
  1. **Single persistent audio element** app-wide; swap `src` only inside the `ended` event handler; no howler.js, no Web Audio.
  2. **Compiled playlist tracks (the real fix, Phase 4):** server-side compile one continuous MP3 per (island, mode) with pauses baked in as silence. One track = zero auto-advance events, perfect lock-screen behavior, one file to cache. Compilation = byte-concatenation of CBR MP3 segments — every TTS adapter emits the same canonical format (MP3, 44.1 kHz, mono, fixed CBR bitrate, ID3 stripped) plus pre-generated silence segments. Avoids shipping ffmpeg; fallback `ffmpeg-static` if seek-bar quirks appear.
  3. Cache eviction: installed apps are exempt from Safari's 7-day storage cap; `persist()` adds protection; player detects offline cache miss and prompts "re-download island" rather than failing silently.
  - **Not mitigable:** no background download (user opens the app to sync new audio); if iOS kills the suspended PWA the playlist stops — the compiled single track minimizes but can't eliminate this.

## 3. Data model (Postgres via Drizzle)

Auth.js tables (`accounts`, `sessions`, `verification_tokens`) per the Drizzle adapter, plus:

```sql
users (
  id text PK,                          -- cuid2
  email text UNIQUE, email_verified timestamptz, name text, image text,
  role text NOT NULL DEFAULT 'user',   -- 'user' | 'admin'
  tier text NOT NULL DEFAULT 'free',   -- 'free' | 'pro'  (Stripe-ready; no payment tables in MVP)
  timezone text DEFAULT 'UTC',         -- daily-review day boundary
  settings jsonb DEFAULT '{}',         -- new-cards/day, voice pref, gap factor
  created_at timestamptz
)

islands (
  id text PK, user_id FK -> users ON DELETE CASCADE,
  name text, emoji text, description text,
  source_lang text NOT NULL DEFAULT 'en',
  target_lang text NOT NULL DEFAULT 'ro',
  imported_from_preset_id text NULL FK -> preset_islands,
  position int, archived_at timestamptz NULL, created_at, updated_at
)  -- INDEX (user_id)

sentences (
  id text PK, island_id FK -> islands ON DELETE CASCADE,
  user_id FK -> users,                     -- denormalized for isolation + due queries
  source_text text NOT NULL, target_text text NULL,
  source_lang text, target_lang text,
  translation_note text NULL,              -- optional register/grammar note from Claude
  status text NOT NULL DEFAULT 'pending',  -- pending|translating|translated|tts_queued|ready|error
  error_message text NULL,
  content_hash text NOT NULL,              -- sha256(normalize(source_text)|en|ro)
  target_audio_id text NULL FK -> audio_assets,
  prompt_audio_id text NULL FK -> audio_assets,  -- EN prompt audio, lazy for Recall mode
  origin text NOT NULL DEFAULT 'user',     -- user|preset_import|transcript
  preset_sentence_id text NULL,
  position int, created_at, updated_at
)  -- INDEX (user_id), (island_id, position), (content_hash)

audio_assets (                             -- GLOBAL, shared across users (dedup)
  id text PK,
  content_hash text UNIQUE NOT NULL,       -- sha256(provider|voice_id|lang|normalize(text)|format)
  provider text, voice_id text, lang text,
  storage_key text, url text, duration_ms int, char_count int, byte_size int,
  created_at
)

translation_cache (                        -- GLOBAL, shared across users
  content_hash text PK,                    -- sha256(normalize(source)|src|tgt|prompt_version)
  target_text text, translation_note text, lemmas jsonb, created_at
)

review_states (                            -- 1:1 with sentence (sentences are per-user)
  sentence_id text PK FK -> sentences ON DELETE CASCADE,
  user_id text FK -> users,
  due timestamptz, stability real, difficulty real,   -- ts-fsrs Card fields 1:1
  elapsed_days int, scheduled_days int, reps int, lapses int,
  state smallint,                          -- 0 New, 1 Learning, 2 Review, 3 Relearning
  last_review timestamptz NULL,
  extra jsonb DEFAULT '{}',                -- spillover for future ts-fsrs additions
  suspended boolean DEFAULT false
)  -- INDEX (user_id, due)  <- the hot query

review_logs (                              -- full history: enables future FSRS optimization
  id bigserial PK, user_id, sentence_id,
  rating smallint,                         -- 1 again .. 4 easy
  fsrs_log jsonb NOT NULL,                 -- ts-fsrs ReviewLog verbatim
  duration_ms int NULL, reviewed_at timestamptz
)  -- INDEX (user_id, reviewed_at)

preset_islands (
  id text PK, name, description, emoji, level text,   -- A1..B2
  source_lang, target_lang, position int,
  published boolean DEFAULT false, created_by FK -> users, created_at, updated_at
)
preset_sentences (
  id text PK, preset_island_id FK ON DELETE CASCADE,
  source_text, target_text, audio_asset_id FK -> audio_assets, position int
)
preset_imports (user_id, preset_island_id, island_id, imported_at,
  PK (user_id, preset_island_id))          -- prevents double-import

user_vocab (                               -- known vocabulary for pre-input comprehension
  id text PK, user_id FK, lang text, lemma text,
  status text DEFAULT 'learning',          -- learning|known
  source text,                             -- sentence|transcript_marked|seed
  first_sentence_id text NULL, created_at,
  UNIQUE (user_id, lang, lemma)
)

transcripts (
  id text PK, user_id FK, title text, lang text, raw_text text,
  char_count int, status text,             -- pending|analyzing|ready|error
  created_at
)
transcript_items (
  id text PK, transcript_id FK ON DELETE CASCADE,
  kind text,                               -- word|sentence
  target_text text, source_translation text,
  lemma text NULL, frequency int, rank int,
  known boolean DEFAULT false,
  added_sentence_id text NULL,             -- set when pushed into an island
  position int
)

playlist_tracks (                          -- compiled single-file audio per island+mode
  id text PK, island_id FK ON DELETE CASCADE, mode text,   -- listen|shadow|recall
  storage_key text, url text, duration_ms int,
  manifest_hash text,                      -- hash of ordered segment ids + gap config
  status text, created_at
)

usage_events (                             -- append-only audit
  id bigserial PK, user_id, kind text,     -- translation|tts|transcript_p1|transcript_p2
  provider text, model text,
  input_tokens int, output_tokens int, cache_read_tokens int, tts_chars int,
  cost_micros bigint, ref_id text NULL, created_at
)
usage_monthly (                            -- atomic upsert rollup; quota checks read THIS
  user_id, year_month text,                -- '2026-08'
  sentences_translated int, tts_chars int, transcript_analyses int,
  ai_input_tokens bigint, ai_output_tokens bigint, cost_micros bigint,
  PK (user_id, year_month)
)
```

Plan limits live as a versioned code constant in `lib/quota.ts`, keyed by tier — a table adds nothing until Stripe arrives.

**Preset clone mechanics:** import copies `preset_sentences` into the user's new `island`/`sentences` rows (`origin='preset_import'`, `status='ready'`) and **reuses the same `audio_asset_id`** — zero AI/TTS cost per import.

**Vocab derivation:** the translation call's structured output includes Romanian lemmas per sentence (Claude lemmatizes inline — no viable JS Romanian lemmatizer exists, and it's near-free inside the same call). Lemmas upsert into `user_vocab` as `learning`, flipped to `known` when the sentence's FSRS state reaches Review, or manually. Optional seed script imports lemmas from the existing `Words.md` vocabulary table.

## 4. Core flows

### 4.1 Capture → translate → TTS → ready

```
User types/pastes N sentences (one per line) in island view
-> server action captureSentences:
     zod-validate, 250-char cap per sentence, quota pre-check (usage_monthly vs tier)
     insert rows status='pending'; check translation_cache by content_hash
       cache hit -> write target_text immediately, status='translated'
     enqueue ONE QStash message -> /api/jobs/translate {uncached sentenceIds}
-> /api/jobs/translate (verify QStash signature; maxDuration=300):
     batch <=25 sentences per Claude call (claude-sonnet-5, effort:low,
       structured output: [{id, translation, note?, lemmas[]}], cached system prompt)
     update rows -> 'translated', upsert translation_cache + user_vocab, log usage_events
     per sentence: hash(provider|voice|text) lookup in audio_assets
       hit  -> link target_audio_id, status='ready'
       miss -> status='tts_queued', enqueue one QStash message per sentence -> /api/jobs/tts
-> /api/jobs/tts {sentenceId}:
     idempotency: re-check audio_assets by hash (UNIQUE constraint is the backstop)
     TtsProvider.synthesize(text, voice, canonical MP3) -> upload to R2 (key = hash)
     insert audio_assets, link sentence, status='ready', usage_events + usage_monthly bump
-> Client: island page polls /api/islands/[id]/status (TanStack Query, 2.5s,
     stops when all rows terminal). Failures land in status='error' with per-row Retry
     (QStash retries transient failures automatically first).
```

Why this shape: QStash gives at-least-once delivery + retries so a Vercel timeout or provider 500 can't strand a sentence; per-sentence TTS fan-out keeps each invocation seconds long; idempotent handlers make at-least-once safe.

### 4.2 SRS session

Server component loads the queue: `review_states WHERE user_id=? AND due<=now() AND NOT suspended ORDER BY due LIMIT 200`, topped up with new cards up to the daily new limit (default 15) — only `status='ready'` sentences. Client session (Zustand): show EN → user speaks RO aloud → tap to reveal RO text + play audio → 4 grade buttons showing ts-fsrs projected intervals → server action `gradeReview` runs `fsrs.next(card, now, rating)`, persists `review_states` + `review_logs`; client advances optimistically. Reviews require network in MVP (offline review queueing = explicit non-goal, noted for later).

### 4.3 Player modes

One persistent audio element + Zustand queue:

- **Listen** — RO clips sequential, 1s gap, loop island
- **Loop one** — repeat current sentence
- **Shadow (gap)** — RO → silent pause of `duration × gapFactor` (setting, default 1.5) → next
- **Recall** — EN prompt audio → pause → RO answer → next; EN audio generated lazily on first Recall use per island (cheap EN voice, same pipeline)

Gaps are timeouts between `ended` and next `play()` in foreground; for lock-screen/commute use the compiled `playlist_tracks` single file per mode (gaps baked in). Media Session wired in both paths.

### 4.4 Preset import

Browse published presets (RSC) → preview sentences + play samples → `importPresetIsland` server action clones rows in one transaction, links shared audio, creates `review_states` in state New. Instant, consumes no quota.

### 4.5 Transcript analysis (two-pass, token-frugal)

```
Paste text (cap 20k chars) -> quota check -> transcript 'analyzing' -> QStash /api/jobs/transcript
Pass 1 (claude-haiku-4-5, structured): content-word lemmas + frequencies + 20 key-sentence candidates
SQL diff: lemmas NOT IN user_vocab(status='known') -> unknown set, ranked by frequency
Pass 2 (claude-sonnet-5, structured): top ~30 unknown lemmas + key sentences ->
    EN glosses + one natural example sentence each (from/adapted from transcript) + translations
-> transcript_items; status='ready'; UI shows "% of transcript you already know" + study list
User actions: "I know this" -> user_vocab known; "Add to island" -> creates sentences
    (origin='transcript', RO+EN already present -> skips translation) -> TTS pipeline -> SRS
```

The SQL diff between passes is deliberate: Claude reliably extracts lemmas but unreliably diffs against a 2,000-item known-list; Postgres does the diff exactly and for free.

## 5. API surface

**Server actions** (zod-validated, session-scoped):

| Action | Purpose |
|---|---|
| `createIsland / renameIsland / archiveIsland / reorderIslands` | Island CRUD |
| `captureSentences(islandId, lines[])` | Insert + cache-check + enqueue translation |
| `editSentence / deleteSentence / retrySentence` | Edit re-runs pipeline only if hash changed |
| `gradeReview(sentenceId, rating, durationMs)` | FSRS transition + log |
| `suspendSentence(sentenceId)` | Remove from SRS without deleting |
| `importPresetIsland(presetId)` | Clone preset into user collection |
| `requestRecallAudio(islandId)` | Lazily enqueue EN prompt TTS for Recall mode |
| `requestPlaylistTrack(islandId, mode)` | Enqueue compiled-track build if manifest hash stale |
| `createTranscript(title, text)` | Quota check + enqueue analysis |
| `markVocab(lemmas[], status)` / `addTranscriptItems(ids[], islandId)` | Study-list actions |
| `updateSettings(patch)` | Voice, daily limits, gap factor, timezone |
| Admin: `createPreset / addPresetSentences / publishPreset / deletePreset` | Preset builder; reuses pipeline, optionally via Anthropic Batches API (50% cost — presets aren't latency-sensitive) |

**Route handlers:**

| Route | Purpose |
|---|---|
| `GET/POST /api/auth/[...nextauth]` | Auth.js |
| `POST /api/jobs/translate` | QStash: batch Claude translation |
| `POST /api/jobs/tts` | QStash: single-sentence TTS + R2 upload |
| `POST /api/jobs/transcript` | QStash: two-pass analysis |
| `POST /api/jobs/compile-playlist` | QStash: concat compiled track |
| `GET /api/islands/[id]/status` | Sentence status polling |
| `GET /api/islands/[id]/playlist` | Playlist manifest JSON (player + offline download) |

## 6. Phased implementation (MVP = Phases 0–6)

| Phase | Contents | Ends with (usable) | Size |
|---|---|---|---|
| **0 — Bootstrap + TTS bake-off** | create-next-app (TS strict), Tailwind 4 + shadcn, Drizzle + Neon, zod-validated env, Vercel project, CI (typecheck+lint); `scripts/tts-bakeoff.ts`: defines `TtsProvider` interface, implements all 4 adapters, synthesizes 3 fixed RO sentences × provider × 1–2 voices into `bakeoff-output/` + static A/B `index.html`. Decision recorded in [[TTS Bake-off]] | Provider decided; adapters already written | S (2–3 days) |
| **1 — Auth + capture + translation** | Auth.js (Google + magic link), schema migration, island/sentence CRUD, capture UI, Claude translation (synchronous in server action, ≤10/batch, defers QStash), translation_cache, usage_events | Capture EN sentences, see RO translations | M (~1 wk) |
| **2 — TTS pipeline + player + PWA** | Storage adapter (`local` first), `audio_assets` table + content-hash dedup, TTS on capture via `after()`, **backfill script for the 241 existing sentences**, status polling, player (Listen / Loop-one / Shadow), Serwist PWA shell, offline island download, Media Session. No new accounts | Method Steps 1+2 work; installable; offline commute listening | L (1.5–2 wks) |
| **3 — SRS** | ts-fsrs integration, review session UI, daily queue + new-card limits, streak/stats, review_logs | Step 3: daily active-recall sessions | M (~1 wk) |
| **4 — Shadowing polish + iOS hardening** | Recall mode (lazy EN audio), compiled playlist tracks, `storage.persist()`, real-device QA (iOS Safari PWA, Android Chrome) | Lock-screen-reliable commute playback | M (~1 wk) |
| **5 — Admin presets** | Admin route group + gate, preset builder (pipeline reuse), publish, browse/preview/import | Curated starter islands, one-tap import | S–M (3–5 days) |
| **6 — Pre-input comprehension** | Two-pass transcript analysis, study-list UI, vocab marking, add-to-island | All 4 method features = MVP complete | M (~1 wk) |
| **7 — Hardening (pre-launch)** | usage_monthly enforcement everywhere, usage meter in settings, @upstash/ratelimit on actions, error surfaces, empty states, onboarding | Launchable | S (2–4 days) |

Rough total: **7–9 weeks solo part-time** for a senior developer.

## 7. Cost control

1. **Never pay twice:** `translation_cache` and `audio_assets` are global — identical text is translated/synthesized exactly once **across all users**. Preset audio is the extreme case: generated once by admin, shared by every importer. Sentence edits re-run the pipeline only on hash change.
2. **Quotas** (code constants per tier per month, enforced pre-enqueue against `usage_monthly`): free — 500 translated sentences, 25k new TTS chars (dedup hits are free), 5 transcript analyses (≤20k chars each); pro — ~5×. Admin exempt. Hitting a cap yields a clear UI message, never a silent failure.
3. **Cheap-model routing:** Haiku for lemmatization; Sonnet only where quality matters; `effort: "low"` on mechanical calls; Anthropic Batches API (50% off) for admin preset bulk generation.
4. **Prompt caching:** stable ≥1024-token system prompt (translation style guide + few-shot examples) with `cache_control`, volatile sentences after the breakpoint; verify via `usage.cache_read_input_tokens` in `usage_events`.
5. **Free-tier translation:** with `TRANSLATION_PROVIDER=gemini` translation costs nothing (`cost_micros: 0`), but quotas still count sentences — a runaway capture is still capped. Gemini's free tier limits requests per day, not tokens, so the adapter batches 20 sentences per call (≈10k sentences/day at 500 RPD), against Claude's 10.
6. **Order of magnitude:** per sentence ≈ $0.001 translation + $0.001–0.002 TTS (Google/Azure) or ~$0.01–0.02 (ElevenLabs). A maxed-out free user ≈ **under $1/month** on Google/Azure, ~$5–10 on ElevenLabs — the bake-off choice is also a pricing decision.
7. **Egress:** R2 zero-egress + service-worker CacheFirst (audio fetched roughly once per device) makes replay free.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| iOS PWA background audio stops / won't auto-advance | Single persistent audio element, src-swap in `ended` handler, no Web Audio; compiled single-file playlist tracks as the primary commute mode; documented as a platform limit in-app |
| Local audio does not survive a deploy | Deliberate: `STORAGE_PROVIDER=local` is a development choice. R2 must be configured before the first Vercel deploy, and the adapter makes that an env change plus a one-off re-upload of `public/audio/` |
| Vercel function timeouts on batch jobs | QStash fan-out (per-sentence TTS), ≤25-sentence Claude batches, `maxDuration=300` on job routes (assume Vercel Pro at launch) |
| TTS cost blow-up (esp. ElevenLabs) | Hard per-user char quotas pre-enqueue, global audio dedup, 250-char sentence cap, provider swap = one env var |
| Claude structured-output drift / bad JSON | `messages.parse()` + zod schema, one retry on parse failure, `status='error'` + Retry button as the floor; `prompt_version` in cache keys so prompt iterations don't serve stale cache |
| At-least-once job delivery double-work | Idempotent handlers keyed on content hash; `audio_assets.content_hash` UNIQUE as backstop |
| Neon cold start / connection limits | `@neondatabase/serverless` HTTP driver (no pool exhaustion), short per-request queries |
| Magic-link deliverability | Resend with verified domain from day one; Google OAuth as primary path |
| Service-worker cache eviction offline | Installed-app exemption + `storage.persist()` + graceful "re-download" prompt on cache miss |
| Gemini free tier trains on input | Accepted deliberately: the method means narrating personal life, and Google states free-tier content may improve its products. `TRANSLATION_PROVIDER=claude` (Anthropic does not train on API data) is a one-line switch if that stops being acceptable |
| Free-tier translation quota exhausted mid-capture | Batch failures mark only their own rows `error` with a per-row Retry; the rest of the capture still lands |
| Romanian TTS quality unknown | Exactly what Phase 0's bake-off de-risks, before any pipeline depends on a provider |
| FSRS params generic, not personal | `review_logs` stores full ReviewLog from day one → future per-user optimizer run possible without data loss |
| Signup abuse burning AI quota | Quotas from first request; verified email (OAuth/magic-link inherently verifies); @upstash/ratelimit on capture/transcript actions |

## 8a. Starter content (no API cost)

Preset content is generated in a Claude Code session instead of through a paid
endpoint, then loaded straight into an account:

1. `/romanian-islands <topic>` — the skill at `.claude/skills/romanian-islands/SKILL.md`
   generates 20 EN→RO sentences with lemmas and notes, self-checks them, and writes
   `seed/{slug}.json`.
2. `npm run db:seed -- --user=<email>` — `scripts/seed-islands.ts` validates each file
   and inserts islands + sentences as `status: 'translated'`, `origin: 'preset_import'`,
   also warming `translation_cache`. Idempotent by island name, so re-runs only add what
   is new. `--dry-run` previews.
3. Phase 5 converts the same `seed/*.json` files into shared preset islands.

Driver prompt for all 12 starter topics: `Prompt — Seed 12 Islands.md`.

## 9. Libraries (consolidated)

`next@15` / `react@19` / TypeScript strict • `tailwindcss@4` + `shadcn/ui` + `lucide-react` + `sonner` • `drizzle-orm` + `drizzle-kit` + `@neondatabase/serverless` • `next-auth@5` + `@auth/drizzle-adapter` + `resend` + `react-email` • `zod` + `react-hook-form` • `@anthropic-ai/sdk` • `ts-fsrs` • `@upstash/qstash` + `@upstash/ratelimit` (+ Upstash Redis) • `@aws-sdk/client-s3` (R2) • `@serwist/next` • `zustand` • `@tanstack/react-query` (polling only) • `idb` • `@paralleldrive/cuid2` • `date-fns` • **no audio library** — custom hook over a plain audio element (howler's Web Audio path actively harms iOS lock-screen playback) • `vitest` (unit: quota math, FSRS wrapper, hash normalization) + one Playwright smoke • `tsx` for scripts.

## 10. Environment variables

```
DATABASE_URL=                 # Neon
AUTH_SECRET=                  # Auth.js
AUTH_GOOGLE_ID= / AUTH_GOOGLE_SECRET=
RESEND_API_KEY=               # magic-link email
TRANSLATION_PROVIDER=         # gemini | claude (default gemini)
GEMINI_API_KEY=               # free tier: https://aistudio.google.com/apikey
GEMINI_MODEL=                 # optional override; default gemini-3.5-flash
ANTHROPIC_API_KEY=            # only when TRANSLATION_PROVIDER=claude
TTS_PROVIDER=                 # elevenlabs | google | azure | openai (bake-off decides default)
ELEVENLABS_API_KEY=
GOOGLE_TTS_CREDENTIALS=       # service-account JSON (base64)
AZURE_SPEECH_KEY= / AZURE_SPEECH_REGION=
OPENAI_API_KEY=
STORAGE_PROVIDER=             # local | r2 (default local)
R2_ACCOUNT_ID= / R2_ACCESS_KEY_ID= / R2_SECRET_ACCESS_KEY= / R2_BUCKET= / R2_PUBLIC_URL=   # before first deploy
QSTASH_TOKEN= / QSTASH_CURRENT_SIGNING_KEY= / QSTASH_NEXT_SIGNING_KEY=                     # deferred: only when a queue is introduced
UPSTASH_REDIS_REST_URL= / UPSTASH_REDIS_REST_TOKEN=   # rate limiting (Phase 7)
NEXT_PUBLIC_APP_URL=
```

Related: [[README]] • [[TTS Bake-off]] • [[Prompt — Claude Design]] • [[Prompt — Claude Code]]
