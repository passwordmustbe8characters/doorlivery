// The shared design system, inlined into server-rendered pages (customer, rider, error pages).
// Inlining keeps these pages to one request plus the font, which matters on 3G.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const DESIGN_CSS = readFileSync(resolve(import.meta.dirname, '../../../../packages/shared/src/design.css'), 'utf8')
  // Drop comments and collapse whitespace: a smaller page for riders and customers.
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')
  .replace(/\s*([{};:,>])\s*/g, '$1')
  .trim();

/** Head tags every server page shares: font preload and favicon. */
export const HEAD_COMMON = `<link rel="preload" href="/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta name="theme-color" content="#0b6e4f">`;
