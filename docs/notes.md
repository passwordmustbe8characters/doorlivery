# Notes

Findings, decisions and open questions (SPEC sections 0 and 12).

## Decisions
- 2026-10-03: Postgres is deferred until slice 2. `db:migrate` has not been run yet.
- 2026-10-03: ORM is **Drizzle** (drizzle-orm + drizzle-kit). Migrations are SQL files in `apps/api/drizzle/`.
- 2026-10-03: Package manager is **npm workspaces**.
- 2026-10-03: No `dotenv` dependency. Node's built-in `process.loadEnvFile` reads the repo-root `.env`.
- 2026-10-03: `GET /health` returns `db: "not_configured"` when `DATABASE_URL` is empty, so the API can run before a database exists.

## NIPOST API findings (probed 2026-10-03)
Raw responses: `docs/nipost-samples/`. Types: `packages/shared/src/nipost.ts`. Test points: `scripts/probe-points.json`.

### Key and data
- **Key type: test.** The key starts with `nipost_test`. No response header or body field says test/live.
- **Data looks real, not canned.** Each point returns different codes in the right state (`LA` for Lagos, `FC` for Abuja). The codes form a clear hierarchy. Nearby search lists 10 distinct neighbouring units. A sea point returns not-found. Lookup confirms the codes that reverse returned. Ground-truth accuracy (does the code match the real street?) is **unverified** and needs on-site checks.
- **Coverage, run 1:** 4 of 4 land points found (Ikeja, Victoria Island, Yaba, Abuja Wuse).

### Run 2: 11 real places (Ikorodu, Mushin, Surulere area)
- **Unit found at all 11 places, every one `high` confidence, 2.8–19 m away.** Results at 50 m were identical to the default 25 m radius in every case.
- Totals across all 16 points × 2 radii (32 calls): found 30 (1 area-only: Yaba at 25 m), high 28, medium 1, low 0. The sea point was not found both times.
- **The geography is consistent, which is strong evidence the data is real.** The 8 Ikorodu places within ~1.5 km share `LA-12`, and 6 of them are in district `LA-12-B04`. The market and hospital in Mushin (~140 m apart) are both in `LA-16-A11`. Surulere (Silverson) is `LA-18`.
- 15 distinct postcodes seen so far, and all of them match `^[A-Z]{2}-\d{2}-[A-Z]\d{2}-[A-Z]{2}-\d{2}$` (exported as `NIPOST_POSTCODE_PATTERN`).
- The response shapes match run 1. No new fields appeared across 48 saved responses. Nearby returned exactly 10 at every one of the 15 land points, so it is capped at 10.
- **Caveat:** these are places that appear on maps, so they are probably in well-mapped streets. We haven't tested low-confidence or far results yet; a few points in new estates or uncovered areas would help.

### Corrections to SPEC section 4
- **Every body is wrapped in `{ "data": ... }`.**
- **Postcode format is `LA-11-A12-GN-01`** (state-district-area-unit), with a display form `LA 11 A12 GN 01`. Old 6-digit codes like `100001` return `status: "invalid"`. The canonical form is 15 chars, close to the `varchar(16)` limit on `deliveries.dropoff_postcode` and `location_points.postcode`. These will be widened to 32 in slice 2 (see the Slice 2 plan).
- **`found: true` does not guarantee a postcode.** When no unit is in range, reverse can return `depth: "area"` with `area`/`district`/`state` and **no `unit`**. Seen at Yaba with the default 25 m radius. Treat it as "no postcode" for our purposes.
- Area fallback and nearest unit can disagree. Yaba at 25 m gave area `LA-15-A12-BE`. At 50 m it gave unit `LA-15-A04-PG-04` (a different district) at 40 m. Don't trust the area fallback as the buyer's postcode.
- `coordinate` is `[lng, lat]` (GeoJSON order), not `[lat, lng]`.
- The default reverse radius is confirmed at 25 m (`radius_m: 25`).

### Reverse (`/v1/search/reverse`)
- Found: `{ found: true, coordinate, unit: { postcode, display, distance_m, confidence }, area, district, state, depth: "unit", radius_m }`
- Area only: same, without `unit`, `depth: "area"`.
- Not found: `{ found: false, coordinate, message: "no postcode within range of this location", radius_m }`. HTTP 200, not 404.

### Nearby (`/v1/search/nearby`), default radius
- `data` is an array of `{ postcode, display, distance_m }`, sorted nearest first. No confidence.
- Exactly 10 results at every land point, so it is probably capped at 10. The real radius used isn't returned.
- Sea point: `data: []`. HTTP 200.

### Lookup L1 (`/v1/lookup?code=&level=1`)
- `data: { postcode, valid, status, verified }`, always HTTP 200.
- `status`: `"valid"` (exists), `"invalid"` (wrong format), `"not_found"` (right format, doesn't exist).
- `verified` was `false` for every code, including valid ones. Its meaning is **unknown**; ask NIPOST.

### Limits
- Headers: `x-ratelimit-limit: 600`, `x-ratelimit-remaining`. No reset header and no credit or cost headers. The window length is **unknown**: the counter had reset within about 8 minutes.
- Latency: ~130–160 ms per call. The first call took ~770 ms (cold connection).
- CORS is `*`, and the API allows an `X-Widget-Origin` header. We still call it server-side only.

## Slice 2 plan (agreed 2026-10-03)
- **Postcode columns become `varchar(32)`** (`deliveries.dropoff_postcode`, `location_points.postcode`). Change `schema.ts` and regenerate the first migration when we start slice 2. Nothing runs against a database before then.
- **An area-only result (`depth: "area"`, no `unit`) counts as no postcode.** Never show the area code to the buyer as their postcode.
- **Low-confidence or far results need the customer to confirm or choose from nearby.** Anything not `high` shows the nearby picker. The distance threshold for "far" is set in config and decided in slice 2.
- **Our stored lat/lng is the source of truth.** NIPOST's postcode is a label attached to our point; we never overwrite our coordinates with NIPOST's.
- **Test:** NIPOST's `coordinate` is `[lng, lat]`. Add a unit test that the client maps it to `{ lat, lng }` correctly. Use a Lagos point where swapping the two would land somewhere else entirely (e.g. lat 6.62, lng 3.50).

## Open questions (SPEC 12)
- [~] Does a test key return real data? Coverage and accuracy in Lagos? The data looks real, and all 15 land points were covered (14 with a high-confidence unit). Ground-truth accuracy still needs checking on site.
- [~] Rate limits and credit cost for L1 calls? The limit is 600 per window (window length unknown). No credit info is in the responses.
- [ ] What does `verified: false` on lookup mean? Will a live key behave differently from the test key?
- [ ] May we store NIPOST-derived responses and our own pin data? (Ask NIPOST in writing.)
- [ ] Map tile provider and terms for production.

## Slice 6 hardening checklist
_To be written in slice 6._
