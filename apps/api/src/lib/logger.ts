// Request logging without personal data (SPEC 7): no bodies, no query strings, no IPs, no link tokens.
import type { RequestHandler } from 'express';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** "/c/AbC…xyz/resolve?lat=6.6" -> "/c/:token/resolve". Link tokens are credentials; UUIDs are tidied too. */
export function redactPath(url: string): string {
  const path = url.split('?')[0]!.split('#')[0]!;
  return path.replace(/^\/(c|r)\/[^/]+/, '/$1/:token').replace(UUID, ':id');
}

const QUIET = /^\/(health$|assets\/|favicon)/;

export const requestLogger: RequestHandler = (req, res, next) => {
  if (QUIET.test(req.path)) return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`${req.method} ${redactPath(req.originalUrl)} ${res.statusCode} ${ms.toFixed(0)}ms`);
  });
  next();
};
