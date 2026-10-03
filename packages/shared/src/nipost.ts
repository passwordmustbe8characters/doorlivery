// NIPOST postcode API (L1) response types, built from real responses in docs/nipost-samples/ (probed 2026-10-03).
// Every response body is wrapped as { data: ... }.
import type { Confidence } from './index.js';

export interface NipostEnvelope<T> {
  data: T;
}

/**
 * Canonical unit postcode, e.g. "LA-12-B04-EK-01". Matched all 15 distinct codes seen (Lagos and Abuja).
 * Display form is the same with spaces instead of hyphens.
 */
export const NIPOST_POSTCODE_PATTERN = /^[A-Z]{2}-\d{2}-[A-Z]\d{2}-[A-Z]{2}-\d{2}$/;

/** Hierarchy: state "LA" > district "LA-11-A12" > area "LA-11-A12-GN" > unit postcode "LA-11-A12-GN-01". */
export type NipostDepth = 'unit' | 'area';

export interface NipostUnit {
  /** Canonical form, e.g. "LA-11-A12-GN-01". */
  postcode: string;
  /** Human form with spaces, e.g. "LA 11 A12 GN 01". */
  display: string;
  distance_m: number;
  confidence: Confidence;
}

/** GET /v1/search/reverse. `coordinate` is [lng, lat] (GeoJSON order). */
export type NipostReverseResult =
  | {
      found: true;
      coordinate: [number, number];
      /** Absent when depth is "area": no unit within radius, only the enclosing area. */
      unit?: NipostUnit;
      area: string;
      district: string;
      state: string;
      depth: NipostDepth;
      radius_m: number;
    }
  | {
      found: false;
      coordinate: [number, number];
      message: string;
      radius_m: number;
    };

/** GET /v1/search/nearby. Sorted by distance, nearest first; exactly 10 at all 15 land points (cap). Empty array when none. */
export interface NipostNearbyItem {
  postcode: string;
  display: string;
  distance_m: number;
}
export type NipostNearbyResult = NipostNearbyItem[];

/**
 * GET /v1/lookup?level=1.
 * status "valid": exists; "invalid": wrong format (e.g. "100001"); "not_found": right format, no such code.
 * `verified` was false for every code seen, including valid ones (meaning unknown).
 */
export interface NipostLookupResult {
  postcode: string;
  valid: boolean;
  status: 'valid' | 'invalid' | 'not_found';
  verified: boolean;
}

/** Error body seen with a missing key. */
export interface NipostErrorBody {
  error: { code: string; message: string };
}
