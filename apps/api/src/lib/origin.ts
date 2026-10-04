// CSRF defence for cookie-authenticated routes: state-changing requests must come from our own origin.
import type { RequestHandler } from 'express';
import { en } from '@doorlivery/shared';
import { AppError } from './errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function requireSameOrigin(allowed: ReadonlySet<string>): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    // Browsers send Origin on every cross-site and same-site POST; Referer is a fallback for old ones.
    const origin = originOf(req.get('origin')) ?? originOf(req.get('referer'));
    if (!origin || !allowed.has(origin)) throw new AppError('FORBIDDEN', en.errors.badOrigin);
    next();
  };
}
