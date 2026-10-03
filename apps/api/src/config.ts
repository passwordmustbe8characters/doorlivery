import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// .env lives at the repo root. On Render, env vars come from the dashboard instead.
const envPath = resolve(import.meta.dirname, '../../../.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

const blankToUndefined = (v: unknown) => (v === '' ? undefined : v);

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.preprocess(blankToUndefined, z.string().url().optional()),
  NIPOST_API_BASE_URL: z.string().url().default('https://api.postcode.gov.ng'),
  NIPOST_API_KEY: z.preprocess(blankToUndefined, z.string().optional()),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // Print only variable names and problems, never values.
  const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  console.error('Invalid environment configuration:\n  ' + problems.join('\n  '));
  process.exit(1);
}

export const config = parsed.data;
