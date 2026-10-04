# SPEC: Delivery Location MVP (NIPOST Postcode L1)

Version 0.1 · Owner: Uncle Dee · Audience: Claude Code (and any developer)

## 0. Working agreements (read first)
- Environment is **Windows + PowerShell**. Give shell commands in PowerShell syntax.
- Make **surgical edits** (targeted find-and-replace on the exact lines that change). Do not rewrite whole files unless asked.
- **Never** print, log, commit or hardcode secrets. Keys live in `.env` (gitignored). Provide `.env.example` with placeholder names only.
- Build **one slice at a time** (section 10). After each slice: say what changed, how to run it, and how to test it. Stop and wait before starting the next slice.
- If something here is marked **(unverified)**, do not guess. Probe it, record what you found in `docs/notes.md`, then adapt.
- Ask before adding any dependency not listed in section 3.

## 1. Product in one paragraph
A web service for Instagram/WhatsApp vendors in Nigeria to get packages to buyers without confusing phone calls. The vendor creates a delivery. The **buyer** confirms their exact location with a map pin, and we turn it into a NIPOST postcode. The **rider** gets a WhatsApp link (no app, no account) showing pickup, drop-off, a map button and notes, and taps Delivered after typing the buyer's 4-digit code. Every confirmed delivery stores a verified postcode-to-coordinates pair, which becomes our own location dataset.

**Two products, built in this order:**
1. **Delivery app (this spec):** vendor web app + customer link + rider link.
2. **Public address API for other developers (later, not in this spec):** a developer portal with sign-up, keys, docs and billing. For now, our internal API is simply the backend for the delivery app.

## 2. Scope
**In scope (v0.1):** vendor login (invite-only), create delivery, customer pin page, postcode via NIPOST reverse geocode, rider link page, delivery code confirmation, delivery status, `wa.me` links for sending messages.
**Out of scope:** WhatsApp Business API, SMS, voice calls, local languages, payments, vendor self-signup, developer portal, NIPOST access level L2+, routing engine, live rider tracking, maps beyond the pin picker.

## 3. Stack
- **Language:** TypeScript everywhere (Node LTS).
- **API:** Express. Validation with Zod.
- **Web (vendor app):** React + Vite.
- **Customer and rider pages:** server-rendered HTML from Express (small, fast on weak networks). Customer page may load Leaflet for the map; rider page loads no framework and stays under 100 KB.
- **Database:** PostgreSQL (managed). Plain `latitude`/`longitude` double columns for now. PostGIS can be added later.
- **ORM/migrations:** Drizzle (or Prisma if preferred, choose one).
- **Map tiles:** Leaflet + a tile provider. The public OpenStreetMap tile server has usage limits, so make the tile URL a config value **(verify terms before launch)**.
- **Hosting:** API on Render, vendor app on Vercel, Cloudflare for DNS.
- **Monorepo layout:** `apps/api`, `apps/web`, `packages/shared` (types), `docs/`.

## 4. NIPOST API (external dependency)
Base URL `https://api.postcode.gov.ng`. Auth header: `X-API-Key: <key>`. Call it **server-side only**; the key must never reach a browser.

| Call | Purpose | Notes |
|---|---|---|
| `GET /v1/search/reverse?lat=&lng=&max_distance_m=` | Pin to postcode | Default radius 25 m, max 250 m. Returns `found`, `unit.postcode`, `unit.distance_m`, `unit.confidence` (high/medium/low), plus `area`, `district`, `state` codes. Names and address text need L2+, so ignore them. When nothing is in range, `found=false` with a `message`. |
| `GET /v1/search/nearby?lat=&lng=&radius=` | Postcodes near a point | Default radius 300 m. Response fields **(unverified)**. |
| `GET /v1/lookup?code=&level=1` | Validate a typed postcode | Response shape **(unverified)**. |

Errors observed: a missing key returns `{"error":{"code":"auth_required","message":"..."}}`. Plan for 401/403, 402 (no credits), 429 (rate limit) and 5xx.

