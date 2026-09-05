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
| `desktop-chromium` | Complete 100m workflow and expanded feature tests at a desktop viewport. |
| `mobile-chromium` | The same tests at a Pixel 5 viewport. |

The expanded suite covers: the full 100m vertical slice (roster, events, assignment, live logging, corrections, overrides, completion, statistics, dashboard, archive), workspace switching and membership management, role enforcement, squad management, athlete lifecycle (active/inactive/archived), injury creation and resolution, event helpers and offline designation, Socket.IO realtime, event reminders, public logger links, fixture notifications and RSVP, authorization boundaries, migration verification, accessibility deep audit, routing/navigation, and analytics/comparison.

## Requirements

- Node.js 22 LTS and npm
- Docker or another disposable PostgreSQL 16 database
- Two Auth0 test users that can sign in to Athlora: a host coach and a guest coach
- The Auth0 application configured for the local E2E URLs

## Configure Auth0

Register both URLs as callback URLs, logout URLs, and web origins in the Auth0 SPA application:

```text
http://localhost:5174
http://localhost:4100
```

Use dedicated host and guest test accounts. The test suite records real data and resets its configured database on every run.

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

`e2e/.env` is ignored by Git. It needs `DATABASE_URL`, the public `VITE_AUTH0_*` settings, and both the `E2E_AUTH0_*` host credentials and `E2E_GUEST_AUTH0_*` guest credentials. Point `DATABASE_URL` at a scratch database only: global setup runs migrations and truncates all application tables before each test run.

Playwright starts the backend on `http://localhost:4100` and Vite on `http://localhost:5174`; do not start those services yourself. It supplies the matching CORS and API-base configuration automatically.

## Results and troubleshooting

The HTML report is written to `e2e/playwright-report`. On a failed test, traces are captured on the first retry. Common setup failures are:

- missing values in `e2e/.env`;
- Auth0 URLs not registered for ports `5174` and `4100`;
- a database URL pointing to a non-disposable database;
- PostgreSQL not available on port `55432`.

## AI declaration

This document was created with the assistance of OpenCode[gpt-5.6-terra] and updated with the assistance of OpenCode[gpt-5.6-terra] and opencode[gpt-5.6-sol].
