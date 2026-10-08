import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { en } from '@doorlivery/shared';
import { simplePage, statusBlock } from './customer-page.js';

/** Friendly, branded HTML error page for browsers (customers and riders never see raw JSON). */
export function sendErrorPage(res: Response, status: number): void {
  const t = en.errorPages;
  const [title, body, icon] =
    status === 404
      ? ([t.notFoundTitle, t.notFound, 'mapTrifold'] as const)
      : status === 429
        ? ([t.tooManyTitle, t.tooMany, 'clock'] as const)
        : ([t.serverTitle, t.server, 'warning'] as const);
  const nonce = randomBytes(16).toString('base64');
  res
    .status(status)
    .set('Content-Security-Policy', `default-src 'none'; style-src 'nonce-${nonce}'; font-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'`)
    .set('Cache-Control', 'no-store')
    .type('html')
    .send(simplePage(nonce, title, statusBlock(icon, status === 404 ? 'warn' : 'danger', title, body)));
}
