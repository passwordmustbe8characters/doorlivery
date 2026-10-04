// Hand-written vendor sessions: random 256-bit token in an httpOnly cookie, SHA-256 hash in Postgres.
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { eq } from 'drizzle-orm';
import { en } from '@doorlivery/shared';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { sessions, vendors } from '../db/schema.js';
import { clearCookie, parseCookies, serializeSessionCookie } from './cookies.js';
import { AppError } from './errors.js';
import { generateToken, hashToken, TOKEN_PATTERN } from './tokens.js';

export const SESSION_COOKIE = 'dl_session';
const HOUR = 3_600_000;
const idleMs = () => config.SESSION_IDLE_HOURS * HOUR;
const absoluteMs = () => config.SESSION_ABSOLUTE_DAYS * 24 * HOUR;
// Only write last_seen_at when it is this stale, to avoid a DB write on every request.
const TOUCH_AFTER_MS = 5 * 60_000;

export interface SessionTimes {
  last_seen_at: Date;
  expires_at: Date;
}

/** Pure check: inside the absolute lifetime and not idle for too long. */
export function isSessionActive(s: SessionTimes, now: Date, idleLimitMs: number): boolean {
  return now < s.expires_at && now.getTime() - s.last_seen_at.getTime() < idleLimitMs;
}

export interface VendorContext {
  id: string;
  email: string;
  business_name: string;
  sessionId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    vendor?: VendorContext;
  }
}

function requireDb() {
  if (!db) throw new AppError('SERVER_ERROR', 'Database not configured');
  return db;
}

export async function startSession(res: Response, vendorId: string): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + absoluteMs());
  await requireDb().insert(sessions).values({ vendor_id: vendorId, token_hash: hashToken(token), expires_at: expiresAt });
  res.append('Set-Cookie', serializeSessionCookie(SESSION_COOKIE, token, { maxAgeSeconds: absoluteMs() / 1000 }));
}

export async function endSession(req: Request, res: Response): Promise<void> {
  if (req.vendor) await requireDb().delete(sessions).where(eq(sessions.id, req.vendor.sessionId));
  res.append('Set-Cookie', clearCookie(SESSION_COOKIE));
}

/** Loads the vendor for the session cookie, or rejects with 401. */
export const requireVendor: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token || !TOKEN_PATTERN.test(token)) throw new AppError('UNAUTHORIZED', en.errors.notLoggedIn);

  const database = requireDb();
  const [row] = await database
    .select({
      sessionId: sessions.id,
      last_seen_at: sessions.last_seen_at,
      expires_at: sessions.expires_at,
      id: vendors.id,
      email: vendors.email,
      business_name: vendors.business_name,
      is_active: vendors.is_active,
    })
    .from(sessions)
    .innerJoin(vendors, eq(sessions.vendor_id, vendors.id))
    .where(eq(sessions.token_hash, hashToken(token)))
    .limit(1);

  const now = new Date();
  if (!row || !row.is_active || !isSessionActive(row, now, idleMs())) {
    if (row) await database.delete(sessions).where(eq(sessions.id, row.sessionId));
    res.append('Set-Cookie', clearCookie(SESSION_COOKIE));
    throw new AppError('UNAUTHORIZED', en.errors.notLoggedIn);
  }

  if (now.getTime() - row.last_seen_at.getTime() > TOUCH_AFTER_MS) {
    await database.update(sessions).set({ last_seen_at: now }).where(eq(sessions.id, row.sessionId));
  }

  req.vendor = { id: row.id, email: row.email, business_name: row.business_name, sessionId: row.sessionId };
  next();
};
