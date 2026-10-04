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
  NIPOST_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  // 50 m (not the API's 25 m default) so a pin slightly off a building still gets a unit, not area-only.
  NIPOST_REVERSE_RADIUS_M: z.coerce.number().int().min(1).max(250).default(50),
  // A unit farther than this from the pin needs the customer to confirm or pick from nearby.
  NIPOST_FAR_DISTANCE_M: z.coerce.number().positive().default(30),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:4000'),
  // Public OSM tiles have a usage policy; switch provider before launch (SPEC 3).
  MAP_TILE_URL: z.string().default('https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
  MAP_TILE_ATTRIBUTION: z.string().default('&copy; OpenStreetMap contributors'),
  // Vendor sessions: logged out after this long without activity, and always after the absolute limit.
  SESSION_IDLE_HOURS: z.coerce.number().positive().default(72),
  SESSION_ABSOLUTE_DAYS: z.coerce.number().positive().default(30),
  // Keys the delivery-code HMAC and encryption. 32+ random bytes, base64url.
  DELIVERY_CODE_SECRET: z.preprocess(blankToUndefined, z.string().min(32).optional()),
  // Extra origins allowed to make state-changing /api calls (comma-separated). PUBLIC_BASE_URL is always allowed.
  EXTRA_ALLOWED_ORIGINS: z.string().default(''),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // Print only variable names and problems, never values.
  const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  console.error('Invalid environment configuration:\n  ' + problems.join('\n  '));
  process.exit(1);
}

export const config = parsed.data;

// The Vite dev server (http://localhost:5173) proxies /api, so its origin is allowed in development only.
export const allowedOrigins = new Set(
  [
    new URL(config.PUBLIC_BASE_URL).origin,
    ...(config.NODE_ENV === 'development' ? ['http://localhost:5173'] : []),
    ...config.EXTRA_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  ].map((o) => new URL(o).origin),
);
