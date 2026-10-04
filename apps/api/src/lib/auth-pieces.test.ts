import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { en, formatNigerianPhone, normalizeNigerianPhone, whatsappUrl } from '@doorlivery/shared';
import { clearCookie, parseCookies, serializeSessionCookie } from './cookies.js';
import { AppError } from './errors.js';
import { requireSameOrigin } from './origin.js';
import { getDummyHash, hashPassword, verifyPassword } from './password.js';
import { FixedWindowLimiter } from './rate-limit.js';
import { isSessionActive } from './session.js';
import { generateToken, hashToken, TOKEN_PATTERN } from './tokens.js';

describe('tokens', () => {
  it('are 256-bit, URL-safe, and hashed deterministically', () => {
    const a = generateToken();
    assert.match(a, TOKEN_PATTERN);
    assert.equal(Buffer.from(a, 'base64url').length, 32);
    assert.notEqual(a, generateToken());
    assert.equal(hashToken(a), hashToken(a));
    assert.notEqual(hashToken(a), a);
  });
});

describe('session cookie', () => {
  it('is HttpOnly, Secure, SameSite=Lax, Path=/', () => {
    const c = serializeSessionCookie('dl_session', 'abc', { maxAgeSeconds: 60 });
    for (const part of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=60']) assert.ok(c.includes(part), part);
    assert.match(clearCookie('dl_session'), /Max-Age=0/);
  });

  it('parses the Cookie header', () => {
    assert.deepEqual(parseCookies('a=1; dl_session=xyz; b=%20two'), { a: '1', dl_session: 'xyz', b: ' two' });
    assert.deepEqual(parseCookies(undefined), {});
  });
});

describe('session expiry', () => {
  const HOUR = 3_600_000;
  const now = new Date('2026-10-04T12:00:00Z');
  const s = (lastSeenHoursAgo: number, expiresInHours: number) => ({
    last_seen_at: new Date(now.getTime() - lastSeenHoursAgo * HOUR),
    expires_at: new Date(now.getTime() + expiresInHours * HOUR),
  });

  it('active when recently used and before absolute expiry', () => assert.equal(isSessionActive(s(1, 10), now, 72 * HOUR), true));
  it('idle expiry', () => assert.equal(isSessionActive(s(73, 100), now, 72 * HOUR), false));
  it('absolute expiry even if just used', () => assert.equal(isSessionActive(s(0, -1), now, 72 * HOUR), false));
});

describe('login rate limiter', () => {
  it('blocks after the limit and frees up after the window', () => {
    let clock = 0;
    const l = new FixedWindowLimiter(3, 1000, () => clock);
    for (let i = 0; i < 3; i++) {
      assert.equal(l.isBlocked('k'), false);
      l.hit('k');
    }
    assert.equal(l.isBlocked('k'), true);
    assert.equal(l.isBlocked('other'), false);
    clock = 1001;
    assert.equal(l.isBlocked('k'), false);
  });

  it('reset clears a key', () => {
    const l = new FixedWindowLimiter(1, 1000);
    l.hit('k');
    assert.equal(l.isBlocked('k'), true);
    l.reset('k');
    assert.equal(l.isBlocked('k'), false);
  });
});

describe('Origin check', () => {
  const mw = requireSameOrigin(new Set(['https://app.example']));
  const run = (method: string, headers: Record<string, string>) => {
    const req = { method, get: (h: string) => headers[h.toLowerCase()] } as unknown as Request;
    let passed = false;
    try {
      mw(req, {} as Response, (() => (passed = true)) as NextFunction);
    } catch (e) {
      assert.ok(e instanceof AppError && e.code === 'FORBIDDEN');
    }
    return passed;
  };

  it('allows same-origin POST', () => assert.equal(run('POST', { origin: 'https://app.example' }), true));
  it('blocks cross-origin POST', () => assert.equal(run('POST', { origin: 'https://evil.example' }), false));
  it('blocks POST with no Origin or Referer', () => assert.equal(run('POST', {}), false));
  it('falls back to Referer', () => assert.equal(run('POST', { referer: 'https://app.example/deliveries/1' }), true));
  it('lets GET through', () => assert.equal(run('GET', { origin: 'https://evil.example' }), true));
});

describe('passwords', () => {
  it('argon2id round trip; wrong password and malformed hash fail', async () => {
    const h = await hashPassword('correct horse battery');
    assert.match(h, /^\$argon2id\$/);
    assert.equal(await verifyPassword(h, 'correct horse battery'), true);
    assert.equal(await verifyPassword(h, 'wrong'), false);
    assert.equal(await verifyPassword('!seed-no-login', 'anything'), false);
    assert.equal(await verifyPassword(await getDummyHash(), 'anything'), false);
  });
});

describe('Nigerian phone numbers', () => {
  for (const input of ['08031234567', '0803 123 4567', '+234 803 123 4567', '2348031234567', '8031234567', '0703-123-4567', '09031234567']) {
    it(`accepts ${input}`, () => assert.match(normalizeNigerianPhone(input) ?? '', /^234[789]\d{9}$/));
  }
  for (const input of ['', '0803123456', '080312345678', '01234567890', '+44 7700 900123', 'abc', '0803123456a']) {
    it(`rejects "${input}"`, () => assert.equal(normalizeNigerianPhone(input), null));
  }
  it('formats for display', () => assert.equal(formatNigerianPhone('2348031234567'), '+234 803 123 4567'));
});

describe('WhatsApp messages (SPEC 9)', () => {
  it('builds a wa.me link with the encoded customer message', () => {
    const text = en.messages.customer({ customer_name: 'Ada', business_name: 'Ada & Co', link: 'https://x.test/c/abc' });
    assert.equal(text, 'Hello Ada, Ada & Co is sending your order. Please confirm where to deliver it here: https://x.test/c/abc');
    const url = new URL(whatsappUrl('2348031234567', text));
    assert.equal(url.origin + url.pathname, 'https://wa.me/2348031234567');
    assert.equal(url.searchParams.get('text'), text);
  });
});
