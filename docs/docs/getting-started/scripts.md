---
sidebar_position: 5
---

# Scripts, CI, and Services

This page records the repository-level quality gates, CI behavior, and deployed services.

## Package commands

Each package has its own `package.json`; run commands with `npm --prefix <package> run <script>` from the repository root, or run them inside the package directory.
- `.gitignore`, `.editorconfig`, `README.md` (with the **AI Usage** section) at the repo root.
- Mockups `SDP-Landing.html` and `SDP-Coach-Console.html` are tracked at the repo root as the design source of truth; the premium console redesign mockup lives at `docs/docs/sprints/sprint-1/screenshots/00002803-Athlora_Premium_Dashboard.html`.

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
| `coverage` | `npm ci` (frontend, backend), `npm run test:coverage` (frontend, backend), `node scripts/generate-coverage-report.mjs` |
| `e2e` | PostgreSQL on port `55432`, `npm ci` (backend, frontend, e2e), `npx playwright install --with-deps chromium`, `npm test --prefix e2e` |

The `e2e` job first detects whether the seven repository secrets are present (via a step output — not `secrets` in `if:`), then provisions an isolated PostgreSQL cluster inside the job container on port `55432` so host-networked Gitea runners cannot collide with an existing database on `5432`. Provisioning is root/sudo-aware: act runner images often run as root without a `sudo` binary, so the job elevates only when needed and switches to the `postgres` user with `runuser`/`su` instead of `sudo -u`. Playwright `global-setup` migrates and truncates that database before every run. When any of the seven secrets are missing it prints a clear skip message and stays green. Playwright's HTML report is uploaded as an artifact on failure.

| Job | Work performed |
|---|---|
| `frontend` | Install, lint, type-check, test, and build the SPA. |
| `backend` | Install, lint, type-check, test, and build the API. |
| `docs` | Install and build the Docusaurus site. |
| `coverage` | Install frontend and backend dependencies, generate both coverage summaries, and build the combined quality report. |
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
| `desktop-chromium` | All authenticated spec files (`testIgnore` excludes only `auth.setup.ts` and `smoke.spec.ts`) | Full authenticated suite at desktop viewport |
| `mobile-chromium` | The same authenticated spec files | Same suite at Pixel 5 viewport |

Runs are serial (`workers: 1`) and every project uses data unique to that project, so desktop and mobile runs stay deterministic and isolated. `global-setup.ts` applies migrations and truncates its 30-entry application table list (`APP_TABLES`, including clubs, fixture notifications, event helpers, public logger links, sync receipts, and athlete injuries) with `CASCADE` before each run; the catalogue and session tables (`discipline_definitions`, `discipline_sessions`, `session_*`, `meet_*`, `relay_members`, and the offline/public sync logs) are seeded by migrations and deliberately left in place, so the live schema holds 43 tables in total. The expanded suite audits key coach views (dashboard, roster, events, live logger, comparison, account, athlete detail) with axe (`wcag2a/aa`, `wcag21a/aa`) and fails on critical or serious violations, plus keyboard-navigation and 320px no-horizontal-scroll checks. `e2e/tests/accessibility.spec.ts` still contains a `fixtures` audit entry, but the console nav has no Fixtures item — `/console/fixtures` redirects to `/console/events` (`frontend/src/App.tsx`).

## Coverage Reports

Generate the same coverage reports used by Gitea Actions:

```bash
npm run test:coverage --prefix frontend
npm run test:coverage --prefix backend
node scripts/generate-coverage-report.mjs
```

The commands create ignored JSON coverage summaries. The Gitea `coverage` job prints a short Markdown table with frontend, backend, and combined line, branch, and function coverage; it appends the same table to the runner job summary when supported. Coverage is informational until the team agrees on a baseline and threshold.

## Recording check status

Record a status snapshot only when a change needs verification evidence: run the affected package gates (lint, typecheck, test, build — plus coverage and the browser suite where configured), then replace the table below with that run's date and results. Dated totals go stale as specs, tests, and migrations are added, so read every number from the current tree at run time rather than carrying an older snapshot forward, and keep at most one snapshot in this section.

| Metric (snapshot 2026-10-01) | Count |
|---|---|
| Frontend unit test files | 103 |
| Backend test files (11 integration) | 96 |
| E2E spec files | 23 |
| Backend migrations | 43 |

## Definition of done

A change is ready for review when its affected checks pass, its documentation and API/schema references are current, and it does not introduce credentials or generated artifacts into Git. AI-assisted commits follow the project's documented Conventional Commit and attribution requirements.

## AI declaration

The global assistant, discipline analytics, athlete progression graph, and current-day calendar verification statuses were generated and edited with the assistance of OpenCode[openai/gpt-5.6-terra].

This document was created with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol], and updated with the assistance of OpenCode[gpt-5.6-terra] and opencode[gpt-5.6-sol]. The GraySky migration documentation was edited with OpenCode[openai/gpt-6-astra]. The independent publication flags and public schedule checks were documented with the assistance of opencode[mimo-v2.6-flash-free]. The user dashboard preferences checks and the e2e CI provisioning fix were documented with the assistance of opencode[mimo-v2.6-flash-free]. The club branding feature (migration, storage/validation services, branding/media routes, contrast helpers, `ClubBadge`, account settings card, branded surface wiring, tests, and related documentation) was generated and edited with opencode[mimo-v2.6-flash-free]. The authenticated offline batch sync checks were documented with the assistance of opencode[mimo-v2.6-flash-free]. The relay team support checks were documented with the assistance of opencode[mimo-v2.6-flash-free]. The public club schedule experience checks were documented with the assistance of opencode[mimo-v2.6-flash-free]. The whole-meet public logger and event-discipline roster verification statuses were documented with the assistance of OpenCode[gpt-5.6-terra]. The exact public-age filter verification status was documented with the assistance of OpenCode[gpt-5.6-terra]. The CI job tables, Playwright project table, accessibility target list, mockup reference, and check-status section were updated with the assistance of opencode[mimo-v2.6-flash-free].
