# Notes

Findings, decisions and open questions (SPEC sections 0 and 12).

## Decisions
- 2026-10-04: Postgres is Neon. The first migration was applied in slice 2.
- 2026-10-04: Shared package imports use `.ts` extensions (`allowImportingTsExtensions`), because drizzle-kit loads the schema as CommonJS.
- 2026-10-04: Tests use Node's built-in runner via `tsx --test` (no new dependency).
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

## Slice 5 build (2026-10-04)
- **Rider page `/r/:token`:** server-rendered, no framework, ~5.6 KB, strict CSP, nothing loaded from outside. It has everything SPEC 8 lists, in order. "Open Map" uses `https://www.google.com/maps/search/?api=1&query=lat,lng`, which opens the maps app on Android and iPhone.
- **Rider events:** `picked_up` from `assigned`; `arrived` from `assigned`/`picked_up` (riders sometimes skip a tap); `delivered` from any of the three. A repeated tap does nothing; going back a step is refused.
- **Code check:**
  - At most 5 wrong codes. The counter goes up in a single guarded `UPDATE … WHERE code_attempts < 5`, so parallel guesses can't get extra tries (tested with 12 at once: stopped at exactly 5).
  - The 5th miss writes a `code_locked` event (actor `system`). The vendor sees a red banner on the delivery and a "Code locked" badge in the list.
  - **Added beyond the spec:** `POST /api/deliveries/:id/unlock-code`, so the vendor can reset the counter after calling both sides, and the delivery isn't stuck forever. It is logged as `code_unlocked`.
- **Rider GPS:**
  - Location is asked for only when the rider taps Delivered, with one sentence of explanation. If it's refused or takes more than 10 s, the delivery still completes.
  - The GPS fix is always stored on the `delivered` event.
  - It becomes a **`rider_confirm` row in `location_points`** only if all of these hold: the delivery has a postcode, accuracy ≤ 100 m, and the fix is ≤ 150 m from the customer's pin.
  - Confidence: high ≤ 25 m, medium ≤ 60 m, otherwise low.
  - Far or imprecise fixes are kept on the event but not added to the dataset.
- **Re-assigning a rider** makes a new rider link, and the old one stops working. Cancel kills both links.

## Slice 4 build (2026-10-04)
- **`POST /c/:token/confirm`** takes `lat`, `lng`, `accuracy_m?`, `postcode?` (must match the NIPOST format) and `landmark_note?` (up to 300 chars). It moves `awaiting_customer`/`created` to **`ready`** in one transaction, using the same token and an open-status guard, so a double tap or a re-sent link can't confirm twice.
- **The chosen postcode is checked again on the server.** NIPOST is asked again for the same point:
  - NIPOST's own unit → stored with its confidence.
  - A pick from the nearby list → stored as `low`, because the customer overrode NIPOST; a rider confirmation can raise it later.
  - Anything else → 400, "Please choose a postcode from the list…".
  - NIPOST down, or no postcode chosen → the pin is saved with postcode `null` ("pending"). The rider message then says "see map".
- **`location_points`** gets a `customer_pin` row only when there is a postcode. Our own coordinates plus the postcode string, nothing else from NIPOST (SPEC 12).
- **Delivery code:** 4 random digits (`crypto.randomInt`).
  - `code_hash`: HMAC-SHA256 over `delivery_id:code`, keyed from `DELIVERY_CODE_SECRET`, because a plain hash of 4 digits can be brute-forced instantly.
  - `code_encrypted` (new column, migration `0002`): an AES-256-GCM copy, bound to the delivery id, so the **customer page can show the code again** when the link is reopened. Neither the vendor nor the rider can see it.
  - Both keys are derived from `DELIVERY_CODE_SECRET` (HKDF). **Changing the secret invalidates every issued code.**
