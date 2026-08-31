import { createId } from '@paralleldrive/cuid2';
import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type { AdapterAccountType } from 'next-auth/adapters';

/** cuid2 primary keys, generated in the app (Implementation Plan section 3). */
const id = () => text('id').primaryKey().$defaultFn(() => createId());

/**
 * Drizzle schema — Phases 1–2 slice of Implementation Plan section 3: Auth.js
 * tables, islands, sentences, the global translation cache, audio assets and
 * usage accounting. SRS, presets and transcripts arrive with their phases.
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
    origin: text('origin').notNull().default('user'), // user|preset_import|transcript
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

/** Global across users — identical source text is never translated twice. */
export const translationCache = pgTable('translation_cache', {
  contentHash: text('content_hash').primaryKey(),
  targetText: text('target_text').notNull(),
  translationNote: text('translation_note'),
  lemmas: jsonb('lemmas').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: createdAt(),
});

// --- Usage accounting ------------------------------------------------------

export const usageEvents = pgTable(
  'usage_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // translation|tts|transcript_p1|transcript_p2
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
}));

export type AudioAsset = typeof audioAssets.$inferSelect;
export type Island = typeof islands.$inferSelect;
export type Sentence = typeof sentences.$inferSelect;
export type User = typeof users.$inferSelect;
