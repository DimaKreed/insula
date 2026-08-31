import { z } from 'zod';

/**
 * Typed, zod-validated environment (t3-env pattern).
 *
 * Phase 0 note: every variable is optional. Nothing is provisioned yet, and the
 * TTS bake-off must run with only one provider configured. Consumers check for
 * the values they need and fail with a message naming the missing variable —
 * see `src/lib/tts/provider.ts`. As phases land, the variables they depend on
 * become required here.
 */
const schema = z.object({
  // Database (Neon)
  DATABASE_URL: z.url().optional(),

  // Auth.js
  AUTH_SECRET: z.string().min(1).optional(),
  AUTH_GOOGLE_ID: z.string().min(1).optional(),
  AUTH_GOOGLE_SECRET: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),

  // AI
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  // TTS
  TTS_PROVIDER: z.enum(['elevenlabs', 'google', 'azure', 'openai']).optional(),
  ELEVENLABS_API_KEY: z.string().min(1).optional(),
  GOOGLE_TTS_CREDENTIALS: z.string().min(1).optional(),
  AZURE_SPEECH_KEY: z.string().min(1).optional(),
  AZURE_SPEECH_REGION: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),

  // Object storage (Cloudflare R2)
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET: z.string().min(1).optional(),
  R2_PUBLIC_URL: z.url().optional(),

  // Background jobs (Upstash QStash)
  QSTASH_TOKEN: z.string().min(1).optional(),
  QSTASH_CURRENT_SIGNING_KEY: z.string().min(1).optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().min(1).optional(),

  // Rate limiting (Phase 7)
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

  // App
  NEXT_PUBLIC_APP_URL: z.url().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid environment variables:\n${issues}`);
}

export const env = parsed.data;
export type Env = typeof env;
