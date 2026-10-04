/**
 * Invite-only vendor accounts (SPEC 2). There is no signup route; run this instead.
 *
 *   npm run vendor:create                     create a vendor
 *   npm run vendor:create -- --reset-password change an existing vendor's password (logs them out everywhere)
 *
 * The password is typed at a hidden prompt. It is never accepted from arguments or env vars, and never printed.
 */
import { eq } from 'drizzle-orm';
import { formatNigerianPhone, normalizeNigerianPhone } from '@doorlivery/shared';
import { db, pool } from '../apps/api/src/db/client.js';
import { sessions, vendors } from '../apps/api/src/db/schema.js';
import { hashPassword, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../apps/api/src/lib/password.js';

const stdin = process.stdin;
const out = process.stdout;

/** Reads one line from the terminal. With hidden=true, typed characters are not echoed. */
function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolvePrompt) => {
    out.write(question);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\u0003') {
          // Ctrl+C
          out.write('\n');
          process.exit(130);
        } else if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          out.write('\n');
          resolvePrompt(value);
          return;
        } else if (ch === '\u0008' || ch === '\u007f') {
          // Backspace
          if (value.length > 0) {
            value = value.slice(0, -1);
            if (!hidden) out.write('\b \b');
          }
        } else if (ch >= ' ') {
          value += ch;
          if (!hidden) out.write(ch);
        }
      }
    };
    stdin.on('data', onData);
  });
}

async function promptNewPassword(): Promise<string> {
  for (;;) {
    const pw = await prompt(`Password (min ${MIN_PASSWORD_LENGTH} characters, hidden): `, true);
    if (pw.length < MIN_PASSWORD_LENGTH || pw.length > MAX_PASSWORD_LENGTH) {
      console.log(`Must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters. Try again.`);
      continue;
    }
    const again = await prompt('Repeat password: ', true);
    if (again !== pw) {
      console.log('Passwords did not match. Try again.');
      continue;
    }
    return pw;
  }
}

async function promptEmail(): Promise<string> {
  for (;;) {
    const email = (await prompt('Vendor email: ')).trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320) return email;
    console.log('That does not look like an email address. Try again.');
  }
}

async function main() {
  if (!stdin.isTTY) {
    console.error('Run this in an interactive terminal. Passwords cannot be piped in.');
    process.exit(1);
  }
  if (!db || !pool) {
    console.error('DATABASE_URL is empty. Add it to .env first.');
    process.exit(1);
  }

  const reset = process.argv.includes('--reset-password');
  const email = await promptEmail();
  const [existing] = await db.select({ id: vendors.id, business_name: vendors.business_name }).from(vendors).where(eq(vendors.email, email)).limit(1);

  if (reset) {
    if (!existing) {
      console.error('No vendor with that email.');
      process.exit(1);
    }
    const password = await promptNewPassword();
    await db.update(vendors).set({ password_hash: await hashPassword(password) }).where(eq(vendors.id, existing.id));
    await db.delete(sessions).where(eq(sessions.vendor_id, existing.id));
    console.log(`Password updated for ${existing.business_name}. All their sessions were logged out.`);
    return;
  }

  if (existing) {
    console.error('A vendor with that email already exists. Use --reset-password to change their password.');
    process.exit(1);
  }

  let businessName = '';
  while (!businessName) {
    businessName = (await prompt('Business name: ')).trim().slice(0, 200);
  }

  let phone: string | null = null;
  for (;;) {
    const raw = (await prompt('Business WhatsApp number (optional, Enter to skip): ')).trim();
    if (!raw) break;
    phone = normalizeNigerianPhone(raw);
    if (phone) break;
    console.log('Enter a Nigerian mobile number, e.g. 0803 123 4567.');
  }

  const password = await promptNewPassword();
  await db.insert(vendors).values({
    email,
    business_name: businessName,
    phone,
    password_hash: await hashPassword(password),
  });
  console.log(`Vendor created: ${businessName} <${email}>${phone ? `, ${formatNigerianPhone(phone)}` : ''}.`);
  console.log('They can now log in to the vendor app.');
}

main()
  .catch((err) => {
    console.error('Failed:', err instanceof Error ? err.message : 'unknown error');
    process.exitCode = 1;
  })
  .finally(() => pool?.end());
