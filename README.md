# Athlora

Run the whole athletics season from one place.

## Core Requirements

### Project Title

**Athlora**

### Short Description

Athlora is a web application for athletics coaches who need one place to manage athletes, plan training and competitions, and record results at the track. The shipped vertical slice supports 100m timing, live corrections, derived results, PBs/SBs, athlete statistics, weather, and a coach dashboard; the roadmap expands this into a full athletics-meet system.

### System Requirements

- Node.js 22 LTS recommended; Node.js 20 or later supported.
- npm 10 or later.
- PostgreSQL 13 or later for local API features. Docker Desktop is recommended for local PostgreSQL and required for the documented E2E setup.
- An Auth0 SPA/API configuration for authenticated application features.
- Chromium, installed by Playwright, for E2E tests.

Tested development environment: Linux, macOS, or Windows with a current Node.js LTS release. The frontend requires a modern Chromium-, Firefox-, or Safari-based browser.

### Architecture

```text
/frontend   React + Vite + TypeScript SPA
/backend    Express + TypeScript REST API and PostgreSQL migrations
/docs       Docusaurus documentation site
/e2e        Playwright browser tests
```

The frontend and backend are independently deployed services communicating through HTTP/JSON. Auth0 provides identity; PostgreSQL stores coach-owned data; Open-Meteo provides weather through server-side proxies.

## Installation Guide

### 1. Clone and install packages

```bash
git clone https://sdp.ms.wits.ac.za/cache-us-outside/athlora.git
cd athlora
npm ci --prefix frontend
npm ci --prefix backend
npm ci --prefix docs
npm ci --prefix e2e
```

### 2. Configure the API

Create `backend/.env` from the example and supply your PostgreSQL and Auth0 values:

```bash
cp backend/.env.example backend/.env
```

At minimum, set `DATABASE_URL`, `AUTH0_DOMAIN`, and `AUTH0_AUDIENCE`. Password-ticket creation and permanent account deletion also require the Auth0 Management API client variables. Never commit `.env` files.

Run the migrations and API:

```bash
npm run db:migrate --prefix backend
npm run dev --prefix backend
```

The API starts at `http://localhost:4000`.

### 3. Configure and run the frontend

Create a local frontend environment file:

```bash
cp frontend/.env.example frontend/.env.local
```

For local API development, set `VITE_API_BASE_URL=http://localhost:4000` in `frontend/.env.local`, then start Vite:

```bash
npm run dev --prefix frontend
```

Open `http://localhost:5173`. Register this URL as an Auth0 callback URL, logout URL, and web origin before signing in.

## Usage Examples

### Verify the API

```bash
curl http://localhost:4000/health
```

Expected response:

```json
{ "status": "ok" }
```

### Run the current coaching workflow

1. Sign in through Auth0 and let Athlora synchronize the local coach profile.
2. Create athletes from **Athletes**.
3. Create a 100m competition or training event from **Events**, assign athletes, and start it.
4. Use **Live Logger** to record finishes or incidents; correct or undo entries if needed.
5. Review derived results, manual corrections, PB/SB information, athlete history, and the dashboard summary.

### Run quality checks

```bash
npm run lint --prefix frontend
npm run typecheck --prefix frontend
npm run test --prefix frontend
npm run build --prefix frontend

npm run lint --prefix backend
npm run typecheck --prefix backend
npm run test --prefix backend
npm run build --prefix backend

npm run build --prefix docs
```

See [`e2e/README.md`](e2e/README.md) for the authenticated Playwright setup.

## Services and Documentation

- Application: https://athlora-deploy.vercel.app
- API health: https://athlora-deploy.onrender.com/health
- Documentation: https://athlora-deploy.pages.dev
- [Frontend guide](docs/docs/getting-started/frontend.md)
- [Backend guide](docs/docs/getting-started/backend.md)
- [E2E guide](docs/docs/getting-started/e2e.md)
- [Architecture](docs/docs/architecture/overview.md)
- [API reference](docs/docs/api-reference/contract.md)
- [Delivery roadmap](docs/docs/process/dev-plan.md)

## AI Declaration

This document was created with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol], and updated with the assistance of OpenCode[gpt-5.6-terra].
