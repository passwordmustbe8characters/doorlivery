import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { distanceM, riderPointConfidence } from '../lib/geo.js';
import { mapUrl, renderRiderPage, riderPageCsp, type RiderPageInput } from './rider-page.js';

const base: RiderPageInput = {
  nonce: 'n0nce',
  businessName: 'Ada Fabrics',
  status: 'assigned',
  pickupNote: 'Shop 4, Ikorodu market',
  postcode: 'LA-12-B04-EK-01',
  landmark: 'Blue gate',
  lat: 6.623259,
  lng: 3.498067,
  customerName: 'Chidi',
  customerPhone: '2348031234567',
  codeLocked: false,
};
const render = (over: Partial<RiderPageInput> = {}) => renderRiderPage({ ...base, ...over });
const buttonFor = (html: string, ev: string) => new RegExp(`<button[^>]*data-event="${ev}"[^>]*>`).exec(html)![0];

describe('rider page', () => {
  it('is well under 100 KB and loads nothing external', () => {
    const html = render();
    assert.ok(Buffer.byteLength(html) < 100 * 1024, `${Buffer.byteLength(html)} bytes`);
    assert.ok(!/<(script|link)[^>]+(src|href)="https?:/i.test(html));
    assert.match(riderPageCsp('x'), /default-src 'none'/);
  });

  it('inline script compiles', () => {
    const js = /<script nonce="n0nce">([\s\S]*?)<\/script>/.exec(render())![1]!;
    assert.doesNotThrow(() => new Function(js));
  });

  it('shows the SPEC 8 items in order', () => {
    const html = render();
    const order = ['Shop 4, Ikorodu market', 'LA 12 B04 EK 01', 'Blue gate', 'Open Map', 'Call customer', 'I have picked up', 'I have arrived', "Customer&#39;s 4-digit code", '>Delivered<'];
    let at = 0;
    for (const text of order) {
      const i = html.indexOf(text, at);
      assert.ok(i >= at, `"${text}" missing or out of order`);
      at = i;
    }
  });

  it('Open Map uses the coordinates in lat,lng order; Call uses +234', () => {
    const html = render();
    assert.ok(html.includes('query=6.623259,3.498067'));
    assert.equal(mapUrl(6.5, 3.3), 'https://www.google.com/maps/search/?api=1&query=6.5,3.3');
    assert.ok(html.includes('href="tel:+2348031234567"'));
  });

  it('explains the location request next to Delivered', () => {
    assert.ok(render().includes("we&#39;ll ask for your location to confirm the drop-off"));
  });

  it('buttons follow the status', () => {
    assert.ok(!buttonFor(render(), 'picked_up').includes('disabled'));
    const picked = render({ status: 'picked_up' });
    assert.ok(buttonFor(picked, 'picked_up').includes('disabled'));
    assert.ok(!buttonFor(picked, 'arrived').includes('disabled'));
    const arrived = render({ status: 'arrived' });
    assert.ok(buttonFor(arrived, 'arrived').includes('disabled'));
    assert.ok(!/id="delivered"[^>]*disabled/.test(arrived));
  });

  it('locked: no code box, shows the lock message', () => {
    const html = render({ codeLocked: true });
    assert.ok(!html.includes('id="code"'));
    assert.ok(html.includes('Too many wrong codes'));
  });

  it('escapes vendor-entered text', () => {
    const html = render({ pickupNote: '<img src=x onerror=alert(1)>' });
    assert.ok(!html.includes('<img src=x'));
  });

  it('no customer name (removed by retention): renders without it', () => {
    const html = render({ customerName: null });
    assert.ok(!html.includes('>Customer<'));
    assert.ok(html.includes('LA 12 B04 EK 01'));
  });

  it('no postcode: tells the rider to use the map', () => {
    assert.ok(render({ postcode: null }).includes('No postcode. Use the map.'));
  });
});

describe('rider GPS rules', () => {
  it('distance is about right (Mushin market to hospital ~140 m)', () => {
    const d = distanceM({ lat: 6.534178, lng: 3.350313 }, { lat: 6.53542, lng: 3.350469 });
    assert.ok(d > 130 && d < 150, `${d}`);
  });

  it('confidence from GPS accuracy', () => {
    assert.equal(riderPointConfidence(10), 'high');
    assert.equal(riderPointConfidence(40), 'medium');
    assert.equal(riderPointConfidence(90), 'low');
  });
});
