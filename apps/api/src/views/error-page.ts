import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { en } from '@doorlivery/shared';
import { escapeHtml, simplePage } from './customer-page.js';

/** Friendly HTML error page for browsers (customers and riders never see raw JSON). */
export function sendErrorPage(res: Response, status: number): void {
  const t = en.errorPages;
  const [title, body] = status === 404 ? [t.notFoundTitle, t.notFound] : status === 429 ? [t.tooManyTitle, t.tooMany] : [t.serverTitle, t.server];
  const nonce = randomBytes(16).toString('base64');
  res
    .status(status)
    .set('Content-Security-Policy', `default-src 'none'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`)
    .set('Cache-Control', 'no-store')
    .type('html')
    .send(simplePage(nonce, title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p>`));
}
