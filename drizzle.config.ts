import { defineConfig } from 'drizzle-kit';

// drizzle-kit does not load .env files; do it before reading DATABASE_URL.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Absent file is fine — drizzle-kit reports a missing url itself.
  }
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
