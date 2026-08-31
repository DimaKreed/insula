---
title: Промпт — Claude Code (старт розробки Insula)
date: 2026-08-19
tags: [румунська/додаток, промпт]
---

# Prompt — Claude Code

**How to use:** open a Claude Code session **in this folder** (`c:\Блог\Румунська\app`) and paste the block below. It kicks off Phase 0 only, then stops for your TTS decision. For every later phase, use the short "subsequent sessions" prompt at the bottom. Full plan: [[Implementation Plan]].

````
You are building "Insula" — a mobile-first PWA for learning languages via the "language islands" method (sentence capture → AI translation → TTS listening/shadowing → FSRS active recall → transcript pre-study). Product-ready multi-user app, first pair EN→RO.

FIRST: read `Implementation Plan.md` in this folder in full. It is the source of truth for stack, schema, flows, API surface, and phases. Do not deviate from its locked decisions without asking me.

The approved UI design (16 artboards: all screens + states, light theme, mobile 390px + desktop home) lives at https://claude.ai/code/artifact/43bd08cf-e20c-4c2c-9901-3eb9deefdff9 — fetch it with WebFetch whenever you build UI (Phase 1 onward) and follow it as the visual source of truth.

Locked stack (summary — details in the plan): Next.js 15 App Router + TypeScript strict on Vercel • Neon Postgres + Drizzle • Auth.js v5 (Google + Resend magic link) • Cloudflare R2 for audio • Upstash QStash for background jobs • @anthropic-ai/sdk (claude-sonnet-5 translation, claude-haiku-4-5 lemmatization) • pluggable TtsProvider adapter (ElevenLabs / Google / Azure / OpenAI) • ts-fsrs • Serwist PWA • Tailwind 4 + shadcn/ui • Zustand + TanStack Query (polling only).

## Your task NOW: Phase 0 only. Then STOP.

Phase 0 = repo bootstrap + TTS bake-off. Deliverables:

1. Scaffold: create-next-app in THIS directory (TypeScript strict, Tailwind, src/ dir, App Router), then shadcn/ui init, drizzle-orm + drizzle-kit configured for Neon, zod-validated typed env module (t3-env pattern) covering the env var list from Implementation Plan.md section 10, `.env.example` with every var, `.gitignore` including `bakeoff-output/` and `.env*`.
2. `src/lib/tts/provider.ts` — the TtsProvider interface: `synthesize(input: { text: string; lang: string; voiceId: string }): Promise<{ audio: Buffer; format: 'mp3'; durationMs?: number; charCount: number }>`, a voice catalog type, and a provider registry keyed by `TTS_PROVIDER`. All four adapters implemented: `elevenlabs.ts`, `google.ts`, `azure.ts`, `openai.ts` — each emitting the canonical format (MP3, 44.1kHz, mono, fixed CBR bitrate) where the provider allows requesting it. Adapters must fail with a clear message when their API key env is missing, without breaking providers that ARE configured.
3. `scripts/tts-bakeoff.ts`, run via `npx tsx scripts/tts-bakeoff.ts`:
   - The 3 fixed Romanian test sentences from `TTS Bake-off.md` in this folder
   - For each CONFIGURED provider (skip unconfigured ones gracefully, listing what was skipped), synthesize each sentence with 1–2 sensible Romanian voices (for OpenAI: 2 general voices)
   - Write MP3s to `bakeoff-output/{provider}-{voice}-{n}.mp3`
   - Generate `bakeoff-output/index.html`: a static, self-contained A/B listening page — rows grouped by sentence, one audio element per provider/voice, provider labels TOGGLEABLE (blind mode) so I can judge by ear first
4. CI: GitHub Actions workflow running typecheck + lint on push. Git repo initialized with a sensible first commit.
5. README section (append to the repo README the scaffold creates, do not overwrite the existing vault notes): how to run the bake-off, which env vars each provider needs.

## Working conventions (all phases)

- Verify each phase end-to-end before calling it done: run the app/scripts, show me the output. If something can't be verified without my API keys, stub it, mark it clearly, and tell me exactly which keys to add where.
- Simplicity first: minimum code that solves the problem. No speculative abstractions, no features beyond the current phase.
- Ask before introducing any paid service or dependency not named in Implementation Plan.md.
- TypeScript strict throughout; zod at every external boundary (env, server action inputs, AI structured outputs, job payloads).
- The planning .md notes in this folder (README.md at vault level, Implementation Plan.md, TTS Bake-off.md, Prompt — *.md) must never be modified or deleted by scaffolding.

When Phase 0 is verified (bake-off page generated with at least one working provider), STOP and tell me to run the listening test. Do not start Phase 1 — the TTS decision gates it.
````

## Subsequent sessions

After the bake-off decision is recorded in [[TTS Bake-off]], each new session starts with:

````
Continue building Insula. Read `Implementation Plan.md` for the plan and current phase table, check git log / the codebase for what's already done, then implement the next phase (Phase N — <name>). Same working conventions as before: verify end-to-end, simplicity first, ask before paid services, never touch the planning .md notes. The chosen TTS provider is recorded in `TTS Bake-off.md`. For any UI work, fetch and follow the approved design: https://claude.ai/code/artifact/43bd08cf-e20c-4c2c-9901-3eb9deefdff9
````
