import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fromNipostCoordinate, isSamePoint, NipostError } from './client.js';
import { clientWith, fakeFetch, sampleBody } from './test-helpers.js';

// Access Bank, Ikorodu. Swapping lat and lng would put this point in the ocean off Gabon.
const ACCESS_BANK = { lat: 6.623259, lng: 3.498067 };

describe('[lng, lat] coordinate order', () => {
  it('unpacks NIPOST [lng, lat] into { lat, lng }', () => {
    assert.deepEqual(fromNipostCoordinate([3.498067, 6.623259]), ACCESS_BANK);
  });

  it('reads the real Access Bank sample as lat 6.62, lng 3.49', () => {
    const body = sampleBody('reverse-access-bank-ikorodu-default') as { data: { coordinate: [number, number] } };
    assert.deepEqual(fromNipostCoordinate(body.data.coordinate), ACCESS_BANK);
  });

  it('sends lat and lng in the right query params', async () => {
    const f = fakeFetch({ status: 200, body: sampleBody('reverse-access-bank-ikorodu-default') });
    await clientWith(f).reverse(ACCESS_BANK, 50);
    const q = new URL(f.urls[0]!).searchParams;
    assert.equal(q.get('lat'), '6.623259');
    assert.equal(q.get('lng'), '3.498067');
    assert.equal(q.get('max_distance_m'), '50');
  });

  it('rejects an answer for a swapped point', async () => {
    const body = sampleBody('reverse-access-bank-ikorodu-default') as { data: { coordinate: [number, number] } };
    body.data.coordinate = [6.623259, 3.498067]; // [lat, lng]: the wrong order
    const f = fakeFetch({ status: 200, body });
    await assert.rejects(clientWith(f).reverse(ACCESS_BANK, 50), (e: NipostError) => e.kind === 'bad_response');
  });

  it('isSamePoint is false when lat and lng are swapped', () => {
    assert.equal(isSamePoint(ACCESS_BANK, { lat: ACCESS_BANK.lng, lng: ACCESS_BANK.lat }), false);
    assert.equal(isSamePoint(ACCESS_BANK, { ...ACCESS_BANK }), true);
  });
});

describe('NIPOST client', () => {
  it('sends the API key header', async () => {
    const f = fakeFetch({ status: 200, body: sampleBody('nearby-lagos-ikeja-default') });
    await clientWith(f).nearby({ lat: 6.6018, lng: 3.3515 });
    assert.equal(f.headers[0]!.get('x-api-key'), 'test-key');
  });

  it('parses real nearby results', async () => {
    const f = fakeFetch({ status: 200, body: sampleBody('nearby-lagos-ikeja-default') });
    const items = await clientWith(f).nearby({ lat: 6.6018, lng: 3.3515 });
    assert.equal(items.length, 10);
    assert.equal(items[0]!.postcode, 'LA-11-A12-GN-01');
  });

  it('retries once after a 5xx, then succeeds', async () => {
    const f = fakeFetch({ status: 503 }, { status: 200, body: sampleBody('nearby-lagos-ikeja-default') });
    await clientWith(f).nearby({ lat: 6.6018, lng: 3.3515 });
    assert.equal(f.urls.length, 2);
  });

  it('retries once after a timeout, then gives up', async () => {
    const f = fakeFetch('timeout', 'timeout');
    await assert.rejects(clientWith(f).nearby({ lat: 6.6018, lng: 3.3515 }), (e: NipostError) => e.kind === 'timeout');
    assert.equal(f.urls.length, 2);
  });

  for (const [status, kind] of [
    [401, 'auth'],
    [402, 'no_credits'],
    [429, 'rate_limited'],
  ] as const) {
    it(`does not retry ${status} (${kind})`, async () => {
      const f = fakeFetch({ status, body: { error: { code: 'x', message: 'x' } } });
      await assert.rejects(clientWith(f).nearby({ lat: 6.6018, lng: 3.3515 }), (e: NipostError) => e.kind === kind);
      assert.equal(f.urls.length, 1);
    });
  }

  it('flags a changed response shape', async () => {
    const f = fakeFetch({ status: 200, body: { found: true } }); // missing the data wrapper
    await assert.rejects(clientWith(f).reverse(ACCESS_BANK, 50), (e: NipostError) => e.kind === 'bad_response');
  });
});