- **Customer link after confirm:** shows the code screen (code, instruction, postcode, landmark, status line; no scripts). Once delivered, it shows "Delivered". After a cancel, it shows "Link not valid".
- **Not in this slice:** checking the code and the 5-attempt lockout (slice 5). The customer can't change their pin after confirming; if they need to, the vendor has to cancel and create a new delivery.

## Hosting change (2026-10-04, replaces SPEC 3 "API on Render, vendor app on Vercel")
- **One origin, one deploy.** Express serves the built vendor app (`apps/web/dist`) as well as `/api`, `/c` and `/r`, all on Render. Vercel is no longer used.
- Why: the session cookie stays first-party (`SameSite=Lax` just works), there's no CORS, and there's one thing to deploy.
- Local dev: Vite on `:5173` proxies `/api` to Express on `:4000`. `http://localhost:5173` is an allowed origin in development only.
- Render build: `npm ci && npm run build`. Start command: `npm start`.

## Slice 3 build (2026-10-04)
- **Auth:** `@node-rs/argon2` (argon2id, m=19 MiB, t=2, p=1). It installs from prebuilt binaries on Windows; Render (linux-x64) has a prebuilt binary too, still to be confirmed at deploy time. Fall back to `bcryptjs` only if it fails there.
- **Sessions** (`sessions` table, migration `0001`):
  - Random 256-bit token in cookie `dl_session`: `HttpOnly; Secure; SameSite=Lax; Path=/`. Only its SHA-256 is stored.
  - Idle expiry 72 h (`SESSION_IDLE_HOURS`), absolute 30 days (`SESSION_ABSOLUTE_DAYS`). `last_seen_at` is written at most every 5 min.
  - Logout deletes the row. A password reset via the script deletes all of that vendor's sessions.
- **Origin check:** every non-GET `/api` request needs an `Origin` (or `Referer`) in the allowed set: `PUBLIC_BASE_URL`, plus `:5173` in dev, plus `EXTRA_ALLOWED_ORIGINS`.
- **Login rate limits** (in memory, per API instance):
  - 20 attempts per IP and 5 failures per email, each per 15 min.
  - Wrong email, wrong password, an inactive vendor and a malformed email all get the same 401 message. An argon2 verify always runs, so the timing matches too (measured 201 vs 192 ms median).
  - Known trade-off: anyone can lock a vendor out for 15 min by failing 5 times. This is acceptable for now; revisit in slice 6. If we run more than one instance, move the counters to Postgres.
- **Invite-only:** no signup route. `npm run vendor:create` uses a hidden password prompt (min 10 chars) and refuses non-interactive input. `-- --reset-password` changes a password and logs that vendor out everywhere.
- **API additions beyond SPEC 6:**
  - `GET /api/auth/me`, which the app uses to check the session.
  - `POST /api/deliveries/:id/customer-link`. Tokens are stored hashed, so a link can't be shown again later. Each "Send to customer" makes a fresh link and the old one stops working.
- **Delivery code:** not generated at create time, despite SPEC 5 step 1. It's stored hashed, so it must be generated when it's shown, at `/c/:token/confirm` in slice 4.
- **Assign:** only from `ready` (or `assigned`, to re-send). The rider message uses `dropoff_postcode`, or "see map" if the customer confirmed without one.
- **Cancel:** clears both token hashes, so the customer and rider links die immediately.
- **Vendor app:** React 19 + Vite 8, with no router library (a ~40-line history router) and no `@vitejs/plugin-react` (Vite compiles the JSX itself; the only loss is component hot reload). 73 KB gzipped. Served with a strict CSP (`default-src 'self'`, no inline scripts).
- **Not done yet:** "pick a rider" from recent riders (only typing a number works). Safari won't keep `Secure` cookies on `http://localhost`, so test locally in Chrome, Edge or Firefox.

