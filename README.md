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
- [UI design — Claude Design canvas](https://claude.ai/code/artifact/43bd08cf-e20c-4c2c-9901-3eb9deefdff9) — 16 artboards: Login, HomeEmpty, Main, IslandDetail, Player, ReviewPrompt/Reveal/Done, Presets, PresetDetail, TranscriptPaste/Analyzing/Results, Settings, HomeDesktop, AdminBuilder

## Status / next steps

- [x] UI design generated → [Claude Design canvas](https://claude.ai/code/artifact/43bd08cf-e20c-4c2c-9901-3eb9deefdff9) (2026-08-20)
- [x] Phase 0: scaffold + bake-off script (2026-08-31)
- [x] TTS decision: **Azure (Free F0)**, native ro-RO voices — details in [[TTS Bake-off]] (2026-08-31)
- [x] Phase 1: auth + capture + translation (2026-08-31)
- [x] Translation moved behind an adapter; default **Gemini free tier** (2026-08-31)
- [ ] Get a free Gemini key → https://aistudio.google.com/apikey → `GEMINI_API_KEY` in `.env.local`, then `npm run translate:smoke`
- [ ] Generate the 12 starter islands → [[Prompt — Seed 12 Islands]]
- [ ] Implement Phases 2–7 per [[Implementation Plan]] → next: Phase 2 (TTS pipeline + player + PWA)

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
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run bakeoff` | TTS bake-off (Phase 0) |
| `npm run translate:smoke` | Translate 3 fixed sentences with the configured provider |
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
