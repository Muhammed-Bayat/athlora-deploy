---
sidebar_position: 2
---

# Backend

The `/backend` package is the Athlora Express REST API. It owns authentication verification, coach-scoped data access, PostgreSQL persistence, result derivation, and third-party weather boundaries. API routes are mounted below `/api/v1`; `GET /health` is public. The deployed contract currently supports 100m timing, while the API/data model is the foundation for the full athletics-meet roadmap.

## Requirements

- Node.js 22 LTS recommended (Node.js 20 or later supported)
- npm
- PostgreSQL 13 or later
- An Auth0 API and SPA application for protected routes

## Run locally

```bash
cd backend
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

The API listens on `http://localhost:4000` by default. Migrations require a reachable `DATABASE_URL`; protected routes additionally require `AUTH0_DOMAIN` and `AUTH0_AUDIENCE`.

## Environment

```dotenv
DATABASE_URL=postgresql://user:password@localhost:5432/athlora
AUTH0_DOMAIN=your-tenant.eu.auth0.com
AUTH0_AUDIENCE=https://api.example.com
AUTH0_MANAGEMENT_CLIENT_ID=
AUTH0_MANAGEMENT_CLIENT_SECRET=
AUTH0_PASSWORD_RETURN_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173
PORT=4000
```

The Management API variables are required only for password-ticket creation and permanent account deletion. Keep `.env` private. `CORS_ORIGINS` accepts a comma-separated allow-list.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the API with `tsx watch`. |
| `npm run build` | Compile TypeScript to `dist/`. |
| `npm run db:migrate` | Apply pending source migrations. |
| `npm run db:migrate:prod` | Apply compiled migrations. |
| `npm start` | Migrate, then start the compiled server. |
| `npm run typecheck` | Run strict TypeScript checks. |
| `npm run test` | Run Vitest and Supertest once. |
| `npm run lint` | Run ESLint. |

## Layout

```text
src/routes        API route declarations
src/controllers   HTTP request and response handling
src/services      coach-scoped persistence and business logic
src/middleware    authentication, ownership, validation, and errors
src/validation    strict DTO and primitive parsers
src/db            pg client, migrations, row mappers, and transactions
src/types         domain DTOs and authenticated request context
```

## Database and migrations

Migrations in `src/db/migrations` are sequential, checksum-tracked SQL files. The runner records them in `schema_migrations`, takes a PostgreSQL advisory lock to prevent concurrent runs, and applies each pending migration transactionally. Do not edit an applied migration; create the next numbered migration instead.

`npm start` runs migrations before starting the production server. The schema uses `gen_random_uuid()`, so PostgreSQL 13 or later is required.

Set `TEST_DATABASE_URL` to enable the PostgreSQL integration tests. Use a separate test database because those suites create and remove application data.

## Implemented API capabilities

- Auth0 JWT verification, synchronized local users, durable account-deletion tombstones, password-ticket generation, and non-enumerating ownership checks.
- Coach-owned athlete CRUD with archive/restore, current 100m athlete statistics, results history, PBs, and SBs. Statistics will gain discipline-aware views as new events are implemented.
- Event CRUD for the current 100m slice, forward-only lifecycle transitions, cancellation that preserves history, participants, RSVPs, and event-day forecasts. The lifecycle model will be reused for the remaining athletics disciplines.
- Timeline entries for current 100m finishes, incidents, and notes with optimistic versions, soft-delete undo, transaction locks, and automatic result recomputation. Future contracts will add measured attempts, fouls, heights, relay legs, and discipline-specific result rules.
- Derived results, placement, PB/SB flags, and audited manual overrides.
- Owner-scoped dashboard aggregates and current-weather proxying for the coach console.

All failures use `{ error: { code, message, details } }`. Missing, malformed, wrong-parent, and cross-coach resources intentionally share a generic `404 NOT_FOUND` response.

## Test and verify

```bash
npm run lint
npm run typecheck
npm run test
npm run build
curl http://localhost:4000/health
```

The unit and API suites cover validation, ownership, authorization, migrations, result derivation/recomputation, account lifecycle, weather boundaries, and resource services. The database integration suites skip cleanly when `TEST_DATABASE_URL` is absent.

## Deployment

The production API is deployed to Render:

```text
https://athlora-deploy.onrender.com
```

Render builds from `/backend` with `npm ci && npm run build`, starts with `npm start`, and checks `/health`. Configure `DATABASE_URL`, all Auth0 variables required by the deployed features, `CORS_ORIGINS=https://athlora-deploy.vercel.app`, and `NODE_VERSION=22` as Render environment variables.

Create a dedicated Auth0 Machine-to-Machine application for the Management API with only `delete:users` and `create:user_tickets`. Never expose its client secret through `VITE_*` variables.

## AI declaration

This document was created with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol], and updated with the assistance of OpenCode[gpt-5.6-terra].
