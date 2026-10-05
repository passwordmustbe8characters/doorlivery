// Rider link: GET /r/:token (page), POST /r/:token/event and /delivered (SPEC 6, 8).
import { randomBytes } from 'node:crypto';
import { Router, type Request } from 'express';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { en, type DeliveryStatus } from '@doorlivery/shared';
import { db } from '../db/client.js';
import { deliveries, deliveryEvents, locationPoints, vendors } from '../db/schema.js';
import { CODE_PATTERN, verifyCode } from '../lib/delivery-code.js';
import { AppError } from '../lib/errors.js';
import { distanceM, RIDER_POINT_MAX_ACCURACY_M, RIDER_POINT_MAX_DISTANCE_M, riderPointConfidence } from '../lib/geo.js';
import { hashToken, TOKEN_PATTERN } from '../lib/tokens.js';
import { renderLinkInvalidPage } from '../views/customer-page.js';
import { renderRiderDonePage, renderRiderPage, riderPageCsp } from '../views/rider-page.js';

export const MAX_CODE_ATTEMPTS = 5;

// Which statuses each rider action may start from. Riders sometimes skip a tap, so later steps accept earlier states.
const ACTIVE: DeliveryStatus[] = ['assigned', 'picked_up', 'arrived'];
const EVENT_FROM: Record<'picked_up' | 'arrived', DeliveryStatus[]> = {
  picked_up: ['assigned'],
  arrived: ['assigned', 'picked_up'],
};

const NIGERIA = { minLat: 4.0, maxLat: 14.0, minLng: 2.5, maxLng: 15.0 };

const EventBody = z.object({ event: z.enum(['picked_up', 'arrived']) });
const DeliveredBody = z
  .object({
    code: z.string().regex(CODE_PATTERN, en.rider.codeFormat),
    lat: z.number().min(NIGERIA.minLat).max(NIGERIA.maxLat).optional(),
    lng: z.number().min(NIGERIA.minLng).max(NIGERIA.maxLng).optional(),
    accuracy_m: z.number().nonnegative().max(100_000).optional(),
  })
  .refine((b) => (b.lat === undefined) === (b.lng === undefined), { message: 'lat and lng go together' });

function database() {
  if (!db) throw new AppError('SERVER_ERROR', 'Database not configured');
  return db;
}

function tokenHash(req: Request): string | null {
  const token = String(req.params.token ?? '');
  return TOKEN_PATTERN.test(token) ? hashToken(token) : null;
}

async function findByToken(req: Request) {
  const hash = tokenHash(req);
  if (!hash) return null;
  const [row] = await database()
    .select({
      id: deliveries.id,
      status: deliveries.status,
      business_name: vendors.business_name,
      pickup_note: deliveries.pickup_note,
      dropoff_postcode: deliveries.dropoff_postcode,
      dropoff_lat: deliveries.dropoff_lat,
      dropoff_lng: deliveries.dropoff_lng,
      landmark_note: deliveries.landmark_note,
      customer_name: deliveries.customer_name,
      customer_phone: deliveries.customer_phone,
      code_hash: deliveries.code_hash,
      code_attempts: deliveries.code_attempts,
    })
    .from(deliveries)
    .innerJoin(vendors, eq(deliveries.vendor_id, vendors.id))
    .where(eq(deliveries.rider_token_hash, hash))
    .limit(1);
  return row ?? null;
}

export const riderRouter = Router();

riderRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex');
  next();
});

riderRouter.get('/:token', async (req, res) => {
  const nonce = randomBytes(16).toString('base64');
  res.set('Content-Security-Policy', riderPageCsp(nonce));
  res.type('html');

  const d = await findByToken(req);
  if (d?.status === 'delivered') {
    res.send(renderRiderDonePage(nonce, en.rider.deliveredTitle, en.rider.deliveredBody));
  } else if (d && ACTIVE.includes(d.status as DeliveryStatus)) {
    res.send(
      renderRiderPage({
        nonce,
        businessName: d.business_name,
        status: d.status,
        pickupNote: d.pickup_note,
        postcode: d.dropoff_postcode,
        landmark: d.landmark_note,
        lat: d.dropoff_lat,
        lng: d.dropoff_lng,
        customerName: d.customer_name,
        customerPhone: d.customer_phone,
        codeLocked: d.code_attempts >= MAX_CODE_ATTEMPTS,
      }),
    );
  } else {
    // Unknown, cancelled (token cleared) or re-assigned to another rider (token rotated).
    res.status(404).send(renderLinkInvalidPage(nonce));
  }
});

