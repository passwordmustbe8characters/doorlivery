// Vendor delivery routes (SPEC 6). All queries are scoped to the logged-in vendor.
import { Router, type Request } from 'express';
import { and, asc, count, desc, eq, gte, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { en, normalizeNigerianPhone, whatsappUrl, type DeliveryStatus } from '@doorlivery/shared';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { deliveries, deliveryEvents } from '../db/schema.js';
import { AppError } from '../lib/errors.js';
import { requireVendor } from '../lib/session.js';
import { generateToken, hashToken } from '../lib/tokens.js';
import { MAX_CODE_ATTEMPTS } from './rider.js';

// Which statuses each action may start from.
const CAN_SEND_CUSTOMER_LINK: DeliveryStatus[] = ['created', 'awaiting_customer'];
const CAN_ASSIGN: DeliveryStatus[] = ['ready', 'assigned']; // "assigned" = re-send to the same or a new rider
const CAN_CANCEL: DeliveryStatus[] = ['created', 'awaiting_customer', 'ready', 'assigned', 'picked_up', 'arrived'];
const CAN_UNLOCK: DeliveryStatus[] = ['assigned', 'picked_up', 'arrived'];

const phone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizeNigerianPhone(v);
    if (!n) ctx.addIssue({ code: z.ZodIssueCode.custom, message: en.errors.invalidPhone });
    return n ?? '';
  });
const optionalPhone = z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), phone.optional());
const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().max(max).optional());

const CreateBody = z.object({
  customer_name: z.string().trim().min(1).max(200),
  customer_phone: phone,
  pickup_note: z.string().trim().min(1).max(500),
  item_note: optionalText(500),
  rider_phone: optionalPhone,
});
const AssignBody = z.object({ rider_phone: optionalPhone });
const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const IdParam = z.string().uuid();

function database() {
  if (!db) throw new AppError('SERVER_ERROR', 'Database not configured');
  return db;
}

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new AppError('VALIDATION_ERROR', r.error.issues[0]?.message ?? 'Invalid input');
  return r.data;
}

function deliveryId(req: Request): string {
  const r = IdParam.safeParse(req.params.id);
  if (!r.success) throw new AppError('NOT_FOUND', en.errors.notFound);
  return r.data;
}

const ownDelivery = (req: Request, id: string) => and(eq(deliveries.id, id), eq(deliveries.vendor_id, req.vendor!.id));

/** Applies a status change only if the delivery is still in an allowed status; otherwise explains why not. */
async function guardedUpdate(
  req: Request,
  id: string,
  from: DeliveryStatus[],
  set: Partial<typeof deliveries.$inferInsert>,
  eventType: string,
) {
  return database().transaction(async (tx) => {
    const [row] = await tx
      .update(deliveries)
      .set(set)
      .where(and(ownDelivery(req, id), inArray(deliveries.status, from)))
      .returning();
    if (!row) {
      const [exists] = await tx.select({ id: deliveries.id }).from(deliveries).where(ownDelivery(req, id)).limit(1);
      throw new AppError(exists ? 'VALIDATION_ERROR' : 'NOT_FOUND', exists ? en.errors.wrongStatus : en.errors.notFound);
    }
    await tx.insert(deliveryEvents).values({ delivery_id: id, event_type: eventType, actor: 'vendor' });
    return row;
  });
}

type DeliveryRow = typeof deliveries.$inferSelect;

