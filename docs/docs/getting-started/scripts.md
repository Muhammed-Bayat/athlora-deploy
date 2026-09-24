---
sidebar_position: 5
---

# Scripts, CI, and Services

This page records the repository-level quality gates, CI behavior, and deployed services.

## Package commands

Each package has its own `package.json`; run commands with `npm --prefix <package> run <script>` from the repository root, or run them inside the package directory.
- `.gitignore`, `.editorconfig`, `README.md` (with the **AI Usage** section) at the repo root.
- Mockups `SDP-Landing.html`, `SDP-Coach-Console.html` and `Athlora_Premium_Dashboard.html` (premium console redesign) are tracked at the root as the design source of truth.

| Package | Primary checks |
|---|---|
| `frontend` | `lint`, `typecheck`, `test`, `build` |
| `backend` | `lint`, `typecheck`, `test`, `build` |
| `docs` | `typecheck`, `build` |
| `e2e` | `test:install`, `test` |

The backend also provides `db:migrate` for source migrations and `db:migrate:prod` for compiled migrations. See the dedicated [frontend](./frontend), [backend](./backend), [E2E](./e2e), and [documentation-site](./docs) guides for command details.

## Continuous integration

`.gitea/workflows/ci.yml` runs on every push and pull request using Node.js 22.
| Job | Steps |
|-----|-------|
| `frontend` | `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` |
| `backend` | `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` |
| `docs` | `npm ci`, `npm run build` |
| `e2e` | PostgreSQL on port `55432`, `npm ci` (backend, frontend, e2e), `npx playwright install --with-deps chromium`, `npm test --prefix e2e` |

The `e2e` job first detects whether the seven repository secrets are present (via a step output — not `secrets` in `if:`), then provisions an isolated PostgreSQL cluster inside the job container on port `55432` so host-networked Gitea runners cannot collide with an existing database on `5432`. Provisioning is root/sudo-aware: act runner images often run as root without a `sudo` binary, so the job elevates only when needed and switches to the `postgres` user with `runuser`/`su` instead of `sudo -u`. Playwright `global-setup` migrates and truncates that database before every run. When any of the seven secrets are missing it prints a clear skip message and stays green. Playwright's HTML report is uploaded as an artifact on failure.

| Job | Work performed |
|---|---|
| `frontend` | Install, lint, type-check, test, and build the SPA. |
| `backend` | Install, lint, type-check, test, and build the API. |
| `docs` | Install and build the Docusaurus site. |
| `e2e` | Install all test dependencies, provision PostgreSQL on isolated port `55432` (root/sudo-aware), install Chromium, and run Playwright when Auth0 secrets are available. |

The E2E job uses an in-job PostgreSQL cluster and a disposable `athlora_e2e` database. It skips with an explicit message until these repository secrets are configured:

```text
VITE_AUTH0_DOMAIN
VITE_AUTH0_CLIENT_ID
VITE_AUTH0_AUDIENCE
E2E_AUTH0_EMAIL
E2E_AUTH0_PASSWORD
E2E_GUEST_AUTH0_EMAIL
E2E_GUEST_AUTH0_PASSWORD
```

On an E2E failure, CI uploads `e2e/playwright-report` for seven days. A skipped E2E job is not evidence that the browser workflow has passed; run it locally or configure the secrets before release.

## Local verification

Run the non-browser gates from the repository root:

```bash
npm ci --prefix frontend
npm run lint --prefix frontend
npm run typecheck --prefix frontend
npm run test --prefix frontend
npm run build --prefix frontend

npm ci --prefix backend
npm run lint --prefix backend
npm run typecheck --prefix backend
npm run test --prefix backend
npm run build --prefix backend

npm ci --prefix docs
npm run typecheck --prefix docs
npm run build --prefix docs
```

Run the authenticated Playwright suite separately using the [E2E guide](./e2e). Set `TEST_DATABASE_URL` to run the backend's PostgreSQL integration tests.

