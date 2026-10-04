// Pin -> postcode decision rules (docs/notes.md, "Slice 2 plan").
import type { Confidence, NipostNearbyItem } from '@doorlivery/shared';
import { NipostError, type LatLng, type NipostClient } from './client.js';

export type ResolveOutcome = 'found' | 'area_only' | 'not_found' | 'unavailable';

export interface ResolveResult {
  /** Our point, echoed back. It is the source of truth; NIPOST's postcode is only a label on it. */
  lat: number;
  lng: number;
  outcome: ResolveOutcome;
  postcode: string | null;
  display: string | null;
  confidence: Confidence | null;
  distance_m: number | null;
  /** The customer must confirm or pick from `nearby` before we accept the postcode. */
  needs_confirmation: boolean;
  nearby: NipostNearbyItem[];
}

export interface ResolveOptions {
  reverseRadiusM: number;
  farDistanceM: number;
}

export async function resolvePin(client: NipostClient, point: LatLng, opts: ResolveOptions): Promise<ResolveResult> {
  const base = { lat: point.lat, lng: point.lng, postcode: null, display: null, confidence: null, distance_m: null };

  let reverse;
  try {
    reverse = await client.reverse(point, opts.reverseRadiusM);
  } catch (err) {
    // Auth and credit failures are our problem, not the customer's: surface them as upstream errors.
    if (err instanceof NipostError && (err.kind === 'auth' || err.kind === 'no_credits')) throw err;
    // Anything else: never block the delivery. The customer can still save the pin (postcode pending).
    return { ...base, outcome: 'unavailable', needs_confirmation: false, nearby: [] };
  }

  // Area-only counts as no postcode.
  const unit = reverse.found ? reverse.unit : undefined;
  if (!unit) {
    return {
      ...base,
      outcome: reverse.found ? 'area_only' : 'not_found',
      needs_confirmation: true,
      nearby: await nearbyOrEmpty(client, point),
    };
  }

  const confident = unit.confidence === 'high' && unit.distance_m <= opts.farDistanceM;
  return {
    ...base,
    outcome: 'found',
    postcode: unit.postcode,
    display: unit.display,
    confidence: unit.confidence,
    distance_m: unit.distance_m,
    needs_confirmation: !confident,
    nearby: confident ? [] : await nearbyOrEmpty(client, point),
  };
}

async function nearbyOrEmpty(client: NipostClient, point: LatLng): Promise<NipostNearbyItem[]> {
  try {
    return await client.nearby(point);
  } catch {
    return [];
  }
}
