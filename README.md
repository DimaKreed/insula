---
title: Insula — додаток для вивчення мов
date: 2026-08-19
tags: [румунська/додаток, проект]
---

# Insula — Language Learning App

**Insula** ("island" in Romanian) is a mobile-first PWA implementing the "language islands" learning method. Product-ready multi-user app; first language pair: **English → Romanian**. This folder is both the planning vault and the future app repo root.

## The method in 5 lines

1. **Capture** sentences from your real daily life (typed or phone-dictated) → AI translates them into Romanian, organized into topical "islands".
2. **Listen & shadow**: natural TTS audio for every sentence, played on repeat during commutes/workouts, with shadowing gap modes.
3. **Active recall**: see English → produce Romanian aloud → reveal → self-grade → FSRS spaced repetition schedules the next review.
4. **Pre-input comprehension**: paste a transcript, study its unknown words *before* watching the native content.
5. Consistency target: conversational in ~6 weeks of daily practice built into dead time.

## Documents

- [[Implementation Plan]] — full technical plan: stack, architecture, data model, flows, API, 8 phases, cost control, risks
- [[TTS Bake-off]] — how the Romanian TTS provider gets chosen (Phase 0); decision record
- [[Prompt — Claude Design]] — self-contained prompt for Claude Design to produce the UI
- [[Prompt — Claude Code]] — kickoff prompt for the Claude Code implementation session (Phase 0)
- [[Prompt — Seed 12 Islands]] — drives the `romanian-islands` skill over the 12 starter topics, then seeds them
- [[Prompt — Next Phases]] — session prompts for Phases 3–7
- [UI design — Claude Design canvas](https://claude.ai/code/artifact/43bd08cf-e20c-4c2c-9901-3eb9deefdff9) — 16 artboards: Login, HomeEmpty, Main, IslandDetail, Player, ReviewPrompt/Reveal/Done, Presets, PresetDetail, TranscriptPaste/Analyzing/Results, Settings, HomeDesktop, AdminBuilder

## Status / next steps

- [x] UI design generated → [Claude Design canvas](https://claude.ai/code/artifact/43bd08cf-e20c-4c2c-9901-3eb9deefdff9) (2026-08-20)
- [x] Phase 0: scaffold + bake-off script (2026-08-31)
- [x] TTS decision: **Azure (Free F0)**, native ro-RO voices — details in [[TTS Bake-off]] (2026-08-31)
- [x] Phase 1: auth + capture + translation (2026-08-31)
- [x] Translation moved behind an adapter; default **Gemini free tier** (2026-08-31)
- [x] 12 starter islands generated and seeded — 241 sentences (2026-08-31)
- [x] Phase 2: TTS pipeline, storage adapter, player, PWA + offline download (2026-09-01)
- [x] Audio backfilled for all 241 seeded sentences — Azure F0, free (2026-09-01)
- [ ] Real-device pass: install the PWA on iOS + Android, download an island, listen offline
- [ ] Implement Phases 3–7 per [[Implementation Plan]] → next: Phase 3 (SRS)

## Obsidian note

When the repo is initialized here, exclude build folders from Obsidian indexing:
**Settings → Files & Links → Excluded files** → add `node_modules`, `.next`, `bakeoff-output`, `drizzle`.

---

## Development

Next.js 15 (App Router, TypeScript strict) + Tailwind 4 + shadcn/ui. Requires Node 24.

```bash
npm install
cp .env.example .env.local   # fill in what you need
npm run dev                  # http://localhost:3000
```

| Script | Does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js (dev uses webpack — see Troubleshooting). `build` also builds the service worker |
| `npm run dev:turbo` | Next.js dev with Turbopack (needs the native SWC binary) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run bakeoff` | TTS bake-off (Phase 0) |
| `npm run translate:smoke` | Translate 3 fixed sentences with the configured provider |
| `npm run audio:backfill` | Generate audio for translated sentences that have none |
| `npm run db:seed -- --user=<email>` | Load `seed/*.json` islands into an account |
| `npm run db:generate` / `db:migrate` | Drizzle migrations (needs `DATABASE_URL`) |

CI (`.github/workflows/ci.yml`) runs typecheck + lint on every push.

### Running the TTS bake-off

Synthesizes the three fixed Romanian sentences from [[TTS Bake-off]] with every
**configured** provider × 1–2 Romanian voices, then writes a blind A/B listening
page. Unconfigured providers are skipped and listed — you can bake off one
provider at a time.

```bash
npm run bakeoff
start bakeoff-output/index.html
```

Labels are hidden by default and the samples are shuffled, so you judge by ear
first; the checkbox at the top reveals which provider is which. Record the
winner in [[TTS Bake-off]] — it sets `TTS_PROVIDER` and gates Phase 1.

### TTS provider env vars

Each provider needs only its own keys, all on their respective free tiers:

| Provider | Env vars | Where to get them |
|---|---|---|
| `elevenlabs` | `ELEVENLABS_API_KEY` | elevenlabs.io → Settings → API Keys |
| `google` | `GOOGLE_TTS_CREDENTIALS` | GCP service-account JSON, **base64-encoded** (see `.env.example`); enable the Cloud Text-to-Speech API |
| `azure` | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | Azure portal → Speech resource → Keys and Endpoint |
| `openai` | `OPENAI_API_KEY` | platform.openai.com → API keys |

`TTS_PROVIDER` selects the provider the app itself synthesizes with; the bake-off
ignores it and tries all four.

**Voice selection.** Azure and OpenAI have small fixed catalogs, so the adapters'
built-in voice lists are used. Google's `ro-RO` voice ids vary by project, and
ElevenLabs has no Romanian catalog at all (the good Romanian voices live in the
community Voice Library), so for those two the bake-off queries the API: it picks
the best available Google tier, and for ElevenLabs uses Romanian voices already
on your account, otherwise **adds the top two Romanian library voices to your
account** before synthesizing.

**Canonical audio format.** Every adapter emits MP3, mono, constant bitrate, so
Phase 4 can compile a playlist track by byte-concatenating segments. 44.1 kHz is
the target, but only ElevenLabs offers it natively — Google's v1 MP3 is 32 kbps,
Azure caps at 48 kHz, and OpenAI's rate is fixed and undocumented. Each adapter
documents its own deviation; concatenation is unaffected because segments always
share one provider and voice.

### Translation provider

Translation runs behind an adapter (`src/lib/translate/`), selected by
`TRANSLATION_PROVIDER`:

| Provider | Cost | Notes |
|---|---|---|
| `gemini` (default) | free | Flash tier, no card. Google may use free-tier content to improve its products |
| `claude` | ~$0.10–0.30 / 500 sentences | Best notes and lemmas; Anthropic does not train on API data |

Both share one prompt (`src/lib/ai/prompts.ts`), so output stays comparable. The
provider is part of the `translation_cache` key — switching re-translates rather
than serving the other provider's output. Verify a provider end-to-end with
`npm run translate:smoke`.

### Content generation (no API cost)

Starter island content is generated in a Claude Code session, not through a paid
endpoint:

```bash
# in a session started in this folder:
/romanian-islands Restaurant & café     # → seed/restaurant-cafe.json (20 sentences)

npm run db:seed -- --user=you@example.com --dry-run
npm run db:seed -- --user=you@example.com
```

The skill lives at `.claude/skills/romanian-islands/SKILL.md`. Seeding is
idempotent by island name, so re-runs only add what is new. `seed/*.json` stays
the source of truth — Phase 5 converts the same files into shared preset islands.
For all 12 starter topics at once, use [[Prompt — Seed 12 Islands]].

### Audio pipeline (Phase 2)

Capture now runs the whole way: text → translation → audio. Translation still
happens inside the server action (the caller waits for the Romanian), while TTS
runs afterwards as background work, so the action returns as soon as the text
exists and the island page polls the rows to **Ready**.

```
captureSentences  → translate (inline)  → startAudio()
                                          ↳ enqueue('tts', …)  ← src/lib/enqueue.ts
                                             ↳ synthesizeSentences()  ← src/lib/audio/tts.ts
```

- **Background work** is `after()` from `next/server`, behind the single
  `enqueue` seam in `src/lib/enqueue.ts`. No queue service runs; QStash slots in
  there later without touching call sites. Trade-off: `after()` is best-effort,
  so a crashed job leaves rows non-terminal — the per-row **Retry** button and
  `npm run audio:backfill` both pick them up.
- **Never pay twice.** `audio_assets` is global and keyed by
  `sha256(provider|voice|lang|normalized text|format)`, which is also the
  storage key. Identical Romanian in two islands (or two accounts) is
  synthesized once and linked twice, billing 0 characters the second time.
- **Quotas** count characters actually sent to the provider (`usage_events`,
  `usage_monthly`); dedup hits and retries cost nothing.
- **Duration** is read from the MP3's own frame header (`src/lib/audio/mp3.ts`) —
  the canonical CBR format makes it arithmetic, no decoder needed. The player
  uses it to size Shadow-mode gaps before any audio has loaded.

Backfill is how the 241 seeded sentences got their audio, and how anything that
fails gets a second run. It is idempotent — sentences with audio stop matching:

```bash
npm run audio:backfill -- --dry-run          # what would be synthesized
npm run audio:backfill                       # everything still missing audio
npm run audio:backfill -- --island=<id> --limit=20 --concurrency=2
```

### Object storage

Audio is written through an adapter (`src/lib/storage/`), selected by
`STORAGE_PROVIDER`:

| Provider | Writes to | Notes |
|---|---|---|
| `local` (default) | `public/audio/<hash>.mp3`, served by Next | No account, no config. Git-ignored |
| `r2` | Cloudflare R2 over its S3 API | **Required before the first deploy** — Vercel's filesystem is read-only and ephemeral |

Switching is an env change plus a one-off upload of `public/audio/` to the
bucket; keys are content hashes either way, so nothing else moves.

### TTS voice and throttling

`TTS_VOICE` pins the voice; unset, the adapter's first voice for the language
wins (Azure: `ro-RO-AlinaNeural`). Azure's **free F0 tier** allows roughly 20
neural requests a minute and answers the rest with HTTP 429, so every adapter
now goes through `fetchRetrying`, which honours `Retry-After` and otherwise
backs off exponentially. A full 241-sentence backfill takes a few minutes on F0
and costs nothing — the whole corpus is ~7k characters against a 500k monthly
free allowance.

### PWA and offline listening

- **Service worker:** Serwist in *configurator mode* — `src/sw.ts` is bundled by
  `serwist build` (see `serwist.config.mjs`) as a step after `next build`, not by
  a webpack plugin. The plugin route breaks the Next 15.5 build: it drops
  `pages/_error` from `.next/build-manifest.json` and every production route
  then returns a bare 500. Configurator mode never touches the Next build.
- **Caching:** the app shell is precached; `/audio/*.mp3` uses CacheFirst in an
  `audio-v1` cache with `RangeRequestsPlugin` — audio elements issue `Range`
  requests, and Safari fails outright on a cached response that ignores them.
- **Download island** (`src/lib/offline.ts`) stores the playlist manifest and
  every audio file in a per-island `island-{id}` cache and calls
  `navigator.storage.persist()`. The manifest's presence in that cache *is* the
  record that the island was downloaded — there is no second store to keep in
  sync.
- **The service worker is disabled in development** (`npm run dev`), where a
  cache over a recompiling app only produces confusing staleness. To try
  offline listening, use a production build:

  ```bash
  npm run build && npm start   # then install the app and toggle the network off
  ```

- **iOS caveats** are the ones the plan documents: background playback works
  through the app's single persistent audio element, but auto-advance across a
  locked screen stays fragile until Phase 4's compiled single-file playlist
  tracks land.

## Troubleshooting

### `An Application Control policy has blocked this file` (next-swc)

Windows **Smart App Control** blocks the unsigned `@next/swc-win32-x64-msvc`
native binary, so Next.js falls back to its WASM build — which Turbopack does not
support (`turbo.createProject is not supported by the wasm bindings`).

`npm run dev` therefore uses webpack, which works fine with the WASM fallback:
first compile ~15s, page compiles ~0.3–1.3s. The two SWC warnings on startup are
expected and harmless.

To get Turbopack (and native-speed builds) locally you would have to turn Smart
App Control off — Windows Security → App & browser control → Smart App Control.
**That is effectively one-way: it cannot be re-enabled without reinstalling
Windows.** Check its state with:

```powershell
Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy' |
  Select-Object VerifiedAndReputablePolicyState   # 0 off, 1 enforced, 2 evaluation
```

`npm run build` does **not** pass `--turbopack` either, for an unrelated reason:
the service-worker build step (`serwist build`) reads the finished `.next`
output, and Serwist has no Turbopack support. Webpack builds work on Vercel's
Linux runners as well as locally.
