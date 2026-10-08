// Customer link: GET /c/:token (page), POST /c/:token/resolve and /confirm (SPEC 6).
import { randomBytes } from 'node:crypto';
import { Router, type Request } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { en, NIPOST_POSTCODE_PATTERN } from '@doorlivery/shared';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { deliveries, deliveryEvents, locationPoints, vendors } from '../db/schema.js';
import { decryptCode, encryptCode, generateCode, hashCode } from '../lib/delivery-code.js';
import { AppError } from '../lib/errors.js';
import { isLinkExpired } from '../lib/link-expiry.js';
import { byIp, byToken, rateLimit } from '../lib/rate-limit.js';
import { hashToken, TOKEN_PATTERN } from '../lib/tokens.js';
import { createNipostClient } from '../nipost/client.js';
import { checkChosenPostcode, resolvePin, type ResolveResult } from '../nipost/resolve.js';
import {
  customerPageCsp,
  orderStatusView,
  renderCodePage,
  renderCustomerPage,
  renderDeliveredPage,
  renderLinkInvalidPage,
} from '../views/customer-page.js';

// Customer can pick a pin only before confirming.
const OPEN_STATUSES = ['created', 'awaiting_customer'] as const;
// After confirming, the link shows the delivery code until the delivery is done.
const CODE_STATUSES = new Set(['ready', 'assigned', 'picked_up', 'arrived']);

// Nigeria with a small margin. Also catches swapped lat/lng: (3.5, 6.6) lands outside.
const NIGERIA = { minLat: 4.0, maxLat: 14.0, minLng: 2.5, maxLng: 15.0 };

const PointFields = {
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy_m: z.number().nonnegative().max(100_000).nullish(),
};
const inNigeria = (b: { lat: number; lng: number }) =>
  b.lat >= NIGERIA.minLat && b.lat <= NIGERIA.maxLat && b.lng >= NIGERIA.minLng && b.lng <= NIGERIA.maxLng;

const ResolveBody = z.object(PointFields).refine(inNigeria, { message: 'Location must be in Nigeria' });

const ConfirmBody = z
  .object({
    ...PointFields,
    postcode: z.string().regex(NIPOST_POSTCODE_PATTERN).nullish(),
    landmark_note: z.string().trim().max(300).nullish(),
  })
  .refine(inNigeria, { message: 'Location must be in Nigeria' });

const nipost = config.NIPOST_API_KEY
  ? createNipostClient({ baseUrl: config.NIPOST_API_BASE_URL, apiKey: config.NIPOST_API_KEY, timeoutMs: config.NIPOST_TIMEOUT_MS })
  : null;

function database() {
  if (!db) throw new AppError('SERVER_ERROR', 'Database not configured');
  return db;
}

/** The delivery this customer link belongs to, in any status. Cancelled deliveries have no token, so never match. */
async function findByToken(req: Request) {
  const token = String(req.params.token ?? '');
  if (!TOKEN_PATTERN.test(token)) return null;
  const [row] = await database()
    .select({
      id: deliveries.id,
      status: deliveries.status,
      business_name: vendors.business_name,
      code_encrypted: deliveries.code_encrypted,
      dropoff_postcode: deliveries.dropoff_postcode,
      landmark_note: deliveries.landmark_note,
      dropoff_lat: deliveries.dropoff_lat,
      dropoff_lng: deliveries.dropoff_lng,
      closed_at: deliveries.closed_at,
    })
    .from(deliveries)
    .innerJoin(vendors, eq(deliveries.vendor_id, vendors.id))
    .where(eq(deliveries.customer_token_hash, hashToken(token)))
    .limit(1);
  return row && !isLinkExpired(row.closed_at) ? row : null;
}

const isOpen = (status: string) => (OPEN_STATUSES as readonly string[]).includes(status);

async function findOpenDelivery(req: Request) {
  const row = await findByToken(req);
  return row && isOpen(row.status) ? row : null;
}

export const customerRouter = Router();

customerRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex');
  next();
});
// Per IP across all customer links, then per link below. Resolve and confirm spend NIPOST credits.
customerRouter.use(rateLimit(120, 60_000, byIp));
const resolveLimit = rateLimit(30, 10 * 60_000, byToken);
const confirmLimit = rateLimit(10, 10 * 60_000, byToken);

