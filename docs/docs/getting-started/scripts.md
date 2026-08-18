---
sidebar_position: 3
---

# Scripts, CI & services

A reference for the npm scripts and CI that keeps the repo green.

## Root

- `.gitignore`, `.editorconfig`, `README.md` (with the **AI Usage** section) at the repo root.
- Mockups `SDP-Landing.html` and `SDP-Coach-Console.html` are tracked at the root as the design source of truth.

## CI (Gitea Actions)

Workflow: `.gitea/workflows/ci.yml`. On every push and pull request it runs, in parallel jobs:

| Job | Steps |
|-----|-------|
| `frontend` | `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` |
| `backend` | `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` |
| `docs` | `npm ci`, `npm run build` |
| `e2e` | Postgres 16 service container, `npm ci` (backend, frontend, e2e), `npx playwright install --with-deps chromium`, `npm test --prefix e2e` |

The `e2e` job provisions a `postgres:16` service container (`postgresql://postgres:postgres@localhost:5432/athlora_e2e`) that `global-setup` migrates and truncates before every run. It requires five repository secrets — `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`, `E2E_AUTH0_EMAIL`, `E2E_AUTH0_PASSWORD` — and when any are missing it prints a clear skip message and stays green. Playwright's HTML report is uploaded as an artifact on failure.

Each job runs on the default `ubuntu-latest` runner label with Node 22 pinned via `actions/setup-node@v4` — so CI does not depend on a runner being registered with a custom `docker://` image label.

The runner is registered against the university Gitea instance (`https://sdp.ms.wits.ac.za`) and executes in the `ubuntu-latest:docker://node:22-bookworm` container. It runs from Docker Desktop on a team machine with the DinD flavour (bundled daemon, no host socket required):

```bash
docker run -d --name athlora_runner --privileged \
  -e GITEA_INSTANCE_URL=https://sdp.ms.wits.ac.za/ \
  -e GITEA_RUNNER_REGISTRATION_TOKEN=<token> \
  -e GITEA_RUNNER_NAME=athlora-runner \
  -e GITEA_RUNNER_LABELS="ubuntu-latest:docker://node:22-bookworm" \
  -v <path>:/data \
  docker.io/gitea/runner:3-dind
```

The registration token is obtained in the Gitea UI under the repository's **Settings → Actions → Runners**. A runner only accepts jobs while its machine and container are running.

## End-to-end tests (Playwright)

The `/e2e` package drives the full 100m vertical slice against real servers and a real database, on desktop and mobile Chromium, plus an automated accessibility audit.

Prerequisites:

- A dedicated PostgreSQL database (the recommended local setup is the same Docker Postgres used for the backend integration tests). `global-setup` applies migrations and truncates all application tables before each run, so **use a scratch database** — never point it at a database with data you care about.
- An Auth0 test user with access to the application, and the origins below registered in the Auth0 SPA application (callback, logout and web-origin URLs):
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

`playwright.config.ts` boots both servers itself (`webServer` array): the backend on `http://localhost:4100` and the Vite frontend on `http://localhost:5174` (strict ports), with all required environment variables supplied. `DATABASE_URL`, `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`, `E2E_AUTH0_EMAIL` and `E2E_AUTH0_PASSWORD` come from `e2e/.env` (gitignored) or the environment.

Projects:

| Project | Runs | Notes |
|---------|------|-------|
| `auth-setup` | `auth.setup.ts` | Signs in through Auth0 Universal Login once and saves `storageState` to `e2e/.auth/coach.json` |
| `smoke` | `smoke.spec.ts` | Unauthenticated landing-page smoke test + axe audit |
| `desktop-chromium` | `vertical-slice.spec.ts` | Full serial slice at desktop viewport |
| `mobile-chromium` | `vertical-slice.spec.ts` | Same serial slice at Pixel 5 viewport |

Runs are serial (`workers: 1`) and every project uses data unique to that project, so desktop and mobile runs stay deterministic and isolated. `global-setup.ts` applies migrations and truncates application tables (users, athletes, events, event_participants, timeline_entries, results, account_deletions) before each run. The final serial test audits key coach views (dashboard, roster, events, live logger console, athlete detail, results) with axe (`wcag2a/aa`, `wcag21a/aa`) and fails on critical or serious violations.

## Current check status

The implemented Stage 1 checks pass locally, and the same frontend/backend/docs gates run in Gitea Actions CI on every push/PR. The `e2e` job runs in CI once the Auth0/E2E secrets are configured and skips (with a message) until then:

| Package | Checks | Result |
|---------|--------|--------|
| `frontend` | lint, typecheck, test, build | passing (193 Vitest/RTL tests) |
| `backend` | lint, typecheck, test, build | passing (301 Vitest/Supertest tests; 38 database tests skipped when unconfigured) |
| `docs` | build | passing |
| `e2e` | Playwright (Chromium) + axe | configured (2 smoke + 4 desktop + 4 mobile tests, + 1 auth-setup); first green run pending Docker Postgres + `e2e/.env` + Auth0 E2E credentials |

The backend suite includes 38 database integration tests that exercise real SQL against PostgreSQL: 6 migration tests, 1 account-deletion graph/isolation test, 5 athlete-persistence tests, 6 event-persistence tests, 5 participant-persistence tests, 10 timeline-persistence tests, 2 aggregate tests covering effective statistics/year boundaries/archival/cancellation plus deterministic dashboard modes/progress/upcoming/history ownership, and 3 cross-coach authorization tests proving every owned resource — including result overrides and athlete statistics — returns the generic `404` for a different coach while list endpoints never leak foreign rows. They are gated behind `TEST_DATABASE_URL` and skip when it is unset, so CI stays green without a database.

## Definition of done

A task is "done" when its tests pass in CI and:

- table/column names match the build spec exactly (or a new migration follows its conventions);
- API routes and response shapes match the spec;
- the UI uses design tokens only;
- tests are added and passing;
- the `Assisted-by:` footer is present on commits with AI-generated code;
- the README AI Usage section is current.

Full checklist: the build spec, Section 12.

## AI declaration

This document was generated with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol]. This revision was edited with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol].
