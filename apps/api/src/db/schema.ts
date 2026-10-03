import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
  text,
} from 'drizzle-orm/pg-core';
import {
  CONFIDENCE_LEVELS,
  DELIVERY_STATUSES,
  EVENT_ACTORS,
  LOCATION_SOURCES,
} from '@doorlivery/shared';

const inList = (values: readonly string[]) =>
  sql.raw(values.map((v) => `'${v}'`).join(', '));

const baseColumns = {
  id: uuid('id').primaryKey().defaultRandom(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const vendors = pgTable('vendors', {
  ...baseColumns,
  email: varchar('email', { length: 320 }).notNull().unique(),
  password_hash: text('password_hash').notNull(),
  business_name: varchar('business_name', { length: 200 }).notNull(),
  phone: varchar('phone', { length: 32 }),
  is_active: boolean('is_active').notNull().default(true),
});

export const deliveries = pgTable(
  'deliveries',
  {
    ...baseColumns,
    vendor_id: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id),
    pickup_note: text('pickup_note').notNull(),
    customer_name: varchar('customer_name', { length: 200 }).notNull(),
    customer_phone: varchar('customer_phone', { length: 32 }),
    item_note: text('item_note'),
    status: varchar('status', { length: 32 }).notNull().default('created'),
    code_hash: text('code_hash'),
    code_attempts: integer('code_attempts').notNull().default(0),
    customer_token_hash: varchar('customer_token_hash', { length: 128 }).unique(),
    rider_token_hash: varchar('rider_token_hash', { length: 128 }).unique(),
    rider_phone: varchar('rider_phone', { length: 32 }),
    dropoff_postcode: varchar('dropoff_postcode', { length: 16 }),
    dropoff_lat: doublePrecision('dropoff_lat'),
    dropoff_lng: doublePrecision('dropoff_lng'),
    dropoff_confidence: varchar('dropoff_confidence', { length: 16 }),
    landmark_note: text('landmark_note'),
    delivered_at: timestamp('delivered_at', { withTimezone: true }),
  },
  (t) => [
    index('deliveries_vendor_created_idx').on(t.vendor_id, t.created_at.desc()),
    check('deliveries_status_check', sql`${t.status} in (${inList(DELIVERY_STATUSES)})`),
    check(
      'deliveries_confidence_check',
      sql`${t.dropoff_confidence} is null or ${t.dropoff_confidence} in (${inList(CONFIDENCE_LEVELS)})`,
    ),
  ],
);

export const deliveryEvents = pgTable(
  'delivery_events',
  {
    ...baseColumns,
    delivery_id: uuid('delivery_id')
      .notNull()
      .references(() => deliveries.id, { onDelete: 'cascade' }),
    event_type: varchar('event_type', { length: 32 }).notNull(),
    actor: varchar('actor', { length: 16 }).notNull(),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    accuracy_m: doublePrecision('accuracy_m'),
    occurred_at: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('delivery_events_delivery_idx').on(t.delivery_id, t.occurred_at),
    check('delivery_events_actor_check', sql`${t.actor} in (${inList(EVENT_ACTORS)})`),
  ],
);

export const locationPoints = pgTable(
  'location_points',
  {
    ...baseColumns,
    postcode: varchar('postcode', { length: 16 }).notNull(),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    accuracy_m: doublePrecision('accuracy_m'),
    confidence: varchar('confidence', { length: 16 }),
    source: varchar('source', { length: 16 }).notNull(),
    delivery_id: uuid('delivery_id').references(() => deliveries.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('location_points_postcode_idx').on(t.postcode),
    check('location_points_source_check', sql`${t.source} in (${inList(LOCATION_SOURCES)})`),
  ],
);
