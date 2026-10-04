// Minimal cookie helpers (no cookie-parser dependency).

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (!name || name in out) continue; // first one wins, like browsers send most-specific first
    try {
      out[name] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // ignore undecodable values
    }
  }
  return out;
}

export interface CookieOptions {
  maxAgeSeconds: number;
}

// Always HttpOnly, Secure, SameSite=Lax, Path=/. Browsers accept Secure cookies on http://localhost.
export function serializeSessionCookie(name: string, value: string, { maxAgeSeconds }: CookieOptions): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(maxAgeSeconds)}`;
}

export function clearCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
