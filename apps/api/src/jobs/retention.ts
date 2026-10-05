// Data retention (SPEC 7, Nigeria Data Protection Act 2023).
// After RETENTION_DAYS on a closed delivery: delete the customer's name and the phone numbers, coarsen
// coordinates to 3 decimals (~110 m), and unlink our postcode dataset rows from the delivery.
// Landmark text and dataset points are kept (open question for counsel, docs/notes.md).
// Also clears dead link tokens and expired sessions.
import { and, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { deliveries, deliveryEvents, locationPoints, sessions } from '../db/schema.js';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const BATCH = 500;
const COARSE_DECIMALS = 3;

// round(double, int) doesn't exist in Postgres; go via numeric.
const coarse = (col: AnyPgColumn) => sql<number>`round(${col}::numeric, ${sql.raw(String(COARSE_DECIMALS))})::double precision`;

export interface RetentionResult {
  redacted: number;
  tokensCleared: number;
  sessionsDeleted: number;
}

export async function runRetention(opts: { now?: Date; retentionDays?: number; tokenTtlDays?: number; dryRun?: boolean } = {}): Promise<RetentionResult> {
  if (!db) throw new Error('Database not configured');
  const database = db;
  const now = opts.now ?? new Date();
  const retentionCutoff = new Date(now.getTime() - (opts.retentionDays ?? config.RETENTION_DAYS) * DAY_MS);
  const tokenCutoff = new Date(now.getTime() - (opts.tokenTtlDays ?? config.TOKEN_TTL_AFTER_CLOSE_DAYS) * DAY_MS);
  const idleCutoff = new Date(now.getTime() - config.SESSION_IDLE_HOURS * HOUR_MS);

  const dueForRedaction = and(lt(deliveries.closed_at, retentionCutoff), isNull(deliveries.redacted_at));
  const dueTokenClear = and(
    lt(deliveries.closed_at, tokenCutoff),
    or(isNotNull(deliveries.customer_token_hash), isNotNull(deliveries.rider_token_hash)),
  );
  const expiredSession = or(lt(sessions.expires_at, now), lt(sessions.last_seen_at, idleCutoff));

  if (opts.dryRun) {
    const [[r], [t], [s]] = await Promise.all([
      database.select({ n: sql<number>`count(*)::int` }).from(deliveries).where(dueForRedaction),
      database.select({ n: sql<number>`count(*)::int` }).from(deliveries).where(dueTokenClear),
      database.select({ n: sql<number>`count(*)::int` }).from(sessions).where(expiredSession),
    ]);
    return { redacted: r?.n ?? 0, tokensCleared: t?.n ?? 0, sessionsDeleted: s?.n ?? 0 };
  }

  let redacted = 0;
  for (;;) {
    const ids = (await database.select({ id: deliveries.id }).from(deliveries).where(dueForRedaction).limit(BATCH)).map((r) => r.id);
    if (ids.length === 0) break;
    await database.transaction(async (tx) => {
      await tx
        .update(deliveries)
        .set({
          customer_name: null,
          customer_phone: null,
          rider_phone: null,
          dropoff_lat: coarse(deliveries.dropoff_lat),
          dropoff_lng: coarse(deliveries.dropoff_lng),
          redacted_at: now,
        })
        .where(inArray(deliveries.id, ids));
      await tx
        .update(deliveryEvents)
        .set({ lat: coarse(deliveryEvents.lat), lng: coarse(deliveryEvents.lng) })
        .where(and(inArray(deliveryEvents.delivery_id, ids), isNotNull(deliveryEvents.lat)));
      // The dataset keeps postcode + point, but no longer links back to a delivery (and its customer).
      await tx.update(locationPoints).set({ delivery_id: null }).where(inArray(locationPoints.delivery_id, ids));
    });
    redacted += ids.length;
    if (ids.length < BATCH) break;
  }

  const cleared = await database
    .update(deliveries)
    .set({ customer_token_hash: null, rider_token_hash: null })
    .where(dueTokenClear)
    .returning({ id: deliveries.id });

  const deleted = await database.delete(sessions).where(expiredSession).returning({ id: sessions.id });

  return { redacted, tokensCleared: cleared.length, sessionsDeleted: deleted.length };
}

/** Runs once at start-up and then every 24 h inside the API process. Logs counts only. */
export function startRetentionSchedule(): void {
  const run = () =>
    runRetention()
      .then((r) => console.log(`retention: redacted=${r.redacted} tokens_cleared=${r.tokensCleared} sessions_deleted=${r.sessionsDeleted}`))
      .catch((err) => console.error('retention failed:', err instanceof Error ? err.message : 'unknown'));
  setTimeout(run, 30_000).unref(); // after start-up settles
  setInterval(run, 24 * HOUR_MS).unref();
}
