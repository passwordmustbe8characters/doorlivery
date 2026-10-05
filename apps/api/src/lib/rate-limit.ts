// In-memory fixed-window counter. Fine for one API instance; move to Postgres/Redis if we scale out.
import type { Request, RequestHandler } from 'express';
import { en } from '@doorlivery/shared';
import { AppError } from './errors.js';
import { hashToken } from './tokens.js';

export class FixedWindowLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** True when the key has used up its allowance in the current window. */
  isBlocked(key: string): boolean {
    const entry = this.hits.get(key);
    return !!entry && entry.resetAt > this.now() && entry.count >= this.limit;
  }

  hit(key: string): void {
    const now = this.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 10_000) this.sweep(now);
    } else {
      entry.count++;
    }
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  /** Seconds until the key's window resets (for the Retry-After header). */
  retryAfterSeconds(key: string): number {
    const entry = this.hits.get(key);
    return entry ? Math.max(1, Math.ceil((entry.resetAt - this.now()) / 1000)) : 1;
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}

export const byIp = (req: Request) => req.ip ?? 'unknown';
// Keyed by the token's hash, so raw link tokens are never kept in memory longer than the request.
export const byToken = (req: Request) => `t:${hashToken(String(req.params.token ?? ''))}`;

/** Counts every request; over the limit answers 429 RATE_LIMITED with Retry-After. */
export function rateLimit(limit: number, windowMs: number, key: (req: Request) => string): RequestHandler {
  const limiter = new FixedWindowLimiter(limit, windowMs);
  return (req, res, next) => {
    const k = key(req);
    if (limiter.isBlocked(k)) {
      res.set('Retry-After', String(limiter.retryAfterSeconds(k)));
      throw new AppError('RATE_LIMITED', en.errors.tooManyAttempts);
    }
    limiter.hit(k);
    next();
  };
}
