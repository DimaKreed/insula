import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import { env } from '@/env';
import * as schema from './schema';

/**
 * Lazy Neon client — created on first use so the app and the Phase 0 scripts
 * can run without DATABASE_URL configured.
 */
let client: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (!client) {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set — add it to .env.local');
    }
    client = drizzle(neon(env.DATABASE_URL), { schema });
  }
  return client;
}
