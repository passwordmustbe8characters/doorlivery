/**
 * Calls the three NIPOST endpoints with sample inputs and saves the raw responses
 * to docs/nipost-samples/ so we can build types from real data (SPEC section 4).
 *
 * Run: npm run probe:nipost
 * Needs NIPOST_API_KEY in the repo-root .env. The key is never printed or saved.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envPath = resolve(root, '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

const BASE_URL = (process.env.NIPOST_API_BASE_URL || 'https://api.postcode.gov.ng').replace(/\/$/, '');
const API_KEY = process.env.NIPOST_API_KEY;
const OUT_DIR = resolve(root, 'docs/nipost-samples');
const TIMEOUT_MS = 10_000;

if (!API_KEY) {
  console.error('NIPOST_API_KEY is empty. Add it to .env at the repo root, then run again.');
  process.exit(1);
}

// Test points live in scripts/probe-points.json. Entries with null lat/lng are placeholders and are skipped.
interface ProbePoint {
  label: string;
  lat: number | null;
  lng: number | null;
  area_type: string;
}
const ALL_POINTS = JSON.parse(readFileSync(resolve(import.meta.dirname, 'probe-points.json'), 'utf8')) as ProbePoint[];
const POINTS = ALL_POINTS.filter(
  (p): p is ProbePoint & { lat: number; lng: number } => typeof p.lat === 'number' && typeof p.lng === 'number',
);
const SKIPPED = ALL_POINTS.filter((p) => !POINTS.includes(p as never)).map((p) => p.label);

// Reverse geocode runs twice per point: API default (no param) and 50 m.
const REVERSE_RADII: (number | null)[] = [null, 50];

// Guard: no saved sample may contain this text (key prefix).
const FORBIDDEN_TEXT = 'nipost_';

// Fallback codes for lookup; real codes found by reverse geocode are added at runtime.
// 100001/900001 are old 6-digit style; the API uses the new SS-NN-XNN-XX-NN format.
const FALLBACK_CODES = ['100001', '900001', '999999', 'LA-11-A12-GN-99'];

// Headers worth keeping (rate limits, credits, request ids). Never auth headers.
const KEEP_HEADER = /^(content-type|date|x-ratelimit-.*|ratelimit.*|retry-after|x-request-id|x-credits.*|x-.*-remaining)$/i;

interface Saved {
  request: { method: 'GET'; path: string };
  status: number | null;
  duration_ms: number;
  headers: Record<string, string>;
  body: unknown;
  error?: string;
  probed_at: string;
}

async function call(path: string): Promise<Saved> {
  const started = Date.now();
  const saved: Saved = {
    request: { method: 'GET', path },
    status: null,
    duration_ms: 0,
    headers: {},
    body: null,
    probed_at: new Date().toISOString(),
  };
  try {
    const res = await fetch(BASE_URL + path, {
      headers: { 'X-API-Key': API_KEY!, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    saved.status = res.status;
    res.headers.forEach((value, key) => {
      if (KEEP_HEADER.test(key)) saved.headers[key] = value;
    });
    const text = await res.text();
    try {
      saved.body = JSON.parse(text);
    } catch {
      saved.body = text;
    }
  } catch (err) {
    saved.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  }
  saved.duration_ms = Date.now() - started;
  return saved;
}

function save(name: string, data: Saved) {
  // Strip the key from anything the API might echo back before it touches disk.
  const json = JSON.stringify(data, null, 2).split(API_KEY!).join('[REDACTED]');
  writeFileSync(resolve(OUT_DIR, `${name}.json`), json + '\n');
  const outcome = data.error ?? `HTTP ${data.status}`;
  console.log(`  ${name.padEnd(48)} ${outcome} (${data.duration_ms} ms)`);
}

// File-safe name from a free-text label, e.g. "Mimi's Place, Ikorodu" -> "mimis-place-ikorodu".
const slug = (label: string) =>
  label.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function findPostcode(body: unknown): string | undefined {
  const b = (body as { data?: { found?: boolean; unit?: { postcode?: unknown } } } | null)?.data;
  return b?.found && typeof b.unit?.postcode === 'string' ? b.unit.postcode : undefined;
}

interface SummaryRow {
  point: string;
  radius: string;
  status: string;
  found: string;
  depth: string;
  confidence: string;
  distance_m: string;
}

function summarise(point: string, radius: number | null, r: Saved): SummaryRow {
  const b = (
    r.body as { data?: { found?: boolean; depth?: unknown; unit?: { confidence?: unknown; distance_m?: unknown } } } | null
  )?.data;
  return {
    point,
    radius: radius === null ? 'default' : `${radius} m`,
    status: r.error ? 'error' : String(r.status),
    found: typeof b?.found === 'boolean' ? String(b.found) : '-',
    depth: typeof b?.depth === 'string' ? b.depth : '-',
    confidence: typeof b?.unit?.confidence === 'string' ? b.unit.confidence : '-',
    distance_m: typeof b?.unit?.distance_m === 'number' ? b.unit.distance_m.toFixed(1) : '-',
  };
}

function printTable(rows: SummaryRow[]) {
  const cols = Object.keys(rows[0] ?? {}) as (keyof SummaryRow)[];
  const width = (c: keyof SummaryRow) => Math.max(c.length, ...rows.map((r) => r[c].length));
  const line = (cells: Record<string, string>) => cols.map((c) => cells[c]!.padEnd(width(c))).join('  ');
  console.log(line(Object.fromEntries(cols.map((c) => [c, c]))));
  console.log(cols.map((c) => '-'.repeat(width(c))).join('  '));
  rows.forEach((r) => console.log(line(r as unknown as Record<string, string>)));
}

// Fails loudly if any saved sample contains the forbidden text.
function assertNoKeyLeak() {
  const leaks = readdirSync(OUT_DIR)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => readFileSync(resolve(OUT_DIR, f), 'utf8').toLowerCase().includes(FORBIDDEN_TEXT));
  if (leaks.length) {
    console.error(`\n!!! KEY LEAK GUARD FAILED: "${FORBIDDEN_TEXT}" found in:\n  ${leaks.join('\n  ')}`);
    console.error('!!! Delete these files before committing.');
    process.exit(2);
  }
  console.log(`\nKey leak guard: no "${FORBIDDEN_TEXT}" in docs/nipost-samples/. OK`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Probing ${BASE_URL}\nSaving to docs/nipost-samples/\n`);

  if (SKIPPED.length) console.log(`Skipping placeholder points (no lat/lng): ${SKIPPED.join(', ')}\n`);

  const foundCodes = new Set<string>();
  const rows: SummaryRow[] = [];

  console.log('Reverse geocode:');
  for (const p of POINTS) {
    for (const radius of REVERSE_RADII) {
      const radiusParam = radius === null ? '' : `&max_distance_m=${radius}`;
      const r = await call(`/v1/search/reverse?lat=${p.lat}&lng=${p.lng}${radiusParam}`);
      save(`reverse-${slug(p.label)}-${radius === null ? 'default' : `${radius}m`}`, r);
      rows.push(summarise(p.label, radius, r));
      const code = findPostcode(r.body);
      if (code) foundCodes.add(code);
    }
  }

  console.log('\nNearby (default radius):');
  for (const p of POINTS) {
    save(`nearby-${slug(p.label)}-default`, await call(`/v1/search/nearby?lat=${p.lat}&lng=${p.lng}`));
  }

  console.log('\nLookup:');
  const codes = [...foundCodes].slice(0, 3).concat(FALLBACK_CODES);
  for (const code of codes) {
    save(`lookup-${code}`, await call(`/v1/lookup?code=${encodeURIComponent(code)}&level=1`));
  }

  console.log(`\nPostcodes found by reverse geocode: ${foundCodes.size ? [...foundCodes].join(', ') : 'none'}`);

  console.log('\nReverse geocode summary:\n');
  printTable(rows);
  const count = (f: (r: SummaryRow) => boolean) => rows.filter(f).length;
  console.log(
    `\nTotals (${rows.length} calls): found ${count((r) => r.found === 'true')} ` +
      `(area-only, no postcode: ${count((r) => r.depth === 'area')}), ` +
      `high ${count((r) => r.confidence === 'high')}, ` +
      `medium ${count((r) => r.confidence === 'medium')}, ` +
      `low ${count((r) => r.confidence === 'low')}`,
  );

  assertNoKeyLeak();
}

main().catch((err) => {
  console.error('Probe failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
