import type { RequestHandler } from 'express';

// Baseline headers for every response. Page-specific CSPs are set by each page.
export function securityHeaders(production: boolean): RequestHandler {
  return (_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      // Customer and rider URLs contain link tokens: never send them to other sites (map tiles, CDNs).
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      // Location only for our own pages (customer pin, rider Delivered); nothing else.
      'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(), payment=()',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    if (production) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}
