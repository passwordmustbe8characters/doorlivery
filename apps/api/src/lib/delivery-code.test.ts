import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Tests must not depend on the developer's .env secret.
process.env.DELIVERY_CODE_SECRET ||= 'test-secret-test-secret-test-secret-123';
const { CODE_PATTERN, decryptCode, encryptCode, generateCode, hashCode, verifyCode } = await import('./delivery-code.js');

const D1 = '11111111-1111-4111-8111-111111111111';
const D2 = '22222222-2222-4222-8222-222222222222';

describe('delivery codes', () => {
  it('are 4 digits, including leading zeros', () => {
    for (let i = 0; i < 500; i++) assert.match(generateCode(), CODE_PATTERN);
  });

  it('verify against the HMAC; wrong code and wrong delivery fail', () => {
    const h = hashCode(D1, '0427');
    assert.equal(verifyCode(D1, '0427', h), true);
    assert.equal(verifyCode(D1, '0428', h), false);
    assert.equal(verifyCode(D2, '0427', h), false);
    assert.equal(verifyCode(D1, '427', h), false);
  });

  it('the same code on two deliveries has different hashes', () => {
    assert.notEqual(hashCode(D1, '1234'), hashCode(D2, '1234'));
  });

  it('stored hash is not a plain SHA-256 of the code (needs the secret)', async () => {
    const { createHash } = await import('node:crypto');
    assert.notEqual(hashCode(D1, '1234'), createHash('sha256').update(`${D1}:1234`).digest('hex'));
  });

  it('encrypts and decrypts; ciphertext differs each time', () => {
    const a = encryptCode(D1, '0427');
    const b = encryptCode(D1, '0427');
    assert.notEqual(a, b);
    assert.ok(!a.includes('0427'));
    assert.equal(decryptCode(D1, a), '0427');
  });

  it('decrypt fails for another delivery or a tampered blob', () => {
    const blob = encryptCode(D1, '0427');
    assert.equal(decryptCode(D2, blob), null);
    const [iv, tag, ct] = blob.split('.');
    assert.equal(decryptCode(D1, [iv, tag, ct!.slice(0, -2) + (ct!.endsWith('A') ? 'B' : 'A') + ct!.slice(-1)].join('.')), null);
    assert.equal(decryptCode(D1, 'garbage'), null);
  });
});
