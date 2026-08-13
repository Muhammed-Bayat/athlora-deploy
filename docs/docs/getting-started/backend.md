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
src/routes        one router per resource (athletes, events, timeline, results, auth)
src/controllers   thin HTTP handlers
src/services      pure business logic (result derivation, merge rules) — unit-tested
src/db            pg client + migrations
src/middleware    auth, error handling, not-implemented
src/types         domain DTOs (camelCase JSON)
```

## Database

The schema is defined by sequential SQL files in `src/db/migrations`. Apply all pending migrations with:

```bash
npm run db:migrate
```

The runner records names and SHA-256 checksums in `schema_migrations`, serializes concurrent runs with a PostgreSQL advisory lock, and applies each migration transactionally. It can baseline the original six-table schema if `0001_init.sql` was applied manually before the runner existed, but rejects partial schemas and modified applied migrations. Production `npm start` runs pending migrations before starting the API. `gen_random_uuid()` requires PostgreSQL 13+.

## Current state

- Public endpoint: `GET /health`. Legacy login/logout callback scaffolds under `/api/v1/auth` are public, while `PUT /api/v1/auth/me` verifies the Auth0 token, retrieves its `/userinfo` profile and upserts the matching application user. Application resource routes require an Auth0 access token. Athlete/event list handlers return empty lists after authentication, while CRUD and timeline/results mutations return `NOT_IMPLEMENTED` until Stage 1 features land.
- Errors use the standard `{ error: { code, message, details } }` shape via `src/middleware/errors.ts`.
- `src/middleware/auth.ts` verifies Auth0 JWT issuer and audience with `jose` and protects athlete, event, timeline and results routes. It returns `AUTH_NOT_CONFIGURED` until both `AUTH0_DOMAIN` and `AUTH0_AUDIENCE` are set.
- `src/db/client.ts` creates a `pg` pool from `DATABASE_URL`; the initial migration is applied to the Neon development database and tracked by the migration runner.
- Tests: Vitest + Supertest (app routes) and Vitest unit tests for result derivation. Runs with `npm run test`.

## Deployment

Skeleton deploys to **Render** (see the dev plan, Stage 1).

## AI declaration

This document was generated with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol].
