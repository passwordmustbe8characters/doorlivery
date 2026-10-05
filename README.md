# Doorlivery

Delivery location MVP for Nigerian social-commerce vendors: buyers confirm a map pin, we turn it into a NIPOST postcode, riders get a no-app WhatsApp link. See `SPEC.md`.

## Layout
- `apps/api`: Express + Drizzle (Postgres)
- `apps/web`: vendor app (React + Vite), served by the API in production
- `packages/shared`: shared types
- `scripts/probe-nipost.ts`: saves raw NIPOST responses to `docs/nipost-samples/`
- `docs/notes.md`: findings and decisions

## Setup (PowerShell)
```powershell
npm install
Copy-Item .env.example .env   # only if .env does not exist yet; then fill in values
```

## Commands
```powershell
npm run dev:api        # API on http://localhost:4000 (GET /health)
npm run dev:web        # vendor app on http://localhost:5173 (proxies /api to :4000)
npm run vendor:create  # invite a vendor (hidden password prompt); add -- --reset-password to change one
npm run build          # build the vendor app into apps/web/dist
npm start              # production: API + built vendor app on one origin
npm run probe:nipost   # needs NIPOST_API_KEY in .env
npm run db:generate    # create a migration after changing apps/api/src/db/schema.ts
npm run db:migrate     # apply migrations (needs DATABASE_URL in .env)
npm run db:seed        # dev only: create a test delivery and print its customer link
npm run retention      # data retention job once (add -- --dry-run to preview)
npm test
npm run typecheck
```

## Deploy (Render)
One web service serves everything (API, vendor app, customer and rider pages). Secrets are set in the
Render dashboard, never in the repo.
- `render.free.yaml`: free plan, for a first test. Migrations and retention are run by hand; see
  "Free plan: manual commands" in `docs/notes.md`.
- `render.yaml`: Starter plan, for real use. Migrations run automatically before each deploy.