## Deployed services

| Service | Provider | URL |
|---|---|---|
| Frontend SPA | Vercel | `https://athlora-deploy.vercel.app` |
| REST API and health check | Render | `https://athlora-deploy.onrender.com/health` |
| PostgreSQL | Neon, Frankfurt | Private connection configured through `DATABASE_URL` |
| Identity | Auth0 | Tenant configuration is private |
| Documentation | Cloudflare Pages | `https://athlora-deploy.pages.dev` |
| Source control and CI | University Gitea | `https://sdp.ms.wits.ac.za/cache-us-outside/athlora` |

GraySky Free is used server-side for current and event-day weather. No provider account, key, or environment variable is required. Current/daily data share a ten-minute coordinate cache with in-flight deduplication and a short failure cooldown. See the weather section of the API contract for nullable DTOs and the live-endpoint verification status.
## End-to-end tests (Playwright)

The `/e2e` package drives the full 100m vertical slice against real servers and a real database, on desktop and mobile Chromium, plus an automated accessibility audit.

Prerequisites:

- A dedicated PostgreSQL database (the recommended local setup is the same Docker Postgres used for the backend integration tests). `global-setup` applies migrations and truncates all application tables before each run, so **use a scratch database** — never point it at a database with data you care about.
- Two Auth0 test users with access to the application (a host coach and a guest coach), and the origins below registered in the Auth0 SPA application (callback, logout and web-origin URLs):
  - `http://localhost:5174` (E2E frontend)
  - `http://localhost:4100` (E2E backend)
- The E2E backend runs with `CORS_ORIGINS=http://localhost:5174` automatically.

Setup:

```bash
docker run --rm -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:16
cp e2e/.env.example e2e/.env   # fill DATABASE_URL + the Auth0/E2E credentials
cd e2e && npm install && npm run test:install
npm test
```

`playwright.config.ts` boots both servers itself (`webServer` array): the backend on `http://localhost:4100` and the Vite frontend on `http://localhost:5174` (strict ports), with all required environment variables supplied. `DATABASE_URL`, the public `VITE_AUTH0_*` values, and the `E2E_AUTH0_*` host and `E2E_GUEST_AUTH0_*` guest credentials come from `e2e/.env` (gitignored) or the environment.

Projects:

| Project | Runs | Notes |
|---------|------|-------|
| `auth-setup` | `auth.setup.ts` | Signs in through Auth0 Universal Login once and saves `storageState` to `e2e/.auth/coach.json` |
| `smoke` | `smoke.spec.ts` | Unauthenticated landing-page smoke test + axe audit |
| `desktop-chromium` | `vertical-slice.spec.ts` | Full serial slice at desktop viewport |
| `mobile-chromium` | `vertical-slice.spec.ts` | Same serial slice at Pixel 5 viewport |

Runs are serial (`workers: 1`) and every project uses data unique to that project, so desktop and mobile runs stay deterministic and isolated. `global-setup.ts` applies migrations and truncates all application tables (including clubs, fixture notifications, event helpers, public logger links, sync receipts, and athlete injuries) before each run. The expanded suite audits key coach views (dashboard, roster, events, live logger, comparison, fixtures, account, athlete detail) with axe (`wcag2a/aa`, `wcag21a/aa`) and fails on critical or serious violations.

## Coverage Reports

Generate the same coverage reports used by Gitea Actions:

```bash
npm run test:coverage --prefix frontend
npm run test:coverage --prefix backend
node scripts/generate-coverage-report.mjs
```

The commands create ignored JSON coverage summaries. The Gitea `coverage` job prints a short Markdown table with frontend, backend, and combined line, branch, and function coverage; it appends the same table to the runner job summary when supported. Coverage is informational until the team agrees on a baseline and threshold.

## Current check status

### Public club schedule experience — 2026-09-24

