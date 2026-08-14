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
CORS_ORIGINS=http://localhost:5173
PORT=4000
```

Real values are never committed — only `.env.example` templates are versioned.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server with reload (`tsx watch`) |
| `npm run build` | Compile TS to `dist/` |
| `npm run db:migrate` | Apply pending SQL migrations to `DATABASE_URL` |
| `npm start` | Apply compiled migrations, then run the compiled server |
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

The schema is defined by sequential SQL files in `src/db/migrations`. Apply all pending migrations with:

```bash
npm run db:migrate
```

The runner records names and SHA-256 checksums in `schema_migrations`, serializes concurrent runs with a PostgreSQL advisory lock, and applies each migration transactionally. It can baseline the original six-table schema if `0001_init.sql` was applied manually before the runner existed, but rejects partial schemas and modified applied migrations. Checksums are computed over line-ending-normalized content, so they are stable across platforms (LF vs CRLF checkouts). Production `npm start` runs pending migrations before starting the API. `gen_random_uuid()` requires PostgreSQL 13+.

## Current state

- Public endpoint: `GET /health`. Legacy login/logout callback scaffolds under `/api/v1/auth` are public, while `PUT /api/v1/auth/me` verifies the Auth0 token, retrieves its `/userinfo` profile and upserts the matching application user. Application resource routes verify the token and then resolve its subject to a typed context containing the application user UUID, Auth0 ID and role. A verified identity without a `users` row receives `403 AUTH_USER_NOT_SYNCHRONIZED`. Athlete/event list handlers return empty lists after authentication, while CRUD and timeline/results mutations return `NOT_IMPLEMENTED` until Stage 1 features land.
- Errors use the standard `{ error: { code, message, details } }` shape via `src/middleware/errors.ts`.
- `src/middleware/auth.ts` verifies Auth0 JWT issuer and audience with `jose`, resolves synchronized application users, and provides non-optional typed context accessors to protected controllers. It returns `AUTH_NOT_CONFIGURED` until both `AUTH0_DOMAIN` and `AUTH0_AUDIENCE` are set.
- `src/services/ownership.ts` provides reusable athlete, event, event/athlete, timeline entry, participant and 100m result ownership checks. Route guards use the resolved application UUID rather than payload owner/audit IDs and use one generic `404 NOT_FOUND` response for malformed, missing, wrong-parent and cross-coach resources.
- `src/db/client.ts` creates a `pg` pool from `DATABASE_URL`; the initial migration is applied to the Neon development database and tracked by the migration runner. `0002_contract_100m.sql` adds the MVP contract state (athlete archival, result outcomes, override audit timestamp, note storage, domain constraints and indexes) and applies cleanly to both fresh databases and the existing development database.
- The 100m data/API contract is encoded in `src/types/domain.ts` (`DISCIPLINE_100M`, `RESULT_UNIT_SECONDS`, `ResultOutcome`, aligned `Athlete`/`TimelineEntry`/`Result` DTOs plus `EventParticipant`, `AthleteStatistics` and `DashboardSummary`) and mirrored in the frontend `src/types`. `src/services/resultDerivation.ts` derives `{ value, incident, outcome }` so the API/service boundary can distinguish no result, a valid finish, DQ, DNF and DNS.
- Tests: Vitest + Supertest (app routes), middleware/application-user resolution, ownership/non-disclosure checks, result derivation, and migration tests (unit-mocked runner behavior plus a real-DB integration suite gated behind `TEST_DATABASE_URL` that skips when unset). Runs with `npm run test` (60 passing; 6 additional database tests skip when `TEST_DATABASE_URL` is unset).

## Deployment

The backend is deployed to **Render** at:

```text
https://athlora-deploy.onrender.com
```

`GET /health` is publicly available at `https://athlora-deploy.onrender.com/health`. Render builds from the private GitHub deployment mirror because the university Gitea repository cannot be connected directly. Gitea remains the source of truth and pushes are mirrored to GitHub.

Render configuration:

```text
Region: Frankfurt
Root directory: backend
Build command: npm ci && npm run build
Start command: npm start
Health check path: /health
```

The service requires `DATABASE_URL`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `CORS_ORIGINS=https://athlora-deploy.vercel.app`, and `NODE_VERSION=22`. Multiple allowed frontend origins can be provided as a comma-separated list. Secrets are configured in Render and are never committed.

## AI declaration

This document was generated with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol].