## Slice 2 build (2026-10-04)
- Postgres is on Neon (Postgres 18). The first migration was regenerated with `varchar(32)` postcodes and applied. 4 tables plus `__drizzle_migrations`.
- **Reverse radius: 50 m** (`NIPOST_REVERSE_RADIUS_M`). At 25 m, Yaba returned area-only; at 50 m it returns a medium unit, which the customer then confirms.
- **"Far" threshold: 30 m** (`NIPOST_FAR_DISTANCE_M`). All 14 high-confidence units seen so far were within 21 m.
- `needs_confirmation` is true unless the result is `high` **and** within 30 m. In that case the nearby list is fetched, and the found unit is pre-selected in the picker.
- NIPOST timeout or 5xx → one retry → `outcome: "unavailable"`, and the customer can still confirm the pin. A 401/402 is treated as our fault: it is logged (without details) and returned as `UPSTREAM_ERROR`.
- The client rejects an answer whose echoed `coordinate` isn't our point (±0.0001°), which catches a lat/lng swap on either side. Resolve also rejects points outside Nigeria's bounding box, which catches a swap from the browser.
- The customer page loads Leaflet 1.9.4 from unpkg with SRI hashes. Each request gets its own nonce and a strict CSP (`connect-src 'self'`, `default-src 'none'`).
- Test data: `npm run db:seed` creates a test vendor (no login possible) and prints a customer link.
- `/c/:token/confirm` is **not built yet** (slice 4). Pressing Confirm on the page currently shows "Something went wrong".

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

## Slice 6 hardening checklist (2026-10-05)
Verified locally with the server in production mode, unless marked as a deploy step.

### Rate limits (in memory, per instance)
- [x] Customer pages: 120 requests per minute per IP. Resolve: 30 per 10 min per link. Confirm: 10 per 10 min per link (tested: the 11th call gets 429, even from new IPs).
- [x] Rider pages: 120 per minute per IP. Actions: 60 per 10 min per link. Code guesses are separately capped at 5.
- [x] Vendor API: 600 per 10 min per IP. Login: 20 per 15 min per IP, and 5 failures per 15 min per email (slice 3).
- [x] Over the limit: `429 RATE_LIMITED` with `Retry-After`. Browsers get a "Please slow down" page.
- [x] Behind Render, `trust proxy = 1`, so limits apply to the real client IP.

### Link tokens
- [x] Random 256-bit, stored hashed (slices 2–5).
- [x] Customer and rider links stop working 7 days after the delivery closes (`TOKEN_TTL_AFTER_CLOSE_DAYS`). A cancel kills them at once. The retention job also clears expired token hashes.
- [x] Re-sending a link turns off the old one.

### Retention (NDPA 2023)
- [x] Once a delivery has been closed for 90 days (`RETENTION_DAYS`):
  - the **customer's name** is deleted (added 2026-10-05; the vendor app shows "Name removed (data retention)", migration `0004` made the column nullable);
  - customer and rider phone numbers are deleted;
  - coordinates on the delivery and its events are rounded to 3 decimals (~110 m);
  - `location_points` rows are unlinked from the delivery (`delivery_id = null`), so the postcode dataset keeps the point but not who it belongs to;
  - `redacted_at` is set.
- [x] Expired vendor sessions are deleted.
- [x] Safe to run more than once (tested: the second run changed nothing). Open deliveries are never touched.
- [x] It runs inside the API at start-up (+30 s) and every 24 h in production. Manual run: `npm run retention` (`-- --dry-run` to preview).
- [ ] **Legal review (open question for counsel):** after 90 days, the **landmark text** and the precise **`location_points` coordinates** are still kept. The landmark is free text and may mention a person or a house; the dataset points are no longer linked to a delivery or person, but they are exact locations. Confirm with counsel and NIPOST (SPEC 12) whether either needs deleting or coarsening.

### Errors and logging
- [x] Customers, riders and mistyped URLs get friendly HTML pages (404, 429, 500). The API keeps JSON errors.
- [x] Request log line: `METHOD /path STATUS ms`. Link tokens are replaced with `:token`, query strings dropped, IDs shown as `:id`. No bodies, no IPs.
- [x] Error logs show the error name only (driver messages can contain SQL parameters). NIPOST failures log the kind and status only.
- [x] Tested: 140 log lines with no tokens, phone numbers, coordinates or IPs.

