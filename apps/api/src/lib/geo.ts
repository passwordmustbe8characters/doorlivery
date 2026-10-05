import type { Confidence } from '@doorlivery/shared';

/** Great-circle distance in metres. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// A rider's GPS at handover becomes a verified point only if it is precise and close to the customer's pin.
export const RIDER_POINT_MAX_ACCURACY_M = 100;
export const RIDER_POINT_MAX_DISTANCE_M = 150;

export function riderPointConfidence(accuracyM: number): Confidence {
  if (accuracyM <= 25) return 'high';
  if (accuracyM <= 60) return 'medium';
  return 'low';
}