**Test-key behaviour is unknown (unverified).** A test key may only return sample data.

**First task (before any feature):** write `scripts/probe-nipost.ts` that calls the three endpoints with sample coordinates and codes, then saves the raw JSON responses to `docs/nipost-samples/`. Build the TypeScript types from those real responses, not from this table.

## 5. Users and flows
**Vendor** (logged in): creates a delivery, copies the customer link, picks or types a rider number, copies the rider message, watches status.
**Customer** (no account): opens link, shares location or drags a pin, sees the postcode, confirms, sees a 4-digit delivery code.
**Rider** (no account): opens link, sees job details, taps Open Map, taps Arrived, types the code, taps Delivered.

**Delivery status:** `created` → `awaiting_customer` → `ready` → `assigned` → `picked_up` → `arrived` → `delivered`. Also `failed` and `cancelled`.

**Core sequence:**
1. Vendor submits the form (pickup description, customer name and phone, item note, rider phone optional). System creates the delivery, a customer token and a 4-digit code.
2. Vendor taps "Send to customer", which opens `https://wa.me/<phone>?text=<prefilled message with link>`.
3. Customer confirms the pin. System calls reverse geocode and stores the point. Status becomes `ready`.
4. Vendor taps "Send to rider", which opens a `wa.me` link with the rider message and rider link. Status becomes `assigned`.
5. Rider opens the link. Buttons set `picked_up` and `arrived`.
6. At handover the rider enters the code. If correct, status becomes `delivered` and the rider's GPS (if allowed) is stored as the verified drop-off point.

## 6. Internal API
JSON, `snake_case`, UUID ids, ISO 8601 timestamps. Error format: `{ "error": true, "message": "...", "code": "VALIDATION_ERROR" }`. Codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `RATE_LIMITED`, `UPSTREAM_ERROR`, `SERVER_ERROR`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | none | Vendor login (email + password), sets httpOnly session cookie |
| POST | `/api/auth/logout` | vendor | End session |
| POST | `/api/deliveries` | vendor | Create delivery |
| GET | `/api/deliveries` | vendor | List own deliveries (paginated, `page`, `limit` max 100) |
| GET | `/api/deliveries/:id` | vendor | Detail plus event timeline |
| POST | `/api/deliveries/:id/assign` | vendor | Set rider phone, generate rider token |
| POST | `/api/deliveries/:id/cancel` | vendor | Cancel |
| GET | `/c/:token` | token | Customer page (HTML) |
| POST | `/c/:token/resolve` | token | Body: `lat`, `lng`, `accuracy_m`. Returns postcode, confidence, nearby options |
| POST | `/c/:token/confirm` | token | Body: chosen `postcode`, `lat`, `lng`, optional `landmark_note`. Sets `ready`, returns the 4-digit code |
| GET | `/r/:token` | token | Rider page (HTML) |
| POST | `/r/:token/event` | token | Body: `picked_up` or `arrived` |
| POST | `/r/:token/delivered` | token | Body: `code`, optional `lat`, `lng`, `accuracy_m` |

Rules: public tokens are random (at least 128 bits), stored **hashed**, expire 7 days after the delivery closes. Rate limit per IP and per token. Delivery code: max 5 wrong attempts, then lock and notify the vendor on their dashboard.

## 7. Data model (PostgreSQL)
All tables: `id uuid pk`, `created_at timestamptz`, `updated_at timestamptz`.

- `vendors`: `email` (unique), `password_hash`, `business_name`, `phone`, `is_active`
- `deliveries`: `vendor_id`, `pickup_note`, `customer_name`, `customer_phone`, `item_note`, `status`, `code_hash`, `code_attempts`, `customer_token_hash`, `rider_token_hash`, `rider_phone`, `dropoff_postcode`, `dropoff_lat`, `dropoff_lng`, `dropoff_confidence`, `landmark_note`, `delivered_at`
- `delivery_events`: `delivery_id`, `event_type`, `actor` (vendor/customer/rider/system), `lat`, `lng`, `accuracy_m`, `occurred_at`
- `location_points`: `postcode`, `latitude`, `longitude`, `accuracy_m`, `confidence`, `source` (customer_pin / rider_confirm), `delivery_id`

