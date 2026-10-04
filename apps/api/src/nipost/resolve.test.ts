import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NipostError } from './client.js';
import { resolvePin } from './resolve.js';
import { clientWith, fakeFetch, sampleBody } from './test-helpers.js';

const OPTS = { reverseRadiusM: 50, farDistanceM: 30 };
const IKEJA = { lat: 6.6018, lng: 3.3515 };
const YABA = { lat: 6.5095, lng: 3.3711 };
const SEA = { lat: 6.2, lng: 3.3 };

const nearby = (name: string) => ({ status: 200, body: sampleBody(name) });

describe('resolvePin rules', () => {
  it('high confidence and close: postcode accepted, no nearby call', async () => {
    const f = fakeFetch({ status: 200, body: sampleBody('reverse-lagos-ikeja-default') });
    const r = await resolvePin(clientWith(f), IKEJA, OPTS);
    assert.equal(r.outcome, 'found');
    assert.equal(r.postcode, 'LA-11-A12-GN-01');
    assert.equal(r.confidence, 'high');
    assert.equal(r.needs_confirmation, false);
    assert.equal(f.urls.length, 1);
  });

  it('area-only counts as no postcode and offers nearby', async () => {
    const f = fakeFetch({ status: 200, body: sampleBody('reverse-lagos-yaba-default') }, nearby('nearby-lagos-yaba-default'));
    const r = await resolvePin(clientWith(f), YABA, OPTS);
    assert.equal(r.outcome, 'area_only');
    assert.equal(r.postcode, null);
    assert.equal(r.needs_confirmation, true);
    assert.equal(r.nearby.length, 10);
  });

  it('medium confidence needs confirmation', async () => {
    const f = fakeFetch({ status: 200, body: sampleBody('reverse-lagos-yaba-50m') }, nearby('nearby-lagos-yaba-default'));
    const r = await resolvePin(clientWith(f), YABA, OPTS);
    assert.equal(r.outcome, 'found');
    assert.equal(r.confidence, 'medium');
    assert.equal(r.needs_confirmation, true);
    assert.ok(r.nearby.length > 0);
  });

  it('high confidence but far needs confirmation', async () => {
    const f = fakeFetch(
      { status: 200, body: sampleBody('reverse-lagos-ikeja-default') },
      nearby('nearby-lagos-ikeja-default'),
    );
    const r = await resolvePin(clientWith(f), IKEJA, { ...OPTS, farDistanceM: 5 }); // Ikeja unit is 9.2 m away
    assert.equal(r.confidence, 'high');
    assert.equal(r.needs_confirmation, true);
  });

  it('not found offers nearby (empty at sea)', async () => {
    const f = fakeFetch({ status: 200, body: sampleBody('reverse-atlantic-not-found-default') }, nearby('nearby-atlantic-not-found-default'));
    const r = await resolvePin(clientWith(f), SEA, OPTS);
    assert.equal(r.outcome, 'not_found');
    assert.equal(r.postcode, null);
    assert.deepEqual(r.nearby, []);
  });

  it('our lat/lng is echoed back as the source of truth', async () => {
    const f = fakeFetch({ status: 200, body: sampleBody('reverse-lagos-ikeja-default') });
    const r = await resolvePin(clientWith(f), IKEJA, OPTS);
    assert.equal(r.lat, IKEJA.lat);
    assert.equal(r.lng, IKEJA.lng);
  });

  it('NIPOST down: unavailable, never blocks the customer', async () => {
    const f = fakeFetch('timeout', 'timeout');
    const r = await resolvePin(clientWith(f), IKEJA, OPTS);
    assert.equal(r.outcome, 'unavailable');
    assert.equal(r.postcode, null);
    assert.equal(r.needs_confirmation, false);
  });

  it('bad API key is raised as an error, not hidden from us', async () => {
    const f = fakeFetch({ status: 401, body: { error: { code: 'auth_required', message: 'x' } } });
    await assert.rejects(resolvePin(clientWith(f), IKEJA, OPTS), (e: NipostError) => e.kind === 'auth');
  });

  it('nearby failure still returns the reverse result', async () => {
    const f = fakeFetch({ status: 200, body: sampleBody('reverse-lagos-yaba-50m') }, 'network', 'network');
    const r = await resolvePin(clientWith(f), YABA, OPTS);
    assert.equal(r.postcode, 'LA-15-A04-PG-04');
    assert.deepEqual(r.nearby, []);
  });
});
