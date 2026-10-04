import { createHash, randomBytes } from 'node:crypto';

// 32 random bytes = 256 bits (SPEC 6 asks for at least 128), URL-safe, 43 chars.
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

// Tokens are stored hashed. SHA-256 is enough: tokens are random, not guessable passwords.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