Indexes: unique `vendors.email`; `deliveries(vendor_id, created_at desc)`; unique token-hash columns; `location_points(postcode)`.
Status stored as `varchar` with a CHECK constraint.

**Privacy flags:** `customer_phone`, `rider_phone` and all coordinates are personal data (Nigeria Data Protection Act 2023). Store the minimum, add a configurable retention job (default 90 days) that deletes phone numbers and coarsens coordinates on closed deliveries, and never log phone numbers or coordinates in plain application logs.

## 8. Pages
**Vendor app (React):** login; delivery list with status badges; new delivery form; delivery detail with timeline and two buttons ("Send to customer", "Send to rider") that open `wa.me`. Mobile-first.

**Customer page `/c/:token`:** short headline naming the vendor, a "Use my location" button, a draggable pin map, the resulting postcode with a plain-language confidence note ("We're confident" / "Please check the pin"), a nearby-postcodes picker shown when confidence is not high, a landmark text box, a Confirm button, then a screen showing the 4-digit code with the instruction "Give this code to the rider only when you receive your package."

**Rider page `/r/:token`:** large text, high contrast, thumb-sized buttons. Top to bottom: pickup note, drop-off postcode and landmark, "Open Map" (link to the coordinates in the phone's maps app), "Call customer", "I have picked up", "I have arrived", code input and "Delivered". Ask permission for location only when the rider taps Delivered, with one short sentence of explanation. Works if permission is denied (the delivery still completes, but no verified point is stored).

## 9. Message templates (English for v0.1, plain, short)
- **Customer:** "Hello {customer_name}, {business_name} is sending your order. Please confirm where to deliver it here: {link}"
- **Rider:** "Delivery from {business_name}. Pickup: {pickup_note}. Drop-off postcode: {postcode}. Open details and map: {link}"

## 10. Build slices (do in order)
1. **Foundation:** monorepo, TypeScript, Express health check, Postgres connection, migrations, `.env.example`, `scripts/probe-nipost.ts` and saved samples. *Accept:* probe runs and samples exist; `GET /health` returns ok.
2. **Pin to postcode:** server-side NIPOST client with typed responses, timeouts and retries; `POST /c/:token/resolve` and the customer map page (using a seeded test delivery). *Accept:* dropping a pin in a covered area shows a postcode and confidence; not-found shows a friendly fallback.
3. **Vendor and deliveries:** auth, create/list/detail, `wa.me` buttons. *Accept:* a vendor can create a delivery and send the customer link from their phone.
4. **Customer confirm and code:** `/c/:token/confirm`, store `location_points`, generate code. *Accept:* delivery reaches `ready`.
5. **Rider page and completion:** `/r/:token`, events, code check with lockout, rider GPS capture. *Accept:* full happy path from create to delivered, plus wrong-code lockout.
6. **Hardening:** rate limits, token expiry, retention job, error pages, basic logging without personal data, deployment to Render and Vercel. *Accept:* checklist in `docs/notes.md` ticked.

## 11. Non-functional targets
- Rider page loads in under 3 seconds on a 3G connection and under 100 KB.
- NIPOST calls time out at 5 seconds with one retry; on failure the customer page lets them save a pin anyway (postcode `pending`) so the delivery is never blocked.
- All user-facing text is in one file, so languages can be added later.

## 12. Open questions (resolve and record in `docs/notes.md`)
- Does a test key return real data? Coverage and accuracy in Lagos?
- Rate limits and credit cost for L1 calls?
- May we store NIPOST-derived responses and our own pin data? (Ask NIPOST in writing; until answered, store only our own coordinates plus the postcode string.)
- Map tile provider and terms for production.
