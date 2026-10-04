import { hash, verify } from '@node-rs/argon2';

// argon2id with the library defaults (m=19 MiB, t=2, p=1), which match OWASP's minimum recommendation.
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200; // caps hashing cost per request

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false; // malformed hash (e.g. the seed vendor's "!seed-no-login")
  }
}

// Verified against when the email is unknown, so wrong-email and wrong-password take the same time.
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hash('doorlivery-timing-equaliser');
  return dummyHash;
}