customerRouter.get('/:token', async (req, res) => {
  const nonce = randomBytes(16).toString('base64');
  res.set('Content-Security-Policy', customerPageCsp(nonce, config.MAP_TILE_URL));
  res.type('html');

  const delivery = await findByToken(req);
  if (delivery && isOpen(delivery.status)) {
    res.send(
      renderCustomerPage({
        nonce,
        businessName: delivery.business_name,
        tileUrl: config.MAP_TILE_URL,
        tileAttribution: config.MAP_TILE_ATTRIBUTION,
      }),
    );
  } else if (delivery && CODE_STATUSES.has(delivery.status)) {
    res.send(
      renderCodePage({
        nonce,
        businessName: delivery.business_name,
        status: delivery.status,
        code: delivery.code_encrypted ? decryptCode(delivery.id, delivery.code_encrypted) : null,
        postcode: delivery.dropoff_postcode,
        landmark: delivery.landmark_note,
        lat: delivery.dropoff_lat,
        lng: delivery.dropoff_lng,
        tileUrl: config.MAP_TILE_URL,
        tileAttribution: config.MAP_TILE_ATTRIBUTION,
      }),
    );
  } else if (delivery?.status === 'delivered') {
    res.send(renderDeliveredPage(nonce));
  } else {
    res.status(404).send(renderLinkInvalidPage(nonce));
  }
});

// Polled by the live order screen (every 15 s while visible). Status and wording only: never the code.
customerRouter.get('/:token/status', async (req, res) => {
  const d = await findByToken(req);
  if (!d || !(CODE_STATUSES.has(d.status) || d.status === 'delivered')) throw new AppError('NOT_FOUND', en.customer.linkInvalid);
  res.json({ status: d.status, ...orderStatusView(d.status) });
});

customerRouter.post('/:token/resolve', resolveLimit, async (req, res) => {
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

customerRouter.post('/:token/confirm', confirmLimit, async (req, res) => {
  const delivery = await findOpenDelivery(req);
  if (!delivery) throw new AppError('NOT_FOUND', en.customer.linkInvalid);

  const parsed = ConfirmBody.safeParse(req.body);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid location');
  const { lat, lng, accuracy_m, postcode: chosen, landmark_note } = parsed.data;

  // Network call stays outside the transaction.
  const check = await checkChosenPostcode(nipost, { lat, lng }, chosen ?? null, { reverseRadiusM: config.NIPOST_REVERSE_RADIUS_M });
  if (!check.ok) throw new AppError('VALIDATION_ERROR', en.customer.postcodeNotOffered);

  const code = generateCode();
  const tokenHash = hashToken(String(req.params.token));

  await database().transaction(async (tx) => {
    const [updated] = await tx
      .update(deliveries)
      .set({
        status: 'ready',
        dropoff_postcode: check.postcode,
        dropoff_confidence: check.confidence,
        dropoff_lat: lat,
        dropoff_lng: lng,
        landmark_note: landmark_note || null,
        code_hash: hashCode(delivery.id, code),
        code_encrypted: encryptCode(delivery.id, code),
        code_attempts: 0,
      })
      // Same token and still open: a double tap or a link resent meanwhile can't confirm twice.
      .where(and(eq(deliveries.id, delivery.id), eq(deliveries.customer_token_hash, tokenHash), inArray(deliveries.status, [...OPEN_STATUSES])))
      .returning({ id: deliveries.id });
    if (!updated) throw new AppError('NOT_FOUND', en.customer.linkInvalid);

    await tx.insert(deliveryEvents).values({
      delivery_id: delivery.id,
      event_type: 'customer_confirmed',
      actor: 'customer',
      lat,
      lng,
      accuracy_m: accuracy_m ?? null,
    });

    // Our dataset: only points with a postcode NIPOST offered for that spot (SPEC 1, 12).
    if (check.postcode) {
      await tx.insert(locationPoints).values({
        postcode: check.postcode,
        latitude: lat,
        longitude: lng,
        accuracy_m: accuracy_m ?? null,
        confidence: check.confidence,
        source: 'customer_pin',
        delivery_id: delivery.id,
      });
    }
  });

  res.json({ status: 'ready', code, postcode: check.postcode });
});
