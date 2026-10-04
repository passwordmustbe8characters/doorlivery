export const DELIVERY_STATUSES = [
  'created',
  'awaiting_customer',
  'ready',
  'assigned',
  'picked_up',
  'arrived',
  'delivered',
  'failed',
  'cancelled',
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const EVENT_ACTORS = ['vendor', 'customer', 'rider', 'system'] as const;
export type EventActor = (typeof EVENT_ACTORS)[number];

export const LOCATION_SOURCES = ['customer_pin', 'rider_confirm'] as const;
export type LocationSource = (typeof LOCATION_SOURCES)[number];

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const ERROR_CODES = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'RATE_LIMITED',
  'UPSTREAM_ERROR',
  'SERVER_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

// .ts extension: drizzle-kit loads the schema (and this file) as CommonJS and can't map .js to .ts.
export * from './nipost.ts';
export * from './phone.ts';
export * from './i18n.ts';

export interface ApiError {
  error: true;
  message: string;
  code: ErrorCode;
}
