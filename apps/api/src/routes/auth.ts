// Vendor auth (SPEC 6). Invite-only: there is no signup route; vendors are created with scripts/create-vendor.ts.
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { en } from '@doorlivery/shared';
import { db } from '../db/client.js';
import { vendors } from '../db/schema.js';
import { AppError } from '../lib/errors.js';
import { getDummyHash, MAX_PASSWORD_LENGTH, verifyPassword } from '../lib/password.js';
import { FixedWindowLimiter } from '../lib/rate-limit.js';
import { endSession, requireVendor, startSession } from '../lib/session.js';

const WINDOW_MS = 15 * 60_000;
// Every attempt from one IP, and failed attempts against one email, each within 15 minutes.
export const loginLimiterByIp = new FixedWindowLimiter(20, WINDOW_MS);
export const loginFailuresByEmail = new FixedWindowLimiter(5, WINDOW_MS);

const LoginBody = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

// Build the dummy hash at startup, so the first unknown-email login isn't slower than the rest.
void getDummyHash();

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const ipKey = req.ip ?? 'unknown';
  if (loginLimiterByIp.isBlocked(ipKey)) throw new AppError('RATE_LIMITED', en.errors.tooManyAttempts);
  loginLimiterByIp.hit(ipKey);

  const parsed = LoginBody.safeParse(req.body);
  // A malformed email gets the same answer as a wrong one.
  if (!parsed.success) throw new AppError('UNAUTHORIZED', en.errors.badLogin);
  const { email, password } = parsed.data;

  if (loginFailuresByEmail.isBlocked(email)) throw new AppError('RATE_LIMITED', en.errors.tooManyAttempts);
  if (!db) throw new AppError('SERVER_ERROR', 'Database not configured');

  const [vendor] = await db
    .select({ id: vendors.id, password_hash: vendors.password_hash, is_active: vendors.is_active })
    .from(vendors)
    .where(eq(vendors.email, email))
    .limit(1);

  // Always run one argon2 verify, so unknown emails take as long as wrong passwords.
  const ok = await verifyPassword(vendor?.password_hash ?? (await getDummyHash()), password);
  if (!vendor || !vendor.is_active || !ok) {
    loginFailuresByEmail.hit(email);
    throw new AppError('UNAUTHORIZED', en.errors.badLogin);
  }

  loginFailuresByEmail.reset(email);
  await startSession(res, vendor.id);
  res.status(204).end();
});

authRouter.post('/logout', requireVendor, async (req, res) => {
  await endSession(req, res);
  res.status(204).end();
});

// Lets the vendor app know who is logged in (and whether anyone is).
authRouter.get('/me', requireVendor, (req, res) => {
  const v = req.vendor!;
  res.json({ id: v.id, email: v.email, business_name: v.business_name });
});