riderRouter.post('/:token/event', async (req, res) => {
  const d = await findByToken(req);
  if (!d || !ACTIVE.includes(d.status as DeliveryStatus)) throw new AppError('NOT_FOUND', en.customer.linkInvalid);
  const parsed = EventBody.safeParse(req.body);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', 'Unknown event');
  const event = parsed.data.event;

  if (d.status === event) {
    res.json({ status: d.status }); // repeated tap: nothing to do
    return;
  }

  await database().transaction(async (tx) => {
    const [row] = await tx
      .update(deliveries)
      .set({ status: event })
      .where(and(eq(deliveries.id, d.id), eq(deliveries.rider_token_hash, tokenHash(req)!), inArray(deliveries.status, EVENT_FROM[event])))
      .returning({ id: deliveries.id });
    if (!row) throw new AppError('VALIDATION_ERROR', en.errors.wrongStatus);
    await tx.insert(deliveryEvents).values({ delivery_id: d.id, event_type: event, actor: 'rider' });
  });
  res.json({ status: event });
});

riderRouter.post('/:token/delivered', async (req, res) => {
  const d = await findByToken(req);
  if (!d || !ACTIVE.includes(d.status as DeliveryStatus)) throw new AppError('NOT_FOUND', en.customer.linkInvalid);
  if (d.code_attempts >= MAX_CODE_ATTEMPTS) throw new AppError('FORBIDDEN', en.rider.locked);

  const parsed = DeliveredBody.safeParse(req.body);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? en.rider.codeFormat);
  const { code, lat, lng, accuracy_m } = parsed.data;
  const hash = tokenHash(req)!;

  if (!d.code_hash || !verifyCode(d.id, code, d.code_hash)) {
    // Count the miss atomically, and only while under the limit, so parallel guesses can't get extra tries.
    const [row] = await database()
      .update(deliveries)
      .set({ code_attempts: sql`${deliveries.code_attempts} + 1` })
      .where(and(eq(deliveries.id, d.id), eq(deliveries.rider_token_hash, hash), lt(deliveries.code_attempts, MAX_CODE_ATTEMPTS)))
      .returning({ attempts: deliveries.code_attempts });
    if (!row) throw new AppError('FORBIDDEN', en.rider.locked);
    if (row.attempts >= MAX_CODE_ATTEMPTS) {
      // Shows on the vendor's timeline and as a "Code locked" badge (SPEC 6: notify the vendor).
      await database().insert(deliveryEvents).values({ delivery_id: d.id, event_type: 'code_locked', actor: 'system' });
      throw new AppError('FORBIDDEN', en.rider.locked);
    }
    throw new AppError('VALIDATION_ERROR', en.rider.wrongCode(MAX_CODE_ATTEMPTS - row.attempts));
  }

  const point = lat !== undefined && lng !== undefined ? { lat, lng } : null;
  await database().transaction(async (tx) => {
    const [row] = await tx
      .update(deliveries)
      .set({ status: 'delivered', delivered_at: new Date() })
      .where(
        and(
          eq(deliveries.id, d.id),
          eq(deliveries.rider_token_hash, hash),
          inArray(deliveries.status, ACTIVE),
          lt(deliveries.code_attempts, MAX_CODE_ATTEMPTS),
        ),
      )
      .returning({ id: deliveries.id });
    if (!row) throw new AppError('VALIDATION_ERROR', en.errors.wrongStatus);

    await tx.insert(deliveryEvents).values({
      delivery_id: d.id,
      event_type: 'delivered',
      actor: 'rider',
      lat: point?.lat ?? null,
      lng: point?.lng ?? null,
      accuracy_m: accuracy_m ?? null,
    });

    // Verified point for our dataset: needs a postcode, a precise fix, and to be near the customer's pin.
    const customerPin = d.dropoff_lat !== null && d.dropoff_lng !== null ? { lat: d.dropoff_lat, lng: d.dropoff_lng } : null;
    if (
      point &&
      d.dropoff_postcode &&
      accuracy_m !== undefined &&
      accuracy_m <= RIDER_POINT_MAX_ACCURACY_M &&
      customerPin &&
      distanceM(point, customerPin) <= RIDER_POINT_MAX_DISTANCE_M
    ) {
      await tx.insert(locationPoints).values({
        postcode: d.dropoff_postcode,
        latitude: point.lat,
        longitude: point.lng,
        accuracy_m,
        confidence: riderPointConfidence(accuracy_m),
        source: 'rider_confirm',
        delivery_id: d.id,
      });
    }
  });

  res.json({ status: 'delivered' });
});
