---
title: TTS Bake-off — вибір голосу для румунської
date: 2026-08-19
tags: [румунська/додаток, рішення]
---

# TTS Bake-off — choosing the Romanian voice

The app's audio quality lives or dies on the TTS voice, and TTS is the main recurring API cost. Code stays **provider-agnostic** (a `TtsProvider` adapter, provider set by the `TTS_PROVIDER` env var), so this decision is reversible — but the default matters because all audio gets generated with it.

## Candidates

| Provider | Romanian voices | Price (approx) | Free tier | Notes |
|---|---|---|---|---|
| **ElevenLabs** | Multilingual model + community RO voices (Robert Mihai, Anyella, Jora Slobod…) | ~$0.10+/1k chars (≈10× others) | 10k chars/month | Consistently rated most natural; priciest at product scale |
| **Google Cloud TTS** | Dedicated `ro-RO` WaveNet/Neural2 voices | ~$16/1M chars | 1M WaveNet chars/month | Best cost/quality ratio for a product |
| **Azure Speech** | `ro-RO-AlinaNeural`, `ro-RO-EmilNeural` | ~$16/1M chars | 500k chars/month | Comparable to Google |
| **OpenAI TTS** | Multilingual voices, no dedicated ro-RO voice | ~$15/1M chars | none | Simple API; Romanian accent quality uncertain |

## Listen before deciding (no signup needed)

- [ElevenLabs Romanian TTS](https://elevenlabs.io/text-to-speech/romanian) — type any Romanian text, hear it
- [Fliki Romanian voice library](https://fliki.ai/voices/romanian) — samples from several providers side by side
- [SpeechGen Romanian](https://speechgen.io/en/tts-romanian/) — includes Google/Azure ro-RO voices

## The bake-off script (Phase 0)

`scripts/tts-bakeoff.ts` (run locally with `tsx`) implements all four adapters against free tiers and synthesizes the **same 3 fixed sentences** with 1–2 voices per provider into `bakeoff-output/`, plus a static `index.html` page for blind A/B listening.

Test sentences (chosen to stress ă/î/â/ș/ț, question intonation, and everyday register):

1. `Bună dimineața! Aș vrea o cafea cu lapte și un croissant, vă rog.`
2. `Îmi pare rău, nu înțeleg. Puteți să vorbiți puțin mai rar?`
3. `Astăzi lucrez de acasă, iar seara merg la alergat în parc.`

## Evaluation criteria

- **Naturalness** — does it sound like a person or a robot? (most important — you'll hear these voices hundreds of times)
- **Pronunciation accuracy** — ă/î/â/ș/ț, stress placement, question intonation
- **Speaking pace** — natural full speed (the method requires real speed, not slowed-down beginner audio)
- **Price** — weighted by product-scale usage; quotas in [[Implementation Plan]] get tuned to the winner

## Decision

- **Provider:** `azure` (Azure AI Speech, tier **Free F0** — 500k neural chars/month, hard-capped: over quota it returns 403, never bills; paid only via explicit upgrade to S0)
- **Voice ID:** default **`ro-RO-AlinaNeural`** (жін., обрано на слух 2026-08-31); `ro-RO-EmilNeural` (чол.) — альтернатива в налаштуваннях
- **Date:** 2026-08-31
- **Why:** Native Romanian voices at effectively zero cost on the free tier; quality confirmed by ear in the bake-off. ElevenLabs' best Romanian voices (Bogdan, Daniel Mihai — library) require a paid plan (від $5/міс) via API; its free-tier API voices are generic multilingual. The `TtsProvider` adapter keeps a switch to ElevenLabs a one-line env change if quality ever warrants the cost.

Bake-off run: 2026-08-31, 12 clips (ElevenLabs Matilda/Daniel multilingual + Azure Alina/Emil), `bakeoff-output/index.html`.
