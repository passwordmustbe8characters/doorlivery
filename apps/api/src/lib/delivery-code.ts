// 4-digit delivery codes (SPEC 5, 6).
// A plain hash of 4 digits is cracked instantly, so the stored hash is an HMAC keyed by a server secret.
// An AES-256-GCM copy lets the customer page show the code again; it is bound to the delivery id.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export const CODE_PATTERN = /^\d{4}$/;

let keys: { hmac: Buffer; enc: Buffer } | null = null;
function getKeys() {
  if (!keys) {
    const secret = config.DELIVERY_CODE_SECRET;
    if (!secret) throw new Error('DELIVERY_CODE_SECRET is not set');
    const derive = (info: string) => Buffer.from(hkdfSync('sha256', secret, 'doorlivery', info, 32));
    keys = { hmac: derive('delivery-code-hmac'), enc: derive('delivery-code-enc') };
  }
  return keys;
}

export function generateCode(): string {
  return randomInt(0, 10_000).toString().padStart(4, '0');
}

/** Bound to the delivery, so the same code on two deliveries has different hashes. */
export function hashCode(deliveryId: string, code: string): string {
  return createHmac('sha256', getKeys().hmac).update(`${deliveryId}:${code}`).digest('hex');
}

export function verifyCode(deliveryId: string, code: string, storedHash: string): boolean {
  if (!CODE_PATTERN.test(code)) return false;
  const a = Buffer.from(hashCode(deliveryId, code), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function encryptCode(deliveryId: string, code: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKeys().enc, iv);
  cipher.setAAD(Buffer.from(deliveryId));
  const ct = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.');
}

/** Null if the blob was tampered with, belongs to another delivery, or the secret changed. */
export function decryptCode(deliveryId: string, blob: string): string | null {
  try {
    const [iv, tag, ct] = blob.split('.').map((p) => Buffer.from(p, 'base64url'));
    if (!iv || !tag || !ct) return null;
    const decipher = createDecipheriv('aes-256-gcm', getKeys().enc, iv);
    decipher.setAAD(Buffer.from(deliveryId));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
