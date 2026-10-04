import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NipostError } from './client.js';
import { checkChosenPostcode } from './resolve.js';
import { clientWith, fakeFetch, sampleBody } from './test-helpers.js';

const OPTS = { reverseRadiusM: 50 };
const IKEJA = { lat: 6.6018, lng: 3.3515 };
const ok = (name: string) => ({ status: 200, body: sampleBody(name) });

describe('checkChosenPostcode (confirm)', () => {
  it("keeps NIPOST's own match with its confidence", async () => {
    const f = fakeFetch(ok('reverse-lagos-ikeja-default'));
    const r = await checkChosenPostcode(clientWith(f), IKEJA, 'LA-11-A12-GN-01', OPTS);
    assert.deepEqual(r, { ok: true, postcode: 'LA-11-A12-GN-01', confidence: 'high' });
    assert.equal(f.urls.length, 1);
  });

  it('accepts a nearby pick, marked low confidence', async () => {
    const f = fakeFetch(ok('reverse-lagos-ikeja-default'), ok('nearby-lagos-ikeja-default'));
    const r = await checkChosenPostcode(clientWith(f), IKEJA, 'LA-11-A12-GN-14', OPTS);
    assert.deepEqual(r, { ok: true, postcode: 'LA-11-A12-GN-14', confidence: 'low' });
  });

  it('rejects a postcode NIPOST did not offer for this spot', async () => {
    const f = fakeFetch(ok('reverse-lagos-ikeja-default'), ok('nearby-lagos-ikeja-default'));
    const r = await checkChosenPostcode(clientWith(f), IKEJA, 'FC-02-D65-BY-02', OPTS);
    assert.deepEqual(r, { ok: false, reason: 'not_offered' });
  });

  it('no postcode chosen: accepted without calling NIPOST', async () => {
    const f = fakeFetch();
    assert.deepEqual(await checkChosenPostcode(clientWith(f), IKEJA, null, OPTS), { ok: true, postcode: null, confidence: null });
    assert.equal(f.urls.length, 0);
  });

  it('NIPOST down: pin accepted, postcode pending (null)', async () => {
    const f = fakeFetch('timeout', 'timeout');
    assert.deepEqual(await checkChosenPostcode(clientWith(f), IKEJA, 'LA-11-A12-GN-01', OPTS), { ok: true, postcode: null, confidence: null });
  });

  it('no NIPOST key configured: postcode pending', async () => {
    assert.deepEqual(await checkChosenPostcode(null, IKEJA, 'LA-11-A12-GN-01', OPTS), { ok: true, postcode: null, confidence: null });
  });

  it('bad API key is raised, not hidden', async () => {
    const f = fakeFetch({ status: 401, body: { error: { code: 'auth_required', message: 'x' } } });
    await assert.rejects(checkChosenPostcode(clientWith(f), IKEJA, 'LA-11-A12-GN-01', OPTS), (e: NipostError) => e.kind === 'auth');
  });
});
