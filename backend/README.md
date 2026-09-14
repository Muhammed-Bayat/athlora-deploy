# Athlora Backend

## Core Requirements

### Project Title

**Athlora Backend**

### Short Description

The backend is the Express REST API for Athlora. It verifies Auth0 access tokens, enforces coach ownership, persists the roster/event/timeline model in PostgreSQL, derives the current 100m results, and proxies weather data safely.

### System Requirements

- Node.js 22 LTS recommended; Node.js 20 or later supported.
- npm.
- PostgreSQL 13 or later.
- Auth0 API configuration for protected routes.

## Installation Guide

```bash
cd backend
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

Configure `DATABASE_URL`, `AUTH0_DOMAIN`, and `AUTH0_AUDIENCE` in `.env`. Set `AUTH0_MANAGEMENT_CLIENT_ID`, `AUTH0_MANAGEMENT_CLIENT_SECRET`, and `AUTH0_PASSWORD_RETURN_URL` to enable password-ticket and permanent-account-deletion features. The server runs at `http://localhost:4000` by default.

## Usage Examples

Verify the public health endpoint:

```bash
curl http://localhost:4000/health
```

Apply migrations after pulling a schema change:

```bash
npm run db:migrate
```

Run API checks:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Set `TEST_DATABASE_URL` to a disposable PostgreSQL database before running the integration suites. Protected routes require `Authorization: Bearer <Auth0 access token>` and a synchronized application user.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Run the API with `tsx watch`. |
| `npm run build` | Compile TypeScript to `dist/`. |
| `npm run db:migrate` | Apply source migrations. |
| `npm run db:migrate:prod` | Apply compiled migrations. |
| `npm start` | Migrate and run the compiled server. |
| `npm run typecheck` | Run strict TypeScript checks. |
| `npm run test` | Run Vitest and Supertest. |
| `npm run lint` | Run ESLint. |

## AI Declaration

This document was created and updated with the assistance of OpenCode[gpt-5.6-terra].
