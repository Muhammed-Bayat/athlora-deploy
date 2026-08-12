---
sidebar_position: 2
---

# Backend (Express + TypeScript)

The REST API lives in `/backend`. All routes are prefixed `/api/v1`. It is deployed separately from the frontend.

## Requirements

- Node.js 20+
- npm
- PostgreSQL (local, Neon, or university instance) for DB features
- Auth0 tenant (optional during scaffolding — protected routes return `AUTH_NOT_CONFIGURED` until configured)

## Install & run

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

`npm run dev` runs the API with hot reload via `tsx` (default `http://localhost:4000`).

## Environment

`.env.example`:

```
DATABASE_URL=
AUTH0_DOMAIN=
AUTH0_AUDIENCE=
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=
PORT=4000
```

Real values are never committed — only `.env.example` templates are versioned.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server with reload (`tsx watch`) |
| `npm run build` | Compile TS to `dist/` |
| `npm start` | Run the compiled server (`node dist/server.js`) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run test` | Vitest + Supertest, single run |
| `npm run lint` | ESLint (flat config) |

## Layout

```
src/routes        one router per resource (athletes, events, timeline, results, auth)
src/controllers   thin HTTP handlers
src/services      pure business logic (result derivation, merge rules) — unit-tested
src/db            pg client + migrations
src/middleware    auth, error handling, not-implemented
src/types         domain DTOs (camelCase JSON)
```

## Database

The schema is defined in `src/db/migrations/0001_init.sql`. Apply it to your database:

```bash
psql "$DATABASE_URL" -f src/db/migrations/0001_init.sql
```

Automatic migration runner arrives in Stage 1. `gen_random_uuid()` requires PostgreSQL 13+.

## Deployment

Skeleton deploys to **Render** (see the dev plan, Stage 1).