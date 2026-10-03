import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../config.js';
import * as schema from './schema.js';

export const pool = config.DATABASE_URL
  ? new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 })
  : null;

export const db = pool ? drizzle(pool, { schema }) : null;

export async function checkDb(): Promise<'ok' | 'down' | 'not_configured'> {
  if (!pool) return 'not_configured';
  try {
    await pool.query('select 1');
    return 'ok';
  } catch {
    return 'down';
  }
}
