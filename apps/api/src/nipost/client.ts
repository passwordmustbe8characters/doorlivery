// Server-side NIPOST client (SPEC 4, 11). The API key never leaves this module.
import { z } from 'zod';
import { CONFIDENCE_LEVELS } from '@doorlivery/shared';
import type { NipostNearbyResult, NipostReverseResult } from '@doorlivery/shared';

export type LatLng = { lat: number; lng: number };

export type NipostErrorKind = 'timeout' | 'network' | 'auth' | 'no_credits' | 'rate_limited' | 'upstream' | 'bad_response';

export class NipostError extends Error {
  constructor(
    public readonly kind: NipostErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'NipostError';
  }
}

// Schemas mirror the real responses in docs/nipost-samples/.
const Coordinate = z.tuple([z.number(), z.number()]);
const UnitSchema = z.object({
  postcode: z.string(),
  display: z.string(),
  distance_m: z.number(),
  confidence: z.enum(CONFIDENCE_LEVELS),
});
const ReverseSchema = z.object({
  data: z.discriminatedUnion('found', [
    z.object({
      found: z.literal(true),
      coordinate: Coordinate,
      unit: UnitSchema.optional(),
      area: z.string(),
      district: z.string(),
      state: z.string(),
      depth: z.enum(['unit', 'area']),
      radius_m: z.number(),
    }),
    z.object({
      found: z.literal(false),
      coordinate: Coordinate,
      message: z.string(),
      radius_m: z.number(),
    }),
  ]),
});
const NearbySchema = z.object({
  data: z.array(z.object({ postcode: z.string(), display: z.string(), distance_m: z.number() })),
});

/** NIPOST returns coordinates as [lng, lat] (GeoJSON order). This is the only place that order is unpacked. */
export function fromNipostCoordinate(coordinate: readonly [number, number]): LatLng {
  const [lng, lat] = coordinate;
  return { lat, lng };
}

// About 11 m at the equator; NIPOST echoes our input, so anything larger means the order got swapped.
const SAME_POINT_TOLERANCE_DEG = 0.0001;

/** True when NIPOST answered for the point we sent (catches a lat/lng swap on either side). */
export function isSamePoint(a: LatLng, b: LatLng): boolean {
  return Math.abs(a.lat - b.lat) <= SAME_POINT_TOLERANCE_DEG && Math.abs(a.lng - b.lng) <= SAME_POINT_TOLERANCE_DEG;
}

export interface NipostClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  fetch?: typeof fetch;
}

export function createNipostClient(opts: NipostClientOptions) {
  const baseUrl = opts.baseUrl.replace(/\/$/, '');
  const doFetch = opts.fetch ?? fetch;

  async function attempt(path: string): Promise<unknown> {
    let res: Response;
    try {
      res = await doFetch(baseUrl + path, {
        headers: { 'X-API-Key': opts.apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
    } catch (err) {
      const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      throw new NipostError(isTimeout ? 'timeout' : 'network', isTimeout ? 'NIPOST timed out' : 'NIPOST unreachable');
    }
    if (res.status === 401 || res.status === 403) throw new NipostError('auth', 'NIPOST rejected the API key', res.status);
    if (res.status === 402) throw new NipostError('no_credits', 'NIPOST credits exhausted', res.status);
    if (res.status === 429) throw new NipostError('rate_limited', 'NIPOST rate limit hit', res.status);
    if (!res.ok) throw new NipostError('upstream', `NIPOST error ${res.status}`, res.status);
    try {
      return await res.json();
    } catch {
      throw new NipostError('bad_response', 'NIPOST returned invalid JSON', res.status);
    }
  }

  // One retry, only for failures that might pass on a second try (SPEC 11).
  async function get(path: string): Promise<unknown> {
    try {
      return await attempt(path);
    } catch (err) {
      if (err instanceof NipostError && ['timeout', 'network', 'upstream'].includes(err.kind)) return attempt(path);
      throw err;
    }
  }

  function parse<T>(schema: z.ZodType<{ data: T }>, body: unknown): T {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new NipostError('bad_response', 'NIPOST response shape changed');
    return parsed.data.data;
  }

  return {
    async reverse(point: LatLng, maxDistanceM: number): Promise<NipostReverseResult> {
      const q = new URLSearchParams({ lat: String(point.lat), lng: String(point.lng), max_distance_m: String(maxDistanceM) });
      const result = parse(ReverseSchema, await get(`/v1/search/reverse?${q}`)) as NipostReverseResult;
      if (!isSamePoint(point, fromNipostCoordinate(result.coordinate))) {
        throw new NipostError('bad_response', 'NIPOST answered for a different point');
      }
      return result;
    },

    async nearby(point: LatLng): Promise<NipostNearbyResult> {
      const q = new URLSearchParams({ lat: String(point.lat), lng: String(point.lng) });
      return parse(NearbySchema, await get(`/v1/search/nearby?${q}`));
    },
  };
}

export type NipostClient = ReturnType<typeof createNipostClient>;
