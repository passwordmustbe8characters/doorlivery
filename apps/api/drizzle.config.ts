import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit bundles this file as CommonJS (no import.meta); npm runs it from apps/api.
const envPath = resolve(process.cwd(), '../../.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
