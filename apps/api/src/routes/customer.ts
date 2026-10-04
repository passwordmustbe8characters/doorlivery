// Customer link: GET /c/:token (page) and POST /c/:token/resolve (SPEC 6).
import { randomBytes } from 'node:crypto';
import { Router, type Request } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { deliveries, vendors } from '../db/schema.js';
import { AppError } from '../lib/errors.js';
import { hashToken, TOKEN_PATTERN } from '../lib/tokens.js';
import { createNipostClient } from '../nipost/client.js';
import { resolvePin, type ResolveResult } from '../nipost/resolve.js';
import { customerPageCsp, renderCustomerPage, renderLinkInvalidPage } from '../views/customer-page.js';

// Customer can pick a pin only before confirming.
const OPEN_STATUSES = new Set(['created', 'awaiting_customer']);

// Nigeria with a small margin. Also catches swapped lat/lng: (3.5, 6.6) lands outside.
const NIGERIA = { minLat: 4.0, maxLat: 14.0, minLng: 2.5, maxLng: 15.0 };

const ResolveBody = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy_m: z.number().nonnegative().max(100_000).nullish(),
  })
  .refine((b) => b.lat >= NIGERIA.minLat && b.lat <= NIGERIA.maxLat && b.lng >= NIGERIA.minLng && b.lng <= NIGERIA.maxLng, {
    message: 'Location must be in Nigeria',
  });

const nipost = config.NIPOST_API_KEY
  ? createNipostClient({ baseUrl: config.NIPOST_API_BASE_URL, apiKey: config.NIPOST_API_KEY, timeoutMs: config.NIPOST_TIMEOUT_MS })
  : null;

async function findOpenDelivery(req: Request) {
  const token = String(req.params.token ?? '');
  if (!TOKEN_PATTERN.test(token)) return null;
  if (!db) throw new AppError('SERVER_ERROR', 'Database not configured');
  const [row] = await db
    .select({ id: deliveries.id, status: deliveries.status, business_name: vendors.business_name })
    .from(deliveries)
    .innerJoin(vendors, eq(deliveries.vendor_id, vendors.id))
    .where(eq(deliveries.customer_token_hash, hashToken(token)))
    .limit(1);
  return row && OPEN_STATUSES.has(row.status) ? row : null;
}

export const customerRouter = Router();

customerRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex');
  next();
});

customerRouter.get('/:token', async (req, res) => {
  const nonce = randomBytes(16).toString('base64');
  res.set('Content-Security-Policy', customerPageCsp(nonce, config.MAP_TILE_URL));
  res.type('html');

  const delivery = await findOpenDelivery(req);
  if (!delivery) {
    res.status(404).send(renderLinkInvalidPage(nonce));
    return;
  }
  res.send(
    renderCustomerPage({
      nonce,
      businessName: delivery.business_name,
      tileUrl: config.MAP_TILE_URL,
      tileAttribution: config.MAP_TILE_ATTRIBUTION,
    }),
  );
});

customerRouter.post('/:token/resolve', async (req, res) => {
  const delivery = await findOpenDelivery(req);
  if (!delivery) throw new AppError('NOT_FOUND', 'This link is not valid or has expired');

  const parsed = ResolveBody.safeParse(req.body);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid location');
  const point = { lat: parsed.data.lat, lng: parsed.data.lng };

  const result: ResolveResult = nipost
    ? await resolvePin(nipost, point, { reverseRadiusM: config.NIPOST_REVERSE_RADIUS_M, farDistanceM: config.NIPOST_FAR_DISTANCE_M })
    : { ...point, outcome: 'unavailable', postcode: null, display: null, confidence: null, distance_m: null, needs_confirmation: false, nearby: [] };

  res.json(result);
});
