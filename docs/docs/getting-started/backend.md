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
src/routes         one router per resource (athletes, events, timeline, results, auth)
src/controllers    thin HTTP handlers
src/services       pure business logic (result derivation engine, ownership, merge rules) — unit-tested
src/validation     strict shared payload parsers + primitives (UUIDs, dates, local times, enums)
src/db             pg client, checksum-tracked migrations, snake-case row mappers, transactions
src/middleware     auth, ownership, validation, error handling, not-implemented
src/types          domain DTOs (camelCase JSON) + request auth context
```

## Database

The schema is defined by sequential SQL files in `src/db/migrations`. Apply all pending migrations with:

```bash
npm run db:migrate
```

The runner records names and SHA-256 checksums in `schema_migrations`, serializes concurrent runs with a PostgreSQL advisory lock, and applies each migration transactionally. It can baseline the original six-table schema if `0001_init.sql` was applied manually before the runner existed, but rejects partial schemas and modified applied migrations. Checksums are computed over line-ending-normalized content, so they are stable across platforms (LF vs CRLF checkouts). Production `npm start` runs pending migrations before starting the API. `gen_random_uuid()` requires PostgreSQL 13+.

## Current state

- Public endpoint: `GET /health`. Legacy login/logout callback scaffolds under `/api/v1/auth` are public, while `PUT /api/v1/auth/me` verifies the Auth0 token, retrieves its `/userinfo` profile and upserts the matching application user. Application resource routes verify the token and then resolve its subject to a typed context containing the application user UUID, Auth0 ID and role. A verified identity without a `users` row receives `403 AUTH_USER_NOT_SYNCHRONIZED`. Result override/read endpoints remain scaffolded until their Stage 1 issue lands.
- The athlete roster is live: `GET /athletes` lists the coach's active roster (with `includeArchived`, `name` substring and `squad` filters and stable ordering), `POST /athletes` creates a coach-scoped athlete (`201`), `GET /athletes/:id` fetches one, `PUT /athletes/:id` fully replaces the mutable fields without touching `archivedAt`, `DELETE /athletes/:id` archives it (reversible via `POST /athletes/:id/unarchive`) while preserving its timeline entries and results. `src/services/athletes.ts` owns the SQL/mapping and returns the generic non-enumerating `404`; `src/validation/payloads.ts` adds the strict roster query parser.
- Event CRUD is live: `GET /events` lists the coach's events (with `type`, `status`, `dateFrom` and `dateTo` filters and stable date/time ordering), `POST /events` creates one with the discipline fixed to `100m` server-side (`201`), `GET /events/:id` fetches one, `PUT /events/:id` fully replaces the mutable fields and enforces the forward-only status transition, and `DELETE /events/:id` cancels it (`status = 'cancelled'`, never a row delete) so its timeline entries and results survive. `src/services/events.ts` owns the SQL/mapping, the transition table (any departure from `cancelled`, plus backward moves, return `409 INVALID_EVENT_TRANSITION`), and the in-progress logging guard used by the timeline routes (`409 EVENT_NOT_IN_PROGRESS` for any event that is not `in_progress`).
- Event participant assignment is live: `GET /events/:eventId/participants` returns stable name-ordered assignments with athlete summaries, `POST` assigns an active owned athlete with `pending` RSVP status, `PUT /events/:eventId/participants/:athleteId` idempotently replaces RSVP status, and `DELETE` removes only the assignment (`204`) while preserving timeline/results history. `src/services/participants.ts` rejects duplicate and archived new assignments with explicit `409` errors and keeps missing/cross-coach resources behind the generic `404` contract.
- Timeline mutation is live: `POST /events/:eventId/entries` records normalized 100m attempts/splits/penalties/notes (`201`), sparse `PATCH /:entryId` merges and revalidates edits with a version bump, and `DELETE /:entryId` creates a versioned tombstone (`204`) rather than deleting history. Every mutation repeats ownership and `in_progress` checks under transaction locks, then atomically rematerializes the affected result, event placings, and chronological PB/SB flags. Event type/date/time/status replacement and cancellation use the same recomputation path so derived state cannot go stale.
- Errors use the standard `{ error: { code, message, details } }` shape via `src/middleware/errors.ts`.
- `src/middleware/auth.ts` verifies Auth0 JWT issuer and audience with `jose`, resolves synchronized application users, and provides non-optional typed context accessors to protected controllers. It returns `AUTH_NOT_CONFIGURED` until both `AUTH0_DOMAIN` and `AUTH0_AUDIENCE` are set.
- `src/middleware/ownership.ts` wraps `src/services/ownership.ts` as Express route guards, providing reusable athlete, event, event/athlete, timeline entry, participant and 100m result ownership checks. Route guards use the resolved application UUID rather than payload owner/audit IDs and use one generic `404 NOT_FOUND` response for malformed, missing, wrong-parent and cross-coach resources.
- `src/validation` provides strict shared payload parsers (camelCase create/replacement/PATCH DTOs that return ordered issue lists), `src/db/row-mappers.ts` owns snake-case PostgreSQL row mapping with deliberate numeric/timestamp conversion, and `src/db/transaction.ts` provides atomic mutation/recomputation transactions.
- `src/db/client.ts` creates a `pg` pool from `DATABASE_URL`; the initial migration is applied to the Neon development database and tracked by the migration runner. `0002_contract_100m.sql` adds the MVP contract state (athlete archival, result outcomes, override audit timestamp, note storage, domain constraints and indexes) and applies cleanly to both fresh databases and the existing development database.
- The 100m data/API contract is encoded in `src/types/domain.ts` (`DISCIPLINE_100M`, `RESULT_UNIT_SECONDS`, `ResultOutcome`, aligned `Athlete`/`TimelineEntry`/`Result` DTOs plus `EventParticipant`, `AthleteStatistics` and `DashboardSummary`) and mirrored in the frontend `src/types`. `src/services/resultDerivation.ts` derives `{ value, incident, outcome }` so the API/service boundary can distinguish no result, a valid finish, DQ, DNF and DNS — including competition/training timing rules, manual override, placings and PB/SB.
- Tests: Vitest + Supertest (app routes, athlete, event, participant and timeline route suites), middleware/application-user resolution, ownership/non-disclosure checks, athlete/event/participant/timeline services, validation and row-mapping, result derivation, and migration tests (unit-mocked runner behavior plus real-DB integration suites gated behind `TEST_DATABASE_URL` that skip when unset). Runs with `npm run test` (245 passing; 29 database integration tests skip when `TEST_DATABASE_URL` is unset).

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