### Security headers
- [x] On every response: `Referrer-Policy: no-referrer` (link tokens never leak to map tiles or CDNs), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Permissions-Policy: geolocation=(self)`, `Cross-Origin-Resource-Policy: same-origin`. HSTS in production.
- [x] Each page has its own strict CSP (customer, rider, vendor app, error pages).

### Configuration
- [x] Production refuses to start without `DATABASE_URL`, `NIPOST_API_KEY` or `DELIVERY_CODE_SECRET`, or with a non-https `PUBLIC_BASE_URL`.
- [x] Graceful shutdown on SIGTERM: finishes in-flight requests, then closes the database pool.

### Deploy to Render (deploy steps)
Two Blueprints:
- **`render.free.yaml`**, for the first phone test. Free plan; no pre-deploy migration; sleeps after 15 min idle.
- **`render.yaml`**, for later, when real vendors use it. Starter plan (~$7/month); runs migrations automatically before each deploy and stays awake.

Neither uses a Render cron job: the retention job runs inside the API.

- [ ] Create a **separate production database**: a Neon branch or project, not the dev one. Run migrations against it.
- [ ] Create the service from a Blueprint (New → Blueprint → set "Blueprint path"), in the Frankfurt region.
- [ ] Set the secrets in the Render dashboard: `DATABASE_URL`, `NIPOST_API_KEY` (a live key when you have one), `DELIVERY_CODE_SECRET` (a new random value), `PUBLIC_BASE_URL`.
- [ ] First deploy succeeds; `/health` returns `{"status":"ok","db":"ok"}`.
- [ ] Confirm `@node-rs/argon2` installs on Render (linux-x64 prebuilt). If it doesn't, switch to `bcryptjs`.
- [ ] `npm run vendor:create` against the production database, run locally with the production `DATABASE_URL` in a shell variable, not in `.env`.
- [ ] Phone test over HTTPS: vendor login, customer "Use my location", rider location prompt, the full journey.
- [ ] Optional: custom domain through Cloudflare DNS (CNAME to Render), then update `PUBLIC_BASE_URL`.
- [ ] Before launch: switch to a production map tile provider (the public OSM tile server is not for production use; SPEC 3).

### Free plan: manual commands
The free plan has no pre-deploy step and no Render Shell, so run these **on your PC** in PowerShell, pointing at the production database for that one window only.

A database URL set in the shell always wins over `.env` (checked 2026-10-05), so these never touch the dev database by mistake. Closing the window, or `Remove-Item`, clears it.

```powershell
cd C:\Users\PC\Desktop\doorlivery
$env:DATABASE_URL = "<production connection string from Neon>"

npm run db:migrate                 # BEFORE deploying any commit that adds a file in apps/api/drizzle/
npm run retention -- --dry-run     # preview what the 90-day job would change
npm run retention                  # run it now (it also runs by itself whenever the service wakes)
npm run vendor:create              # invite a vendor into production

Remove-Item Env:DATABASE_URL       # back to the dev database
```

- **Order on the free plan:** migrate first, then push/deploy. The old code still works with the new columns, because every migration so far only adds columns or relaxes a NOT NULL. On the Starter plan, `preDeployCommand` does the migrate step for you.
- **Retention on the free plan:** it runs 30 s after each start. A sleeping service wakes on the first request, so it runs at least once on any day the app is used. Running it by hand is optional.

### Known limits (after the MVP)
- Rate-limit and login counters live in memory: they reset on deploy and aren't shared between instances. Move them to Postgres if we run more than one instance.
- In production the app runs TypeScript through `tsx` (no compile step). That's fine for an MVP; add a build step if start-up time matters.
- The `failed` status exists, but nothing sets it yet. There's no UI for it.
