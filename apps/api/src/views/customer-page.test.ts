import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { customerPageCsp, orderStatusView, renderCodePage, renderCustomerPage, tileOrigin } from './customer-page.js';

const render = (businessName = 'Ada Fabrics') =>
  renderCustomerPage({
    nonce: 'n0nce',
    businessName,
    tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileAttribution: '&copy; OpenStreetMap contributors',
  });

describe('customer page', () => {
  it('inline script compiles', () => {
    const scripts = [...render().matchAll(/<script nonce="n0nce">([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    assert.equal(scripts.length, 1);
    assert.doesNotThrow(() => new Function(scripts[0]!));
  });

  it('escapes the vendor name', () => {
    const html = render('<img src=x onerror=alert(1)>');
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  });

  it('every script tag carries the nonce', () => {
    const tags = render().match(/<script\b[^>]*>/g) ?? [];
    assert.ok(tags.length >= 2);
    for (const tag of tags) assert.match(tag, /nonce="n0nce"/);
  });

  it('code screen shows the code, instruction, and escaped landmark; no scripts', () => {
    const html = renderCodePage({
      nonce: 'n0nce',
      businessName: 'Ada Fabrics',
      status: 'ready',
      code: '0427',
      postcode: 'LA-12-B04-EK-01',
      landmark: '<b>Blue gate</b>',
    });
    // One reel per digit, parked on its digit (so it's right even without JS), read out as "0 4 2 7".
    const reels = [...html.matchAll(/class="reel to-(\d)"/g)].map((m) => m[1]).join('');
    assert.equal(reels, '0427');
    assert.ok(html.includes('aria-label="Your delivery code: 0 4 2 7"'));
    assert.ok(html.includes('Give this code to the rider only when you receive your package.'));
    assert.ok(html.includes('LA 12 B04 EK 01'));
    assert.ok(html.includes('&lt;b&gt;Blue gate&lt;/b&gt;'));
    // Live order screen script compiles, and its status view never includes the code.
    const js = /<script nonce="n0nce">([\s\S]*?)<\/script>/.exec(html)![1]!;
    assert.doesNotThrow(() => new Function(js));
    assert.ok(!js.includes('0427'));
  });

  it('live status view: line, title and step per status', () => {
    assert.deepEqual(orderStatusView('picked_up'), {
      line: 'Your order has been picked up and is on its way.',
      title: 'Order on its way',
      step: 'Step 3 of 4',
    });
    assert.equal(orderStatusView('delivered').step, '');
  });

  it('code screen without a decryptable code says so instead of crashing', () => {
    const html = renderCodePage({ nonce: 'n', businessName: 'X', status: 'ready', code: null, postcode: null, landmark: null });
    assert.ok(html.includes('Ask the seller for your delivery code'));
    assert.ok(!html.includes('class="code-tiles"'));
  });

  it('CSP allows the tile host and keeps connect-src to self', () => {
    const csp = customerPageCsp('abc', 'https://{s}.tile.example.com/{z}/{x}/{y}.png');
    assert.match(csp, /img-src [^;]*https:\/\/\*\.tile\.example\.com/);
    assert.match(csp, /connect-src 'self'/);
    assert.equal(tileOrigin('https://tile.openstreetmap.org/{z}/{x}/{y}.png'), 'https://tile.openstreetmap.org');
  });
});
