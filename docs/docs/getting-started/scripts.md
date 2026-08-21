---
sidebar_position: 5
---

# Scripts, CI, and Services

This page records the repository-level quality gates, CI behavior, and deployed services.

## Package commands

Each package has its own `package.json`; run commands with `npm --prefix <package> run <script>` from the repository root, or run them inside the package directory.

| Package | Primary checks |
|---|---|
| `frontend` | `lint`, `typecheck`, `test`, `build` |
| `backend` | `lint`, `typecheck`, `test`, `build` |
| `docs` | `typecheck`, `build` |
| `e2e` | `test:install`, `test` |

The backend also provides `db:migrate` for source migrations and `db:migrate:prod` for compiled migrations. See the dedicated [frontend](./frontend), [backend](./backend), [E2E](./e2e), and [documentation-site](./docs) guides for command details.

## Continuous integration

`.gitea/workflows/ci.yml` runs on every push and pull request using Node.js 22.

| Job | Work performed |
|---|---|
| `frontend` | Install, lint, type-check, test, and build the SPA. |
| `backend` | Install, lint, type-check, test, and build the API. |
| `docs` | Install and build the Docusaurus site. |
| `e2e` | Install all test dependencies, provision PostgreSQL 16, install Chromium, and run Playwright when Auth0 secrets are available. |

The E2E job uses `postgres:16` and a disposable `athlora_e2e` database. It skips with an explicit message until these repository secrets are configured:

```text
VITE_AUTH0_DOMAIN
VITE_AUTH0_CLIENT_ID
VITE_AUTH0_AUDIENCE
E2E_AUTH0_EMAIL
E2E_AUTH0_PASSWORD
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

Open-Meteo is used server-side for event-day forecasts and current coach-weather data. It requires no API key; provider data is validated and reduced to Athlora's own API response before it reaches the browser.

## Definition of done

A change is ready for review when its affected checks pass, its documentation and API/schema references are current, and it does not introduce credentials or generated artifacts into Git. AI-assisted commits follow the project's documented Conventional Commit and attribution requirements.

## AI declaration

This document was created with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol], and updated with the assistance of OpenCode[gpt-5.6-terra].
