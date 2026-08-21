---
sidebar_position: 3
---

# End-to-End Testing

The `/e2e` package uses Playwright to test the current 100m vertical slice against real local frontend, backend, PostgreSQL, and Auth0 services. It covers anonymous access, authenticated desktop and mobile workflows, and key accessibility checks. The suite will grow alongside the full athletics-meet rollout.

## What runs

| Project | Coverage |
|---|---|
| `smoke` | Landing page and anonymous accessibility checks. |
| `auth-setup` | Auth0 sign-in once and saves authenticated browser state. |
| `desktop-chromium` | Complete current 100m workflow at a desktop viewport. |
| `mobile-chromium` | The same current workflow at a Pixel 5 viewport. |

The vertical slice creates athletes and events, assigns participants, records and corrects results, applies and clears overrides, completes events, verifies statistics/dashboard behavior, archives an athlete, and audits core coach views with axe.

## Requirements

- Node.js 22 LTS and npm
- Docker or another disposable PostgreSQL 16 database
- An Auth0 test user that can sign in to Athlora
- The Auth0 application configured for the local E2E URLs

## Configure Auth0

Register both URLs as callback URLs, logout URLs, and web origins in the Auth0 SPA application:

```text
http://localhost:5174
http://localhost:4100
```

Use a dedicated test account. The test suite records real data and resets its configured database on every run.

## Run locally

Start a disposable PostgreSQL instance:

```bash
docker run --rm -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:16
```

Then configure and run the suite:

```bash
cp e2e/.env.example e2e/.env
# Set the Auth0 and test-user values in e2e/.env.
cd e2e
npm install
npm run test:install
npm test
```

`e2e/.env` is ignored by Git. It needs `DATABASE_URL`, the public `VITE_AUTH0_*` settings, and `E2E_AUTH0_EMAIL`/`E2E_AUTH0_PASSWORD`. Point `DATABASE_URL` at a scratch database only: global setup runs migrations and truncates all application tables before each test run.

Playwright starts the backend on `http://localhost:4100` and Vite on `http://localhost:5174`; do not start those services yourself. It supplies the matching CORS and API-base configuration automatically.

## Results and troubleshooting

The HTML report is written to `e2e/playwright-report`. On a failed test, traces are captured on the first retry. Common setup failures are:

- missing values in `e2e/.env`;
- Auth0 URLs not registered for ports `5174` and `4100`;
- a database URL pointing to a non-disposable database;
- PostgreSQL not available on port `55432`.

## AI declaration

This document was created with the assistance of OpenCode[gpt-5.6-terra] and updated with the assistance of OpenCode[gpt-5.6-terra].
