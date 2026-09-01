import { createId } from '@paralleldrive/cuid2';
import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type { AdapterAccountType } from 'next-auth/adapters';
import type { ReviewLog } from 'ts-fsrs';

/** cuid2 primary keys, generated in the app (Implementation Plan section 3). */
const id = () => text('id').primaryKey().$defaultFn(() => createId());

/**
 * Drizzle schema — Phases 1–5 slice of Implementation Plan section 3: Auth.js
 * tables, islands, sentences, the global translation cache, audio assets, usage
 * accounting, the SRS tables and the preset tables. Transcripts arrive with
 * Phase 6.
 */

const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow();

// --- Auth.js (Drizzle adapter shape) ---------------------------------------

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { withTimezone: true, mode: 'date' }),
  name: text('name'),
  image: text('image'),
  role: text('role').notNull().default('user'), // 'user' | 'admin'
  tier: text('tier').notNull().default('free'), // 'free' | 'pro'
  timezone: text('timezone').notNull().default('UTC'),
  settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`),
  createdAt: createdAt(),
});

export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true, mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// --- Content ---------------------------------------------------------------

export const islands = pgTable(
  'islands',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    emoji: text('emoji'),
    description: text('description'),
    sourceLang: text('source_lang').notNull().default('en'),
    targetLang: text('target_lang').notNull().default('ro'),
    /** Set when the island came from a preset import, so a re-import is visible. */
    importedFromPresetId: text('imported_from_preset_id'),
    /**
     * How the island's content came to exist: captured by hand, imported from a
     * preset, or generated from a topic. Read by the UI, which nudges a
     * generated island toward "now add your own sentences".
     */
    origin: text('origin').notNull().default('user'), // user|preset_import|generated
    position: integer('position').notNull().default(0),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('islands_user_idx').on(t.userId)],
);

/**
 * Global across users — identical text in the same voice is synthesized once.
 * `content_hash` is the storage key too, so the object store dedups with it.
 */
export const audioAssets = pgTable('audio_assets', {
  id: id(),
  contentHash: text('content_hash').notNull().unique(),
  provider: text('provider').notNull(),
  voiceId: text('voice_id').notNull(),
  lang: text('lang').notNull(),
  /** Where the object lives inside the storage provider, e.g. 'audio/<hash>.mp3'. */
  storageKey: text('storage_key').notNull(),
  /** Public URL to play from; relative ('/audio/x.mp3') for the local provider. */
  url: text('url').notNull(),
  durationMs: integer('duration_ms'),
  charCount: integer('char_count').notNull(),
  byteSize: integer('byte_size').notNull(),
  createdAt: createdAt(),
});

export const SENTENCE_STATUSES = [
  'pending',
  'translating',
  'translated',
  'tts_queued',
  'ready',
  'error',
] as const;
export type SentenceStatus = (typeof SENTENCE_STATUSES)[number];

export const sentences = pgTable(
  'sentences',
  {
    id: id(),
    islandId: text('island_id')
      .notNull()
      .references(() => islands.id, { onDelete: 'cascade' }),
    // Denormalized for user isolation and the future due-card query.
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceText: text('source_text').notNull(),
    targetText: text('target_text'),
    sourceLang: text('source_lang').notNull().default('en'),
    targetLang: text('target_lang').notNull().default('ro'),
    translationNote: text('translation_note'),
    status: text('status').$type<SentenceStatus>().notNull().default('pending'),
    errorMessage: text('error_message'),
    contentHash: text('content_hash').notNull(),
    /** Romanian audio. Set once TTS has run; the shared asset may predate this row. */
    targetAudioId: text('target_audio_id').references(() => audioAssets.id, {
      onDelete: 'set null',
    }),
    /** English prompt audio, generated lazily for Recall mode (Phase 4). */
    promptAudioId: text('prompt_audio_id').references(() => audioAssets.id, {
      onDelete: 'set null',
    }),
    origin: text('origin').notNull().default('user'), // user|preset_import|transcript|generated
    /** Which preset row this was cloned from, for presets the user re-imports. */
    presetSentenceId: text('preset_sentence_id'),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('sentences_user_idx').on(t.userId),
    index('sentences_island_position_idx').on(t.islandId, t.position),
    index('sentences_content_hash_idx').on(t.contentHash),
  ],
);

// --- Presets (Phase 5) -----------------------------------------------------

/**
 * A curated or generated island shared across users. Content lives here once;
 * an import clones the rows into the importer's account and REUSES the same
 * `audio_assets` ids, so an import costs nothing in TTS (Implementation Plan
 * section 4.4).
 *
 * Not owned by a user the way `islands` is: `created_by` records who built it,
 * but every published preset is visible to everyone, so no query here carries a
 * user_id predicate.
 */
export const presetIslands = pgTable(
  'preset_islands',
  {
    id: id(),
    name: text('name').notNull(),
    emoji: text('emoji'),
    description: text('description'),
    level: text('level'), // A1..B2
    sourceLang: text('source_lang').notNull().default('en'),
    targetLang: text('target_lang').notNull().default('ro'),
    position: integer('position').notNull().default(0),
    published: boolean('published').notNull().default(false),
    /** 'seed' | 'generated' — how the content was produced, for the admin list. */
    origin: text('origin').notNull().default('seed'),
    /** ISLAND_PROMPT_VERSION at generation time; null for seed-file presets. */
    promptVersion: text('prompt_version'),
    createdBy: text('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('preset_islands_published_idx').on(t.published, t.position)],
);

/**
 * Preset content, already translated. `audio_asset_id` is the shared recording
 * an import links to rather than re-synthesizing; it is null until the preset's
 * TTS pass has run.
 */
export const presetSentences = pgTable(
  'preset_sentences',
  {
    id: id(),
    presetIslandId: text('preset_island_id')
      .notNull()
      .references(() => presetIslands.id, { onDelete: 'cascade' }),
    sourceText: text('source_text').notNull(),
    targetText: text('target_text').notNull(),
    translationNote: text('translation_note'),
    lemmas: jsonb('lemmas').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    audioAssetId: text('audio_asset_id').references(() => audioAssets.id, {
      onDelete: 'set null',
    }),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    index('preset_sentences_island_position_idx').on(
      t.presetIslandId,
      t.position,
    ),
  ],
);

/** One row per user per preset — the primary key is what prevents a double import. */
export const presetImports = pgTable(
  'preset_imports',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    presetIslandId: text('preset_island_id')
      .notNull()
      .references(() => presetIslands.id, { onDelete: 'cascade' }),
    /** The island the clone landed in. Nulled if the user deletes that island. */
    islandId: text('island_id').references(() => islands.id, {
      onDelete: 'set null',
    }),
    importedAt: timestamp('imported_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.presetIslandId] })],
);

/** Global across users — identical source text is never translated twice. */
export const translationCache = pgTable('translation_cache', {
  contentHash: text('content_hash').primaryKey(),
  targetText: text('target_text').notNull(),
  translationNote: text('translation_note'),
  lemmas: jsonb('lemmas').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: createdAt(),
});

// --- SRS -------------------------------------------------------------------

/**
 * One row per sentence, holding a ts-fsrs `Card` verbatim: every field of the
 * library's own type has a column, so a card round-trips through Postgres
 * without a translation layer that could drift from the algorithm. `extra`
 * catches any field a future ts-fsrs adds — the state survives the upgrade even
 * before a migration gives it a column of its own.
 */
export const reviewStates = pgTable(
  'review_states',
  {
    sentenceId: text('sentence_id')
      .primaryKey()
      .references(() => sentences.id, { onDelete: 'cascade' }),
    // Denormalized like sentences.user_id: the due query never joins to find it.
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    due: timestamp('due', { withTimezone: true, mode: 'date' }).notNull(),
    stability: real('stability').notNull(),
    difficulty: real('difficulty').notNull(),
    /** Deprecated in ts-fsrs 6, still part of the Card in 5.x. */
    elapsedDays: integer('elapsed_days').notNull().default(0),
    scheduledDays: integer('scheduled_days').notNull().default(0),
    /** Position in the (re)learning steps ladder — a ts-fsrs 5 Card field. */
    learningSteps: integer('learning_steps').notNull().default(0),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    /** 0 New, 1 Learning, 2 Review, 3 Relearning — the ts-fsrs `State` enum. */
    state: smallint('state').notNull().default(0),
    lastReview: timestamp('last_review', { withTimezone: true, mode: 'date' }),
    extra: jsonb('extra')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    suspended: boolean('suspended').notNull().default(false),
  },
  (t) => [index('review_states_user_due_idx').on(t.userId, t.due)],
);

/** A ts-fsrs `ReviewLog` after the trip through JSON — Dates become ISO strings. */
export type SerializedReviewLog = Omit<ReviewLog, 'due' | 'review'> & {
  due: string;
  review: string;
};

/**
 * Every grade ever given, with the full ts-fsrs `ReviewLog` kept verbatim.
 * Nothing in the app reads `fsrs_log` back; it exists so a future per-user FSRS
 * optimizer run has the complete history to fit against (section 8's risk log).
 */
export const reviewLogs = pgTable(
  'review_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sentenceId: text('sentence_id')
      .notNull()
      .references(() => sentences.id, { onDelete: 'cascade' }),
    /** 1 again .. 4 easy — the ts-fsrs `Rating` enum, minus Manual. */
    rating: smallint('rating').notNull(),
    fsrsLog: jsonb('fsrs_log').$type<SerializedReviewLog>().notNull(),
    /** Prompt to grade, measured on the client. */
    durationMs: integer('duration_ms'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('review_logs_user_reviewed_idx').on(t.userId, t.reviewedAt)],
);

// --- Usage accounting ------------------------------------------------------

export const usageEvents = pgTable(
  'usage_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // translation|tts|island_generation|transcript_p1|transcript_p2
    provider: text('provider'),
    model: text('model'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    ttsChars: integer('tts_chars').notNull().default(0),
    costMicros: bigint('cost_micros', { mode: 'number' }).notNull().default(0),
    refId: text('ref_id'),
    createdAt: createdAt(),
  },
  (t) => [index('usage_events_user_idx').on(t.userId, t.createdAt)],
);

/**
 * Briefs that were refused for not being a language-learning request at all.
 *
 * The enforcement state is NOT stored: no strike counter, no `blocked_until`.
 * `generationBlock` in `src/lib/quota.ts` derives the penalty from these rows,
 * so the offence that causes a block is also the row that dates it and there is
 * nothing to keep in sync — the same reasoning that has the daily new-card count
 * read out of `review_logs`.
 *
 * The brief is kept because it is the only way to tune the classifier and the
 * only evidence behind a block a user might dispute.
 */
export const generationOffences = pgTable(
  'generation_offences',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    brief: text('brief').notNull(),
    /** The refusal the model gave, as shown to the user. */
    reason: text('reason').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('generation_offences_user_idx').on(t.userId, t.createdAt)],
);

/** Rollup that quota checks read; bumped alongside usage_events. */
export const usageMonthly = pgTable(
  'usage_monthly',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    yearMonth: text('year_month').notNull(), // '2026-08'
    sentencesTranslated: integer('sentences_translated').notNull().default(0),
    ttsChars: integer('tts_chars').notNull().default(0),
    transcriptAnalyses: integer('transcript_analyses').notNull().default(0),
    /**
     * Islands generated from a topic. Counted separately from sentences because
     * generation creates 20 sentences from nothing, which is far cheaper to
     * abuse than typing them — and every one of those 20 becomes TTS characters
     * downstream, which is what actually costs money.
     */
    islandsGenerated: integer('islands_generated').notNull().default(0),
    aiInputTokens: bigint('ai_input_tokens', { mode: 'number' })
      .notNull()
      .default(0),
    aiOutputTokens: bigint('ai_output_tokens', { mode: 'number' })
      .notNull()
      .default(0),
    costMicros: bigint('cost_micros', { mode: 'number' }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.yearMonth] })],
);

// --- Relations (used by Drizzle's relational queries) ----------------------

export const islandsRelations = relations(islands, ({ many }) => ({
  sentences: many(sentences),
}));

export const sentencesRelations = relations(sentences, ({ one }) => ({
  island: one(islands, {
    fields: [sentences.islandId],
    references: [islands.id],
  }),
  targetAudio: one(audioAssets, {
    fields: [sentences.targetAudioId],
    references: [audioAssets.id],
  }),
  reviewState: one(reviewStates, {
    fields: [sentences.id],
    references: [reviewStates.sentenceId],
  }),
}));

export const presetIslandsRelations = relations(presetIslands, ({ many }) => ({
  sentences: many(presetSentences),
}));

export const presetSentencesRelations = relations(presetSentences, ({ one }) => ({
  presetIsland: one(presetIslands, {
    fields: [presetSentences.presetIslandId],
    references: [presetIslands.id],
  }),
  audio: one(audioAssets, {
    fields: [presetSentences.audioAssetId],
    references: [audioAssets.id],
  }),
}));

export type AudioAsset = typeof audioAssets.$inferSelect;
export type Island = typeof islands.$inferSelect;
export type PresetIsland = typeof presetIslands.$inferSelect;
export type PresetSentence = typeof presetSentences.$inferSelect;
export type ReviewLogRow = typeof reviewLogs.$inferSelect;
export type ReviewState = typeof reviewStates.$inferSelect;
export type Sentence = typeof sentences.$inferSelect;
export type User = typeof users.$inferSelect;
