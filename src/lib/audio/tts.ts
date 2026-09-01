import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import {
  findAudioByHash,
  linkPromptAudio,
  linkTargetAudio,
  markTtsQueued,
  saveAudioAsset,
  type AwaitingAudio,
  type AwaitingPromptAudio,
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

/**
 * Which audio a job makes for its sentence: the Romanian the player speaks, or
 * the English hint Listen mode plays in front of it (and Recall will play in
 * Phase 4). One pipeline, one provider, one dedup table — the role only decides
 * which text is spoken, in which voice, and which column the asset lands in.
 */
export type AudioRole = 'target' | 'prompt';

interface SynthesisJob {
  sentenceId: string;
  userId: string;
  role: AudioRole;
  text: string;
  /** The language the text is in — 'ro' for target, 'en' for prompt. */
  lang: string;
}

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
 * The voice a language is synthesized in: the override when set, otherwise the
 * configured provider's first voice for that language. A per-user voice choice
 * arrives with the settings page; until then two env vars are the whole
 * configuration surface — TTS_VOICE for the target language, TTS_VOICE_EN for
 * the English hint, which must not inherit a Romanian override.
 */
export function voiceFor(
  provider: TtsProvider,
  lang: string,
  override: string | undefined = process.env.TTS_VOICE,
): { voiceId: string; lang: string } {
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
    `${provider.name} lists no voice for "${lang}" — set TTS_VOICE (or TTS_VOICE_EN) in .env.local`,
  );
}

/**
 * The `audio_assets.content_hash` a text WOULD get under the current provider,
 * voice and format — without synthesizing anything.
 *
 * Exported so a caller that only needs to FIND an existing recording uses the
 * same recipe the synthesis path uses. Preset audio linking is the one such
 * caller: a second copy of the hash recipe living in the preset code is exactly
 * what would silently stop dedup working the day a voice or format changes.
 */
export function audioHashFor(
  text: string,
  lang: string,
  role: AudioRole = 'target',
): string {
  const provider = getTtsProvider();
  const { voiceId, lang: voiceLang } = voiceFor(
    provider,
    lang,
    role === 'prompt' ? process.env.TTS_VOICE_EN : process.env.TTS_VOICE,
  );
  return audioHash(provider.name, voiceId, voiceLang, text, FORMAT);
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

/** Synthesizes one job. Never throws — a target failure lands on the row. */
async function synthesizeOne(
  job: SynthesisJob,
  user: JobUser,
  provider: TtsProvider,
): Promise<Outcome> {
  const { voiceId, lang } = voiceFor(
    provider,
    job.lang,
    job.role === 'prompt' ? process.env.TTS_VOICE_EN : process.env.TTS_VOICE,
  );
  const hash = audioHash(provider.name, voiceId, lang, job.text, FORMAT);

  // A hint that cannot be made must not mark the sentence broken: its Romanian
  // audio is fine, and Listen simply plays that sentence without a hint.
  const fail = async (message: string): Promise<Outcome> => {
    if (job.role === 'target') await markError(job.sentenceId, message);
    return { sentenceId: job.sentenceId, kind: 'error', chars: 0, message };
  };
  const link = job.role === 'target' ? linkTargetAudio : linkPromptAudio;

  try {
    const cached = await findAudioByHash(hash);
    if (cached) {
      await link(job.sentenceId, cached.id);
      return { sentenceId: job.sentenceId, kind: 'deduped', chars: 0 };
    }

    const chars = job.text.length;
    const period = yearMonth(new Date(), user.timezone);
    const used = await monthlyUsage(user.id, period);
    const quota = checkTtsQuota(
      limitsFor(user.tier, user.role),
      used?.ttsChars ?? 0,
      chars,
    );
    if (!quota.allowed) return fail(quota.message);

    const result = await provider.synthesize({ text: job.text, lang, voiceId });

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

    await link(job.sentenceId, asset.id);
    await recordTtsUsage({
      userId: user.id,
      yearMonth: period,
      provider: provider.name,
      voiceId,
      chars: result.charCount,
      costMicros: Math.round(result.charCount * provider.costMicrosPerChar),
      refId: job.sentenceId,
    });

    return { sentenceId: job.sentenceId, kind: 'synthesized', chars };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TTS failed';
    console.error('[tts]', job.role, 'failed', job.sentenceId, message);
    return fail(message);
  }
}

export interface RunOptions {
  /** Concurrent syntheses. Small by default — free tiers rate-limit. */
  concurrency?: number;
  onOutcome?: (outcome: Outcome, done: number, total: number) => void;
}

/**
 * Synthesizes a list of jobs with a small worker pool. The caller decides where
 * this runs: `after()` on capture, the CLI backfill, or the server action that
 * makes an island's English hints on demand.
 */
async function runJobs(
  jobs: SynthesisJob[],
  options: RunOptions = {},
): Promise<Summary> {
  const summary: Summary = {
    synthesized: 0,
    deduped: 0,
    errors: 0,
    chars: 0,
    outcomes: [],
  };
  if (jobs.length === 0) return summary;

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
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      const outcome = await synthesizeOne(
        job,
        await userFor(job.userId),
        provider,
      );

      done += 1;
      summary.outcomes.push(outcome);
      summary.chars += outcome.chars;
      if (outcome.kind === 'synthesized') summary.synthesized += 1;
      else if (outcome.kind === 'deduped') summary.deduped += 1;
      else summary.errors += 1;

      options.onOutcome?.(outcome, done, jobs.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, worker),
  );
  return summary;
}

/** Romanian audio for sentences that have none — capture and the backfill. */
export function synthesizeSentences(
  items: AwaitingAudio[],
  options: RunOptions = {},
): Promise<Summary> {
  return runJobs(
    items.map((item) => ({
      sentenceId: item.id,
      userId: item.userId,
      role: 'target' as const,
      text: item.targetText,
      lang: item.targetLang,
    })),
    options,
  );
}

/**
 * English hint audio for sentences that have none. Generated lazily rather than
 * at capture: most sentences graduate out of needing a hint before they are
 * ever asked for one, so synthesizing the whole corpus up front would spend
 * TTS characters on audio that never plays.
 */
export function synthesizePromptAudio(
  items: AwaitingPromptAudio[],
  options: RunOptions = {},
): Promise<Summary> {
  return runJobs(
    items.map((item) => ({
      sentenceId: item.id,
      userId: item.userId,
      role: 'prompt' as const,
      text: item.sourceText,
      lang: item.sourceLang,
    })),
    options,
  );
}

/** Marks rows queued so the UI shows "Generating audio…" before work starts. */
export async function queueForAudio(items: AwaitingAudio[]) {
  await markTtsQueued(items.map((i) => i.id));
}
