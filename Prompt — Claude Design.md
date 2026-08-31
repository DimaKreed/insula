---
title: Промпт — Claude Design (UI Insula)
date: 2026-08-19
tags: [румунська/додаток, промпт]
---

# Prompt — Claude Design

**How to use:** paste the block below into Claude Design (claude.ai) or run `/design` in a Claude Code session and paste it as the brief. It is self-contained — no other context needed. Full technical background lives in [[Implementation Plan]].

````
Design the complete UI for "Insula" — a mobile-first PWA for learning languages through the "language islands" method. First language pair: English → Romanian.

## What the app does

Users capture sentences from their OWN daily life in English ("I'm making coffee", "This meeting could have been an email"), organized into topical "islands" (Work, Restaurant, Running...). AI translates each sentence into Romanian and generates natural TTS audio. Users then:
1. LISTEN & SHADOW — play island audio on repeat during commutes/workouts, with gap modes for repeating aloud
2. ACTIVE RECALL — daily sessions: see the English sentence, say the Romanian aloud, reveal the answer, self-grade; spaced repetition (FSRS) schedules reviews
3. PRE-INPUT COMPREHENSION — paste a transcript of native content, see "% you already know" and study the unknown words BEFORE watching
Admins curate "preset islands" (starter packs like "Restaurant A1") that users import with one tap.

## Brand direction

- Name: Insula ("island" in Romanian)
- Personality: calm, focused, adult. This is a serious tool for motivated professionals — explicitly ANTI-Duolingo: no mascots, no candy colors, no confetti, no gamification chrome. Progress is shown as honest numbers and streaks of real work, not points.
- Visual motif: islands/ocean — used with restraint (subtle topography/wave textures, island emoji per topic), never cartoonish.
- Palette: deep ocean blues/teals + warm sand accent; generous whitespace; strong typography hierarchy. Design BOTH light and dark themes (dark matters — commute/evening use).
- Feels closer to Linear/Things/Endel than to Duolingo/Babbel.

## Format

Mobile-first: 390px-wide artboards for every screen. Plus ONE desktop (1440px) variant of the Islands Home to show responsive intent. Bottom tab navigation on mobile: Islands, Review, Presets, Transcripts, Settings.

## Screens to design

1. LOGIN — logo + tagline, "Continue with Google", email magic-link field. Minimal.
2. ISLANDS HOME — grid/list of the user's islands (emoji, name, sentence count, ready-audio count); prominent banner "23 reviews due today → Start"; FAB or prominent "+ New island"; per-island quick actions: Play, Download for offline (with downloaded-state indicator).
3. ISLAND DETAIL — island header (name, emoji, stats); capture box at top: multiline "Add sentences — one per line" + hint "tip: use your keyboard's mic to dictate"; sentence list where each row shows: English source, Romanian translation, status chip (translating… / generating audio… / ready / error+retry), play button, overflow menu (edit, suspend, delete). Show the pipeline visibly but calmly.
4. PLAYER — the commute screen. Big, thumb-reachable transport controls (lock-screen simplicity): play/pause, prev/next, current sentence displayed large in Romanian with English beneath; mode switcher: Listen / Loop one / Shadow / Recall; gap-length control for Shadow mode; progress through island; offline indicator. Must be fully usable one-handed without looking.
5. REVIEW SESSION — full-screen card flow: English sentence large + prompt "Say it in Romanian, out loud" → tap to reveal → Romanian answer + audio play button → four grade buttons (Again / Hard / Good / Easy) each showing its projected interval ("10m", "2d", "5d", "12d"). Session progress bar, done-for-today celebration state (calm, not confetti).
6. PRESETS GALLERY — browsable published preset islands with level badges (A1–B2), sentence counts; preset detail/preview: scroll sentences, play sample audio, "Import island" button; imported state badge.
7. TRANSCRIPT WIZARD — step 1: paste text + title; step 2: analyzing state; step 3: results — big "You already know 68% of this" stat, list of unknown words (Romanian, gloss, frequency) with per-item actions "I know this" / checkbox, key sentences with translations, bulk action "Add selected to island →".
8. SETTINGS — profile, voice preference, daily new-cards limit, shadow gap factor, timezone, usage meter (sentences translated / TTS characters this month vs plan limit, progress bars), theme toggle, sign out.
9. ADMIN PRESET BUILDER (desktop-tolerant is fine) — preset list with published/draft states; editor: metadata (name, emoji, level), bulk sentence entry, per-row generated translation + audio status, Publish toggle.

## Key UX constraints

- Thumb-reachable primary actions on mobile; player controls in bottom half of screen
- The capture→translate→audio pipeline is asynchronous — statuses must be glanceable but not noisy
- Offline download is a first-class affordance (commute use), with clear downloaded/not states
- Empty states matter: first-run islands home should teach the method in three lines and point to Presets for instant content
- Review grading must be tappable without precision (large targets, bottom-anchored)
````