- Frontend: lint passes with 17 existing warnings (0 errors); strict typecheck/build pass; **668 tests pass, 0 skip** (includes the new `publicSchedule` API wrapper and `publicSchedule` page suites plus landing/public-stats navigation tests).
- Backend: lint, strict typecheck and build pass; **685 tests pass, 58 database-gated tests skip** (includes the expanded public-schedule service/route suites asserting the `disciplines` projection and legacy fallback).
- Documentation: Docusaurus typecheck and production build pass after the public-schedule API, contract §3.12, frontend route, backend, overview, welcome, and E2E updates.
- Migration integration suite remains gated on `TEST_DATABASE_URL` (expected list/count unchanged for the full 36-migration set; no new migration in this change).
- E2E: `e2e/tests/public-schedule.spec.ts` was added (seeded enabled/disabled/unknown/empty coverage, `<time datetime>` assertion, axe audit on both pages, landing nav link) but is credential-gated in CI and was not run locally.

### Relay team support — 2026-09-24

- Frontend: lint passes with 17 existing warnings (0 errors); strict typecheck/build pass; **658 tests pass, 0 skip** (includes `SessionLivePanel` start/log/official-selection/offline paths and public stats mock coverage for session results).
- Backend: lint, strict typecheck and build pass; **682 tests pass, 58 database-gated tests skip** (includes selection-aware derivation, roster update/validation, public club session results, and athlete relay-history suites).
- Documentation: Docusaurus typecheck and production build pass after the relay catalogue, contract, derivation, and public-statistics updates.
- Migration integration suite remains gated on `TEST_DATABASE_URL` (expected list/count refreshed for `0034_relay_catalogue_and_official_entry.sql` and the full 36-migration set).

### Authenticated offline batch sync — 2026-09-23

- Frontend: lint passes with 16 existing warnings (0 errors); strict typecheck/build pass; **644 tests pass, 0 skip** (includes the rewritten sync-engine batch drain, `toSyncAction` mapper, and receipt-handling suites).
- Backend: lint, strict typecheck and build pass; **642 tests pass, 43 database-gated tests skip** (includes the new `POST /sync/batch` route validation/ownership suite, expanded processSyncBatch receipt tests, and 3 DB-gated sync integration tests for idempotent retries).
- Documentation: Docusaurus typecheck and production build pass after the offline-sync architecture and contract §3.11 updates.
- Migration integration suite remains gated on `TEST_DATABASE_URL` (expected list/count unchanged for the full 29-migration set plus the new sync integration file).

### User dashboard preferences — 2026-09-23

- Frontend: lint passes with 16 existing warnings (0 errors); strict typecheck/build pass; **635 tests pass, 0 skip** (includes new customize-dialog, hidden-cards, and saved-views dashboard tests).
- Backend: lint, strict typecheck and build pass; **613 tests pass, 40 database-gated tests skip** (includes the new preferences validation, service, and route suites).
- Documentation: Docusaurus typecheck and production build pass after the preferences contract/schema updates.
- Migration integration suite remains gated on `TEST_DATABASE_URL` (expected list/count refreshed for `0026_user_preferences.sql` and the full 28-migration set).

### Independent publication flags and public schedule — 2026-09-23

- Frontend: lint passes with 16 existing warnings (0 errors); strict typecheck/build pass; **632 tests pass, 0 skip**.
- Backend: lint, strict typecheck and build pass; **600 tests pass, 40 database-gated tests skip** (includes the new publication and public-schedule unit/API suites).
- Documentation: Docusaurus typecheck and production build pass after the split-flag docs updates.
- Migration integration suite remains gated on `TEST_DATABASE_URL` (expected list/count refreshed for `0025_club_public_schedule_publication.sql` and the full 27-migration set).

### Club branding — 2026-09-23

