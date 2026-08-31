import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import {
  findAudioByHash,
  linkTargetAudio,
  markTtsQueued,
  saveAudioAsset,
  type AwaitingAudio,
} from '@/db/queries/audio';
import { monthlyUsage, recordTtsUsage } from '@/db/queries/usage';
import { sentences, users } from '@/db/schema';
import { audioHash } from '@/lib/hash';
import { checkTtsQuota, limitsFor, yearMonth } from '@/lib/quota';
import { audioKey, getStorage } from '@/lib/storage';
import { getTtsProvider, type TtsProvider } from '@/lib/tts';

import { mp3DurationMs } from './mp3';

/**
 * Text to audio — the one implementation both callers share: the `after()` job
 * that runs on capture, and `npm run audio:backfill`. Deliberately free of any
 * `next/server` import so a plain tsx script can call it.
 *
 * Idempotent at two levels (Implementation Plan section 4.1):
 *   1. only sentences with no `target_audio_id` are ever handed in;
 *   2. the audio content hash is looked up in `audio_assets` before any call to
 *      the provider, and the UNIQUE constraint on that hash is the backstop if
 *      two runs race.
 */

/** What every adapter emits, and part of the audio hash. */
const FORMAT = 'mp3';

export type OutcomeKind = 'synthesized' | 'deduped' | 'error';

export interface Outcome {
  sentenceId: string;
  kind: OutcomeKind;
  /** Characters actually sent to the provider — 0 for dedup hits and failures. */
  chars: number;
  message?: string;
}

export interface Summary {
  synthesized: number;
  deduped: number;
  errors: number;
  chars: number;
  outcomes: Outcome[];
}

interface JobUser {
  id: string;
  role: string;
  tier: string;
  timezone: string;
}

/**
 * The voice a language is synthesized in: TTS_VOICE when set, otherwise the
 * configured provider's first voice for that language. A per-user voice choice
 * arrives with the settings page; until then one env var is the whole
 * configuration surface.
 */
export function voiceFor(
  provider: TtsProvider,
  lang: string,
): { voiceId: string; lang: string } {
  const override = process.env.TTS_VOICE;
  const voices = provider.voices();
  const match = override
    ? voices.find((v) => v.id === override)
    : voices.find((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase()));

  if (match) return { voiceId: match.id, lang: match.lang };
  if (override) {
    // An id the adapter does not list is still worth trying — provider
    // catalogues change faster than this code does.
    return { voiceId: override, lang };
  }
  throw new Error(
    `${provider.name} lists no voice for "${lang}" — set TTS_VOICE in .env.local`,
  );
}

async function loadUser(userId: string): Promise<JobUser> {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      role: users.role,
      tier: users.tier,
      timezone: users.timezone,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!rows[0]) throw new Error(`user ${userId} not found`);
  return rows[0];
}

async function markError(sentenceId: string, message: string) {
  const db = getDb();
  await db
    .update(sentences)
    .set({
      status: 'error',
      errorMessage: message.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(sentences.id, sentenceId));
}

/** Synthesizes one sentence. Never throws — failures land on the row. */
async function synthesizeOne(
  item: AwaitingAudio,
  user: JobUser,
  provider: TtsProvider,
): Promise<Outcome> {
  const { voiceId, lang } = voiceFor(provider, item.targetLang);
  const hash = audioHash(provider.name, voiceId, lang, item.targetText, FORMAT);

  try {
    const cached = await findAudioByHash(hash);
    if (cached) {
      await linkTargetAudio(item.id, cached.id);
      return { sentenceId: item.id, kind: 'deduped', chars: 0 };
    }

    const chars = item.targetText.length;
    const period = yearMonth(new Date(), user.timezone);
    const used = await monthlyUsage(user.id, period);
    const quota = checkTtsQuota(
      limitsFor(user.tier, user.role),
      used?.ttsChars ?? 0,
      chars,
    );
    if (!quota.allowed) {
      await markError(item.id, quota.message);
      return {
        sentenceId: item.id,
        kind: 'error',
        chars: 0,
        message: quota.message,
      };
    }

    const result = await provider.synthesize({
      text: item.targetText,
      lang,
      voiceId,
    });

    const key = audioKey(hash);
    const { url } = await getStorage().put({
      key,
      body: result.audio,
      contentType: 'audio/mpeg',
    });

    const asset = await saveAudioAsset({
      contentHash: hash,
      provider: provider.name,
      voiceId,
      lang,
      storageKey: key,
      url,
      durationMs: result.durationMs ?? mp3DurationMs(result.audio),
      charCount: result.charCount,
      byteSize: result.audio.byteLength,
    });

    await linkTargetAudio(item.id, asset.id);
    await recordTtsUsage({
      userId: user.id,
      yearMonth: period,
      provider: provider.name,
      voiceId,
      chars: result.charCount,
      costMicros: Math.round(result.charCount * provider.costMicrosPerChar),
      refId: item.id,
    });

    return { sentenceId: item.id, kind: 'synthesized', chars };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TTS failed';
    console.error('[tts] sentence failed', item.id, message);
    await markError(item.id, message);
    return { sentenceId: item.id, kind: 'error', chars: 0, message };
  }
}

export interface RunOptions {
  /** Concurrent syntheses. Small by default — free tiers rate-limit. */
  concurrency?: number;
  onOutcome?: (outcome: Outcome, done: number, total: number) => void;
}

/**
 * Synthesizes a list of sentences with a small worker pool. The caller decides
 * where this runs: `after()` on capture, or the CLI backfill.
 */
export async function synthesizeSentences(
  items: AwaitingAudio[],
  options: RunOptions = {},
): Promise<Summary> {
  const summary: Summary = {
    synthesized: 0,
    deduped: 0,
    errors: 0,
    chars: 0,
    outcomes: [],
  };
  if (items.length === 0) return summary;

  const provider = getTtsProvider();
  const config = provider.isConfigured();
  if (!config.ok) {
    throw new Error(
      `TTS provider "${provider.name}" is not configured — set ${config.missing.join(', ')} in .env.local`,
    );
  }

  const users = new Map<string, Promise<JobUser>>();
  const userFor = (userId: string) => {
    let pending = users.get(userId);
    if (!pending) {
      pending = loadUser(userId);
      users.set(userId, pending);
    }
    return pending;
  };

  let cursor = 0;
  let done = 0;
  const concurrency = Math.max(1, options.concurrency ?? 3);

  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor++];
      const outcome = await synthesizeOne(
        item,
        await userFor(item.userId),
        provider,
      );

      done += 1;
      summary.outcomes.push(outcome);
      summary.chars += outcome.chars;
      if (outcome.kind === 'synthesized') summary.synthesized += 1;
      else if (outcome.kind === 'deduped') summary.deduped += 1;
      else summary.errors += 1;

      options.onOutcome?.(outcome, done, items.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return summary;
}

/** Marks rows queued so the UI shows "Generating audio…" before work starts. */
export async function queueForAudio(items: AwaitingAudio[]) {
  await markTtsQueued(items.map((i) => i.id));
}
