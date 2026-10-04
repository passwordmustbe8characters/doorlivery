// Test helpers: real NIPOST bodies from docs/nipost-samples/ and a fake fetch.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createNipostClient } from './client.js';

const SAMPLES = resolve(import.meta.dirname, '../../../../docs/nipost-samples');

/** The saved response body (what NIPOST actually sent) for a sample file. */
export function sampleBody(name: string): unknown {
  return JSON.parse(readFileSync(resolve(SAMPLES, `${name}.json`), 'utf8')).body;
}

type Reply = { status: number; body?: unknown } | 'timeout' | 'network';

/** Fake fetch that answers each call with the next reply and records the URLs it was asked for. */
export function fakeFetch(...replies: Reply[]) {
  const urls: string[] = [];
  const headers: Headers[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    urls.push(String(input));
    headers.push(new Headers(init?.headers));
    const reply = replies.shift();
    if (!reply) throw new Error('fakeFetch: no reply left');
    if (reply === 'timeout') throw new DOMException('The operation timed out.', 'TimeoutError');
    if (reply === 'network') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fn, urls, headers };
}

export function clientWith(f: ReturnType<typeof fakeFetch>) {
  return createNipostClient({ baseUrl: 'https://nipost.test', apiKey: 'test-key', timeoutMs: 1000, fetch: f.fn });
}