- Frontend: lint passes with 16 existing warnings (0 errors); strict typecheck/build pass; **642 tests pass, 0 skip** (includes new `ClubBadge`, contrast-utils, and branding-aware surface tests).
- Backend: lint, strict typecheck and build pass; **632 tests pass, 40 database-gated tests skip** (includes the new branding route, payload-validation, color-contrast, media-storage, and public-DTO suites).
- Documentation: Docusaurus typecheck and production build pass after the branding contract/schema updates.
- Migration integration suite remains gated on `TEST_DATABASE_URL` (expected list/count refreshed for `0027_club_branding.sql` and the full 29-migration set).

### GraySky migration verification — 2026-09-14

- Frontend: lint passes with 12 existing warnings; strict typecheck/build pass; **530 tests pass, 4 skip**.
- Backend: lint, strict typecheck and build pass; **568 tests pass, 40 database-gated tests skip**.
- Documentation: Docusaurus production build passes.
- Isolated Chromium weather checks with mocked API responses: 390px and 1440px, dark and light themes; current/daily rendering, attribution, no horizontal overflow and no browser exceptions verified. This is separate from the Auth0/database E2E suite.
- GraySky live verification passed for Johannesburg: `https://graysky.net/api/forecast?lat=-26.2041&lon=28.0473` returned a `200` `forecast` envelope with `units: "us"`. The backend parser tests cover that live shape and its metric conversions; the earlier supplied `/free/v1/forecast/...` path remains unavailable.

The implemented Stage 1 checks pass locally, and the same frontend/backend/docs gates run in Gitea Actions CI on every push/PR. The `e2e` job runs in CI once the Auth0/E2E secrets are configured and skips (with a message) until then:

| Package | Checks | Result |
|---------|--------|--------|
| `frontend` | lint, typecheck, test, coverage, build | passing |
| `backend` | lint, typecheck, test, coverage, build | passing |
| `docs` | build | passing |
| `e2e` | Playwright (Chromium) + axe | configured (smoke + spec files covering workspace, roles, squads, athlete lifecycle, injuries, event helpers, realtime, reminders, public logger, fixture notifications, public schedule, authorization, migration, accessibility, routing, analytics, comparison, offline, fixtures, vertical slice + relay session logging); first green run pending Docker Postgres + `e2e/.env` + Auth0 E2E credentials |

The backend suite includes 43 database integration tests that exercise real SQL against PostgreSQL: 7 migration tests (including multiple accepted fixture workspaces), 1 account-deletion graph/isolation test, 5 athlete-persistence tests, 6 event-persistence tests, 5 participant-persistence tests, 10 timeline-persistence tests, 2 aggregate tests covering effective statistics/year boundaries/archival/cancellation plus deterministic dashboard modes/progress/upcoming/history ownership, 3 cross-coach authorization tests, 1 injury-persistence test, and 3 offline sync-batch idempotency/lifecycle tests. They are gated behind `TEST_DATABASE_URL` and skip when it is unset, so CI stays green without a database.

## Definition of done

A change is ready for review when its affected checks pass, its documentation and API/schema references are current, and it does not introduce credentials or generated artifacts into Git. AI-assisted commits follow the project's documented Conventional Commit and attribution requirements.

## AI declaration

This document was created with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol], and updated with the assistance of OpenCode[gpt-5.6-terra] and opencode[gpt-5.6-sol]. The GraySky migration documentation was edited with OpenCode[openai/gpt-6-astra]. The independent publication flags and public schedule checks were documented with the assistance of opencode[mimo-v2.6-flash-free]. The user dashboard preferences checks and the e2e CI provisioning fix were documented with the assistance of opencode[mimo-v2.6-flash-free]. The club branding feature (migration, storage/validation services, branding/media routes, contrast helpers, `ClubBadge`, account settings card, branded surface wiring, tests, and related documentation) was generated and edited with opencode[mimo-v2.6-flash-free]. The authenticated offline batch sync checks were documented with the assistance of opencode[mimo-v2.6-flash-free]. The relay team support checks were documented with the assistance of opencode[mimo-v2.6-flash-free]. The public club schedule experience checks were documented with the assistance of opencode[mimo-v2.6-flash-free].
