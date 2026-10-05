import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errors.js';
import { isLinkExpired } from './link-expiry.js';
import { redactPath } from './logger.js';
import { rateLimit } from './rate-limit.js';
import { securityHeaders } from './security-headers.js';

const DAY = 86_400_000;

describe('log redaction', () => {
  it('hides customer and rider link tokens', () => {
    assert.equal(redactPath('/c/jyzyA8dCptVBVqPNAIToz5cOLtMxsasxCUUJ38ALNVw'), '/c/:token');
    assert.equal(redactPath('/r/jyzyA8dCptVBVqPNAIToz5cOLtMxsasxCUUJ38ALNVw/delivered'), '/r/:token/delivered');
  });
  it('drops query strings (could carry coordinates)', () => {
    assert.equal(redactPath('/api/deliveries?page=2&lat=6.6'), '/api/deliveries');
  });
  it('tidies UUIDs', () => {
    assert.equal(redactPath('/api/deliveries/116f7394-cbeb-4efc-a18d-be388644abda/assign'), '/api/deliveries/:id/assign');
  });
});

describe('link expiry', () => {
  const now = new Date('2026-10-05T12:00:00Z');
  it('open deliveries never expire', () => assert.equal(isLinkExpired(null, now, 7), false));
  it('closed 6 days ago: still works', () => assert.equal(isLinkExpired(new Date(now.getTime() - 6 * DAY), now, 7), false));
  it('closed 8 days ago: expired', () => assert.equal(isLinkExpired(new Date(now.getTime() - 8 * DAY), now, 7), true));
});

describe('rate limit middleware', () => {
  it('lets N through, then 429 with Retry-After', () => {
    const mw = rateLimit(2, 60_000, () => 'k');
    const headers: Record<string, string> = {};
    const res = { set: (k: string, v: string) => (headers[k] = v) } as unknown as Response;
    let passed = 0;
    const next = (() => passed++) as NextFunction;
    mw({} as Request, res, next);
    mw({} as Request, res, next);
    assert.throws(() => mw({} as Request, res, next), (e: AppError) => e.code === 'RATE_LIMITED');
    assert.equal(passed, 2);
    assert.ok(Number(headers['Retry-After']) > 0);
  });
});

describe('security headers', () => {
  const collect = (prod: boolean) => {
    const h: Record<string, string> = {};
    securityHeaders(prod)({} as Request, { set: (o: Record<string, string>) => Object.assign(h, typeof o === 'object' ? o : {}) } as unknown as Response, (() => {}) as NextFunction);
    return h;
  };
  it('never leaks link tokens via Referer', () => assert.equal(collect(false)['Referrer-Policy'], 'no-referrer'));
  it('limits geolocation to our own pages', () => assert.match(collect(false)['Permissions-Policy']!, /geolocation=\(self\)/));
  it('HSTS only in production', () => {
    assert.equal(collect(false)['Strict-Transport-Security'], undefined);
  });
});
