# Doorlivery

Delivery location MVP for Nigerian social-commerce vendors: buyers confirm a map pin, we turn it into a NIPOST postcode, riders get a no-app WhatsApp link. See `SPEC.md`.

## Layout
- `apps/api`: Express + Drizzle (Postgres)
- `apps/web`: vendor app (React + Vite, slice 3)
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
npm run probe:nipost   # needs NIPOST_API_KEY in .env
npm run db:generate    # create a migration after changing apps/api/src/db/schema.ts
npm run db:migrate     # apply migrations (needs DATABASE_URL in .env)
npm run db:seed        # dev only: create a test delivery and print its customer link
npm test
npm run typecheck
```
