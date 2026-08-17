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

- Public endpoint: `GET /health`. Legacy login/logout callback scaffolds under `/api/v1/auth` are public, while `PUT /api/v1/auth/me` verifies the Auth0 token, retrieves its `/userinfo` profile and upserts the matching application user. Application resource routes verify the token and then resolve its subject to a typed context containing the application user UUID, Auth0 ID and role. A verified identity without a `users` row receives `403 AUTH_USER_NOT_SYNCHRONIZED`.
- The athlete roster is live: `GET /athletes` lists the coach's active roster (with `includeArchived`, `name` substring and `squad` filters and stable ordering), `POST /athletes` creates a coach-scoped athlete (`201`), `GET /athletes/:id` fetches one, `PUT /athletes/:id` fully replaces the mutable fields without touching `archivedAt`, `DELETE /athletes/:id` archives it (reversible via `POST /athletes/:id/unarchive`) while preserving its timeline entries and results. `src/services/athletes.ts` owns the SQL/mapping and returns the generic non-enumerating `404`; `src/validation/payloads.ts` adds the strict roster query parser.
- Event CRUD is live: `GET /events` lists the coach's events (with `type`, `status`, `dateFrom` and `dateTo` filters and stable date/time ordering), `POST /events` creates one with the discipline fixed to `100m` server-side (`201`), `GET /events/:id` fetches one, `PUT /events/:id` fully replaces the mutable fields and enforces the forward-only status transition, and `DELETE /events/:id` cancels it (`status = 'cancelled'`, never a row delete) so its timeline entries and results survive. `src/services/events.ts` owns the SQL/mapping, the transition table (any departure from `cancelled`, plus backward moves, return `409 INVALID_EVENT_TRANSITION`), and the in-progress logging guard used by the timeline routes (`409 EVENT_NOT_IN_PROGRESS` for any event that is not `in_progress`).
- Event participant assignment is live: `GET /events/:eventId/participants` returns stable name-ordered assignments with athlete summaries, `POST` assigns an active owned athlete with `pending` RSVP status, `PUT /events/:eventId/participants/:athleteId` idempotently replaces RSVP status, and `DELETE` removes only the assignment (`204`) while preserving timeline/results history. `src/services/participants.ts` rejects duplicate and archived new assignments with explicit `409` errors and keeps missing/cross-coach resources behind the generic `404` contract.
- Timeline persistence is live: `GET /events/:eventId/entries` returns the active log in stable chronological order, `POST` records normalized 100m attempts/splits/penalties/notes (`201`), sparse `PATCH /:entryId` requires `expectedVersion` and edits only observation content, and `DELETE /:entryId` requires `expectedVersion` and creates a tombstone (`204`) rather than deleting history. Stale mutations return `409 TIMELINE_ENTRY_VERSION_CONFLICT`; an exact repeated undo is a no-op without another version/timestamp bump, including after the event closes. Ownership, parent IDs, lifecycle, version comparison, mutation and result/placing/PB/SB recomputation are enforced under transaction locks.
- Result reads and overrides are live under `/events/:eventId/results`. Override writes preserve the raw derived outcome/value and use the canonical whole-event recomputation path so placings and every affected PB/SB flag stay aligned.
- Athlete statistics are live at `GET /athletes/:id/statistics`: PB, calendar-year SB, current/all-time/type counts, effective latest result, and the ten most recent competition and training results. Cancelled rows remain visible as non-scoring history, incidents remain void, and archived owned athletes remain directly queryable.
- Dashboard aggregates are live at `GET /dashboard/summary`: stable summary/live state, deterministic earliest ordered `in_progress` event, live progress/latest entries, active/all/archived roster counts, active roster PB snapshot, scheduled upcoming events, recent effective results, and recent PBs. Every aggregate query is owner-scoped and runs in one repeatable-read, read-only transaction.
- Errors use the standard `{ error: { code, message, details } }` shape via `src/middleware/errors.ts`.
- `src/middleware/auth.ts` verifies Auth0 JWT issuer and audience with `jose`, resolves synchronized application users, and provides non-optional typed context accessors to protected controllers. It returns `AUTH_NOT_CONFIGURED` until both `AUTH0_DOMAIN` and `AUTH0_AUDIENCE` are set.
- `src/middleware/ownership.ts` wraps `src/services/ownership.ts` as Express route guards, providing reusable athlete, event, event/athlete, timeline entry, participant and 100m result ownership checks. Route guards use the resolved application UUID rather than payload owner/audit IDs and use one generic `404 NOT_FOUND` response for malformed, missing, wrong-parent and cross-coach resources.
- `src/validation` provides strict shared payload parsers (camelCase create/replacement/PATCH DTOs that return ordered issue lists), `src/db/row-mappers.ts` owns snake-case PostgreSQL row mapping with deliberate numeric/timestamp conversion, and `src/db/transaction.ts` provides atomic mutation/recomputation transactions.
- `src/db/client.ts` creates a `pg` pool from `DATABASE_URL`; migrations are checksum-tracked and applied before production startup. `0002_contract_100m.sql` adds the MVP contract state, and `0003_aggregate_indexes.sql` adds athlete-result, owner/event-order and active-timeline lookup indexes for the new read APIs.
- The 100m data/API contract is encoded in `src/types/domain.ts` (`DISCIPLINE_100M`, `RESULT_UNIT_SECONDS`, `ResultOutcome`, aligned `Athlete`/`TimelineEntry`/`Result` DTOs plus `EventParticipant`, `AthleteStatistics` and `DashboardSummary`) and mirrored in the frontend `src/types`. `src/services/resultDerivation.ts` derives `{ value, incident, outcome }` so the API/service boundary can distinguish no result, a valid finish, DQ, DNF and DNS — including competition/training timing rules, manual override, placings and PB/SB.
- Tests: Vitest + Supertest cover app/resource/aggregate routes, application-user resolution, ownership/non-disclosure, athlete/event/participant/timeline/statistics/dashboard services, validation, row mapping, result derivation/recomputation and migrations. Real-DB suites are gated behind `TEST_DATABASE_URL`. Runs with `npm run test` (269 passing; 34 database integration tests skip when `TEST_DATABASE_URL` is unset).

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
