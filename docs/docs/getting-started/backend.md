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
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
NOMINATIM_USER_AGENT=Athlora/0.2 (https://example.com/contact)
GEMINI_API_KEY=
```

The Management API variables are required only for password-ticket creation and permanent account deletion. Keep `.env` private. `CORS_ORIGINS` accepts a comma-separated allow-list for both HTTP and Socket.IO. `NOMINATIM_BASE_URL` is server-only and normally remains the public default. Set `NOMINATIM_USER_AGENT` to an identifiable application/contact string before deployment, as required by the Nominatim public usage policy. `GEMINI_API_KEY` is required for the AI voice assistant token endpoint.

The Playwright E2E suite runs the backend on port `4100` with `CORS_ORIGINS=http://localhost:5174` (see the E2E section in `getting-started/scripts.md`).

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
src/routes        API route declarations (auth, ai, athletes, clubs, comparison, dashboard,
                  eventHelpers, fixtures, fixtureNotifications, injuries, participants,
                  publicLoggers, results, statistics, sync, timeline, venues, weather, workspaces)
src/controllers   HTTP request and response handling
src/services      coach-scoped persistence and business logic (28 modules)
src/middleware    authentication, ownership, capabilities, validation, errors, notImplemented
src/validation    strict DTO and primitive parsers
src/db            pg client, migrations (21 files), row mappers, and transactions
src/types         domain DTOs and authenticated request context
```

## Database and migrations

Migrations in `src/db/migrations` are sequential, checksum-tracked SQL files. The runner records them in `schema_migrations`, takes a PostgreSQL advisory lock to prevent concurrent runs, and applies each pending migration transactionally. Do not edit an applied migration; create the next numbered migration instead.

`npm start` runs migrations before starting the production server. The schema uses `gen_random_uuid()`, so PostgreSQL 13 or later is required.

Set `TEST_DATABASE_URL` to enable the PostgreSQL integration tests. Use a separate test database because those suites create and remove application data.

## Implemented API capabilities

- Auth0 JWT verification, synchronized local users, durable account-deletion tombstones, password-ticket generation, and non-enumerating ownership checks.
- Coach-owned athlete CRUD with archive/restore, current 100m athlete statistics, results history, PBs, and SBs. Statistics will gain discipline-aware views as new events are implemented.
- Workspace-scoped active injury summaries for roster cards, grouped server-side to avoid an injury request for every athlete. Resolved and deleted records remain available through athlete injury history but never appear in compact summaries.
- Event CRUD for the current 100m slice, forward-only lifecycle transitions, cancellation that preserves history, participants, RSVPs, and event-day forecasts. The lifecycle model will be reused for the remaining athletics disciplines.
- Cross-workspace 100m fixtures with hashed invitations, independent participating-team status, guest roster isolation, revision reacceptance, withdrawals, timeline logging, and result correction.
- Timeline entries for current 100m finishes, incidents, and notes with optimistic versions, soft-delete undo, transaction locks, and automatic result recomputation. Future contracts will add measured attempts, fouls, heights, relay legs, and discipline-specific result rules.
- Online event updates use Socket.IO after a successful HTTP mutation. Connections present an Auth0 token and explicitly subscribe to one event; server-side checks require current workspace membership, accepted fixture participation, or an active helper grant. Messages are typed invalidations (`realtime:invalidate`) with a unique ID, event ID, affected resources, and timestamp. Clients always refetch canonical HTTP state, so an unavailable, duplicate, or stale message cannot create a false write result. Helper grants lose event-room access after revocation and after the two-hour read-only window following completion or cancellation.
- Derived results, placement, PB/SB flags, and audited manual overrides.
- Owner-scoped dashboard aggregates and current-weather proxying for the coach console.
- Optional OpenStreetMap venue lookup through an authenticated Nominatim boundary. It has strict `q` validation, a five-second timeout, safe provider errors, a five-minute process-memory cache, and a one-second process-local provider throttle. The public provider receives only an explicit submitted venue query, never Auth0 credentials or client requests on each keystroke.
- Injury CRUD with body-region/area/side/severity mapping, resolution/reopening, and soft-delete. Active summaries are workspace-scoped and grouped for roster display.
- Two-athlete 100m comparison with PB, latest result, valid count, average, consistency, and improvement metrics.
- Athlete progression endpoint with cursor-based pagination, running PB indicator, effective result/outcome, and type filtering.
- Event helper invitations with secret/human-code redemption, grant lifecycle, and offline-logger designation/transfer. Only one grant per event may be the offline logger.
- Public logger links: coaches create shareable token-authenticated links; external guests start sessions, view event snapshots, and record entries without Auth0.
- Fixture notifications: in-app notification system for fixture invitations, reacceptance, and response events with unread counts.
- Gemini AI token endpoint: creates short-lived Gemini API tokens for the frontend voice assistant. The backend does not relay audio; the browser streams directly to Gemini's BidiGenerateContentConstrained WebSocket.
- Offline sync batch endpoint: processes arrays of `create_entry`/`edit_entry`/`undo_entry` actions with per-action idempotent receipt processing, duplicate detection, and optimistic version conflict handling.
- Capability middleware for feature-flag gating, validation middleware for strict payload checking, and not-implemented stubs for legacy routes.

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
The runner records names and SHA-256 checksums in `schema_migrations`, serializes concurrent runs with a PostgreSQL advisory lock, and applies each migration transactionally. It can baseline the original six-table schema if `0001_init.sql` was applied manually before the runner existed, but rejects partial schemas and modified applied migrations. Checksums are computed over line-ending-normalized content, so they are stable across platforms (LF vs CRLF checkouts). Production `npm start` runs pending migrations before starting the API. `gen_random_uuid()` requires PostgreSQL 13+.

## Current state

- Public endpoint: `GET /health`. `PUT /api/v1/auth/me` synchronizes the matching application user and creates one default UTC workspace for new users. Protected routes resolve a typed user and active workspace membership; clients select a membership with `X-Workspace-Id` or use the default. `GET /api/v1/workspaces` lists accessible workspaces.
- Account deletion writes a durable tombstone before calling Auth0, then removes only the deleted user's memberships. The local user row, shared workspace data, and creator/recorder/override attribution remain as audit placeholders.
- The athlete roster and events are workspace-scoped. `coach_id` and `created_by` retain the authenticated actor for attribution, while `workspace_id` is the sole authorization scope. Migration `0005_workspace_tenancy.sql` losslessly backfills one workspace per existing user, preserves all domain IDs/history, adds memberships, workspace timezone defaults, and optional event timezone overrides. Migration `0006_workspace_roles_and_invitations.sql` limits workspace access to coaches and assistants. Both roles have operational event and logger access; coaches alone manage members, expiring email-bound invitations, Club join requests, participant rosters, and fixture-team withdrawals.
- Event CRUD is live: `GET /events` lists the coach's events (with `type`, `status`, `dateFrom` and `dateTo` filters and stable date/time ordering), `POST /events` creates one with the discipline fixed to `100m` server-side (`201`), `GET /events/:id` fetches one, `PUT /events/:id` fully replaces the mutable fields and enforces the forward-only status transition, and `DELETE /events/:id` cancels it (`status = 'cancelled'`, never a row delete) so its timeline entries and results survive. `src/services/events.ts` owns the SQL/mapping, the transition table (any departure from `cancelled`, plus backward moves, return `409 INVALID_EVENT_TRANSITION`), and the in-progress logging guard used by the timeline routes (`409 EVENT_NOT_IN_PROGRESS` for any event that is not `in_progress`).
- Fixture routes let a host invite guest workspaces to a scheduled 100m competition without granting general workspace access. Guest reads use fully qualified event projections and expose only fixture metadata plus that workspace's roster, timeline entries, and results. Migration `0010_fixture_workspace_status_index.sql` permits the host and multiple guests to independently share statuses such as `accepted`.
- Event forecasts are live at `GET /events/:id/weather`: after authentication and event ownership checks, `src/services/weather.ts` fetches Open-Meteo's venue-local 16-day daily series for the stored coordinates, validates its schema/units, and returns only the matching event-day DTO. Missing coordinates/dates, no data, five-second timeouts, upstream failures and malformed responses use explicit safe errors; no API key or provider payload is exposed.
- Venue lookup is live at `GET /venues/search?q=`. `src/services/venues.ts` owns native-fetch Nominatim access, response reduction and public-policy cache/throttle behavior; `src/validation/payloads.ts` rejects anything except one nonblank query of at most 200 characters. It does not persist provider IDs or alter event storage. Unit/API tests inject or mock the boundary, so they make no public OSM request.
- Athlete lifecycle is live: `active`, `inactive`, and `archived` states are workspace-authorized, actor-attributed, and idempotent. `POST /athletes/:id/status` records real transitions in `athlete_status_transitions`; archive/restore routes remain available. Inactive athletes stay editable, archived athletes are read-only, and both are rejected from new event assignments.
- Event participant assignment is live: `GET /events/:eventId/participants` returns stable name-ordered assignments with athlete summaries, `POST` assigns an active owned athlete with `pending` RSVP status, `PUT /events/:eventId/participants/:athleteId` idempotently replaces RSVP status, and `DELETE` removes only the assignment (`204`) while preserving timeline/results history. Lifecycle changes create independent per-event/athlete review items acknowledged through `POST /events/:eventId/participants/:athleteId/status-review/acknowledge`. `src/services/participants.ts` rejects duplicate, inactive, and archived new assignments with explicit `409` errors and keeps missing/cross-coach resources behind the generic `404` contract.
- Timeline persistence is live: `GET /events/:eventId/entries` returns the active log in stable chronological order, `POST` records normalized 100m attempts/splits/penalties/notes (`201`), sparse `PATCH /:entryId` requires `expectedVersion` and edits only observation content, and `DELETE /:entryId` requires `expectedVersion` and creates a tombstone (`204`) rather than deleting history. Stale mutations return `409 TIMELINE_ENTRY_VERSION_CONFLICT`; an exact repeated undo is a no-op without another version/timestamp bump, including after the event closes. Ownership, parent IDs, lifecycle, version comparison, mutation and result/placing/PB/SB recomputation are enforced under transaction locks.
- Result reads and overrides are live under `/events/:eventId/results`. Override writes preserve the raw derived outcome/value and use the canonical whole-event recomputation path so placings and every affected PB/SB flag stay aligned.
- Athlete statistics are live at `GET /athletes/:id/statistics`: PB, calendar-year SB, current/all-time/type counts, effective latest result, and the ten most recent competition and training results. Cancelled rows remain visible as non-scoring history, incidents remain void, and archived owned athletes remain directly queryable.
- Dashboard aggregates are live at `GET /dashboard/summary`: stable summary/live state, deterministic earliest ordered `in_progress` event, live progress/latest entries, active/inactive/archived roster counts, pending status-review count, active roster PB snapshot, scheduled upcoming events, recent effective results, and recent PBs. Every aggregate query is owner-scoped and runs in one repeatable-read, read-only transaction.
- Errors use the standard `{ error: { code, message, details } }` shape via `src/middleware/errors.ts`. Unexpected failures receive a correlation ID in `details.requestId`; the same ID is written to the server log with only the request method and path, never headers or credentials.
- `src/middleware/auth.ts` verifies Auth0 JWT issuer and audience with `jose`, resolves synchronized application users, and provides non-optional typed context accessors to protected controllers. It returns `AUTH_NOT_CONFIGURED` until both `AUTH0_DOMAIN` and `AUTH0_AUDIENCE` are set.
- `src/middleware/ownership.ts` wraps `src/services/ownership.ts` as Express route guards, providing reusable athlete, event, event/athlete, timeline entry, participant and 100m result ownership checks. Route guards use the resolved application UUID rather than payload owner/audit IDs and use one generic `404 NOT_FOUND` response for malformed, missing, wrong-parent and cross-coach resources.
- A `TEST_DATABASE_URL`-gated cross-coach authorization integration suite (`src/services/authorization.integration.test.ts`) seeds two coaches and proves that athlete, event, participant, timeline and statistics reads, mutations and the result-override guard all return the generic `404 NOT_FOUND` for a different coach while list endpoints return empty arrays and the owning coach's own operations still succeed.
- `src/validation` provides strict shared payload parsers (camelCase create/replacement/PATCH DTOs that return ordered issue lists), `src/db/row-mappers.ts` owns snake-case PostgreSQL row mapping with deliberate numeric/timestamp conversion, and `src/db/transaction.ts` provides atomic mutation/recomputation transactions.
- `src/db/client.ts` creates a `pg` pool from `DATABASE_URL`; migrations are checksum-tracked and applied before production startup. `0002_contract_100m.sql` adds the MVP contract state, `0003_aggregate_indexes.sql` adds aggregate read indexes, and `0004_account_lifecycle.sql` adds durable account-deletion state and retry scheduling.
- The 100m data/API contract is encoded in `src/types/domain.ts` (`DISCIPLINE_100M`, `RESULT_UNIT_SECONDS`, `ResultOutcome`, aligned `Athlete`/`TimelineEntry`/`Result` DTOs plus `EventParticipant`, `AthleteStatistics` and `DashboardSummary`) and mirrored in the frontend `src/types`. `src/services/resultDerivation.ts` derives `{ value, incident, outcome }` so the API/service boundary can distinguish no result, a valid finish, DQ, DNF and DNS — including competition/training timing rules, manual override, placings and PB/SB.
- Tests: Vitest + Supertest cover app/resource/aggregate/account-lifecycle/weather routes, application-user resolution, ownership/non-disclosure, lifecycle transitions/reviews, deletion state/reconciliation, Auth0 Management and Open-Meteo boundaries, athlete/event/participant/timeline/statistics/dashboard/fixture/services, validation, row mapping, result derivation/recomputation, injury CRUD, comparison, progression, public logger, event helper, sync batch, and migrations. Real-DB suites are gated behind `TEST_DATABASE_URL`. Runs with `npm run test`.

## Deployment

The production API is deployed to Render:

```text
https://athlora-deploy.onrender.com
```

Render builds from `/backend` with `npm ci && npm run build`, starts with `npm start`, and checks `/health`. Configure `DATABASE_URL`, all Auth0 variables required by the deployed features, `CORS_ORIGINS=https://athlora-deploy.vercel.app`, and `NODE_VERSION=22` as Render environment variables.

Render must permit WebSocket upgrades for the API service. The current room broadcaster is process-local, so deploy one API instance for realtime delivery. Add a shared Socket.IO adapter before increasing the instance count. Connection, denied subscription, and mutation observability belong in the API service logs; never log bearer tokens or helper credentials.

Create a dedicated Auth0 Machine-to-Machine application for the Management API with only `delete:users` and `create:user_tickets`. Never expose its client secret through `VITE_*` variables.

## AI declaration

This document was created with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol], and updated with the assistance of OpenCode[gpt-5.6-terra] and opencode[gpt-5.6-sol].