// Never expose token or code hashes.
function present(d: DeliveryRow) {
  return {
    id: d.id,
    status: d.status,
    customer_name: d.customer_name,
    customer_phone: d.customer_phone,
    pickup_note: d.pickup_note,
    item_note: d.item_note,
    rider_phone: d.rider_phone,
    dropoff_postcode: d.dropoff_postcode,
    dropoff_confidence: d.dropoff_confidence,
    landmark_note: d.landmark_note,
    code_locked: d.code_attempts >= MAX_CODE_ATTEMPTS,
    delivered_at: d.delivered_at,
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
}

export const deliveriesRouter = Router();
deliveriesRouter.use(requireVendor);

deliveriesRouter.post('/', async (req, res) => {
  const body = parse(CreateBody, req.body);
  const created = await database().transaction(async (tx) => {
    const [row] = await tx
      .insert(deliveries)
      .values({
        vendor_id: req.vendor!.id,
        customer_name: body.customer_name,
        customer_phone: body.customer_phone,
        pickup_note: body.pickup_note,
        item_note: body.item_note ?? null,
        rider_phone: body.rider_phone ?? null,
        status: 'created',
      })
      .returning();
    await tx.insert(deliveryEvents).values({ delivery_id: row!.id, event_type: 'created', actor: 'vendor' });
    return row!;
  });
  res.status(201).json(present(created));
});

deliveriesRouter.get('/', async (req, res) => {
  const { page, limit } = parse(ListQuery, req.query);
  const where = eq(deliveries.vendor_id, req.vendor!.id);
  const [rows, [total]] = await Promise.all([
    database()
      .select()
      .from(deliveries)
      .where(where)
      .orderBy(desc(deliveries.created_at))
      .limit(limit)
      .offset((page - 1) * limit),
    database().select({ n: count() }).from(deliveries).where(where),
  ]);
  res.json({ data: rows.map(present), page, limit, total: total?.n ?? 0 });
});

deliveriesRouter.get('/:id', async (req, res) => {
  const id = deliveryId(req);
  const [row] = await database().select().from(deliveries).where(ownDelivery(req, id)).limit(1);
  if (!row) throw new AppError('NOT_FOUND', en.errors.notFound);
  const events = await database()
    .select({ event_type: deliveryEvents.event_type, actor: deliveryEvents.actor, occurred_at: deliveryEvents.occurred_at })
    .from(deliveryEvents)
    .where(eq(deliveryEvents.delivery_id, id))
    .orderBy(asc(deliveryEvents.occurred_at));
  res.json({ ...present(row), events });
});

// Tokens are stored hashed, so a link can't be shown twice. Each "Send to customer" makes a fresh link
// and the previous one stops working.
deliveriesRouter.post('/:id/customer-link', async (req, res) => {
  const id = deliveryId(req);
  const token = generateToken();
  const row = await guardedUpdate(
    req,
    id,
    CAN_SEND_CUSTOMER_LINK,
    { customer_token_hash: hashToken(token), status: 'awaiting_customer' },
    'customer_link_sent',
  );
  const link = `${config.PUBLIC_BASE_URL}/c/${token}`;
  const text = en.messages.customer({
    customer_name: row.customer_name ?? en.messages.customerNameFallback,
    business_name: req.vendor!.business_name,
    link,
  });
  res.json({ link, whatsapp_url: whatsappUrl(row.customer_phone!, text) });
});

deliveriesRouter.post('/:id/assign', async (req, res) => {
  const id = deliveryId(req);
  const body = parse(AssignBody, req.body);
  const token = generateToken();
  const set: Partial<typeof deliveries.$inferInsert> = { rider_token_hash: hashToken(token), status: 'assigned' };
  if (body.rider_phone) set.rider_phone = body.rider_phone;

  // A rider number must exist either from this request or from when the delivery was created.
  if (!body.rider_phone) {
    const [current] = await database().select({ rider_phone: deliveries.rider_phone }).from(deliveries).where(ownDelivery(req, id)).limit(1);
    if (!current) throw new AppError('NOT_FOUND', en.errors.notFound);
    if (!current.rider_phone) throw new AppError('VALIDATION_ERROR', en.errors.invalidPhone);
  }

  const row = await guardedUpdate(req, id, CAN_ASSIGN, set, 'assigned');
  const link = `${config.PUBLIC_BASE_URL}/r/${token}`;
  const text = en.messages.rider({
    business_name: req.vendor!.business_name,
    pickup_note: row.pickup_note,
    postcode: row.dropoff_postcode ?? en.messages.postcodePending,
    link,
  });
  res.json({ link, whatsapp_url: whatsappUrl(row.rider_phone!, text) });
});

// After 5 wrong codes the rider is locked out (SPEC 6). The vendor checks with both sides by phone, then unlocks.
deliveriesRouter.post('/:id/unlock-code', async (req, res) => {
  const id = deliveryId(req);
  const row = await database().transaction(async (tx) => {
    const [updated] = await tx
      .update(deliveries)
      .set({ code_attempts: 0 })
      .where(and(ownDelivery(req, id), inArray(deliveries.status, CAN_UNLOCK), gte(deliveries.code_attempts, MAX_CODE_ATTEMPTS)))
      .returning();
    if (!updated) {
      const [exists] = await tx.select({ id: deliveries.id }).from(deliveries).where(ownDelivery(req, id)).limit(1);
      throw new AppError(exists ? 'VALIDATION_ERROR' : 'NOT_FOUND', exists ? en.errors.notLocked : en.errors.notFound);
    }
    await tx.insert(deliveryEvents).values({ delivery_id: id, event_type: 'code_unlocked', actor: 'vendor' });
    return updated;
  });
  res.json(present(row));
});

deliveriesRouter.post('/:id/cancel', async (req, res) => {
  const id = deliveryId(req);
  // Killing both token hashes makes the customer and rider links stop working at once.
  const row = await guardedUpdate(
    req,
    id,
    CAN_CANCEL,
    { status: 'cancelled', customer_token_hash: null, rider_token_hash: null, closed_at: new Date() },
    'cancelled',
  );
  res.json(present(row));
});
