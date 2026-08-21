---
sidebar_position: 1
---

# Architecture overview

Athlora is a non-monolithic web app: a React SPA and an Express API are separate deployables communicating over HTTP/JSON. This is a hard project requirement — no framework that fuses frontend and backend is allowed.

Athlora's product scope is the full athletics meet: track races, hurdles, relays, race walks, jumps, throws, and vertical events. The current deployed implementation is a 100m timing vertical slice; its timeline, result, and ownership architecture is the base for adding the remaining disciplines without changing the service boundaries.

## High-level diagram

```
┌────────────────────────┐         HTTP (JSON)         ┌────────────────────────┐
│  React + Vite (Vercel) │  ────────────────────────►  │  Express API (Render)  │
│  /frontend             │  /api/v1/*  (Bearer JWT)   │  /backend              │
└────────────────────────┘                             └────────────┬───────────┘
        │ Auth0 (login)                                              │ SQL
        │                                                           ▼
        │                                              ┌────────────────────────┐
        └──────────── Auth0 tenant ────────────────────│   PostgreSQL (Neon)    │
                                                      │   migrations in /db    │
                                                      └────────────────────────┘
```

## Frontend

- **State & structure**: feature folders (`src/features/*`). Shared primitives in `src/components`.
- **API access**: shared typed fetch client in `src/api/client.ts` preserves structured API error status/code/details; the roster consumes `src/api/athletes.ts` for list/create/full-replacement/archive/restore operations. The Auth0 bridge withholds authenticated content until `PUT /api/v1/auth/me` has synchronized the application user, and unauthenticated console entry invokes Auth0 rather than exposing protected views.
- **Offline (Stage 2+)**: Dexie/IndexedDB mirror for live-logging writes, PWA service worker, background sync, Socket.IO live updates.
- **Design**: CSS variables from `src/styles/tokens.css`, CSS modules per component, Google Fonts loaded in `index.html`.

## Backend

- **Routing**: resource routers under `src/routes` matching the database tables.
- **Services**: resource services own coach-scoped PostgreSQL behavior for athletes, events and event participants; `src/services/weather.ts` validates the keyless Open-Meteo boundary for both owned event forecasts and authenticated current-weather requests; pure, unit-testable functions own result derivation (`src/services/resultDerivation.ts`, tested) and Stage 3 merge rules. Business logic is never buried in route handlers.
- **Database access**: `pg` pool in `src/db/client.ts`; sequential SQL files in `src/db/migrations` are checksum-tracked (line-ending-normalized) and applied before production startup. Migrations `0001_init.sql` through `0004_account_lifecycle.sql` are applied to Neon.
- **Auth and account lifecycle**: `src/middleware/auth.ts` verifies Auth0 JWT issuer and audience via `jose`, then resolves the verified subject to a typed application-user UUID/Auth0 ID/role context on resource routes. `PUT /api/v1/auth/me` intentionally uses token verification only so new identities can synchronize, but any durable deletion tombstone prevents re-synchronization and resource access. A backend-only, least-privilege Auth0 Management API client creates password tickets and deletes only the verified subject. Local deletion is transactional and a startup/interval reconciler retries partial external/database failures idempotently. Central ownership services scope athlete, event, timeline, participant and result access without disclosing cross-coach resources; public results pages (Stage 3) will be explicitly allow-listed.

## Data flow for a live result

1. A coach logs a 100m finish or incident on the **Live Event** screen.
2. The frontend sends a `timeline_entries` request to the API over authenticated HTTP.
3. The API stores the append-only, soft-deletable, versioned entry.
4. The API recomputes the derived `results` row for that athlete and discipline, including placing and PB/SB effects.
5. The frontend refreshes the authoritative timeline and result state.

Stage 2 will extend this path by writing to IndexedDB before sync and broadcasting accepted changes to other event viewers through Socket.IO. Those offline and realtime paths are not yet implemented.

## Deployment

- Frontend → Vercel (`https://athlora-deploy.vercel.app`)
- Backend → Render (`https://athlora-deploy.onrender.com`)
- Docs site → Cloudflare Pages (`https://athlora-deploy.pages.dev`)
- Postgres → Neon (Frankfurt)

## Design decisions

- **UUIDs everywhere** — current rows receive UUID primary keys from PostgreSQL. The same key type supports future client-generated IDs for offline creation without collisions.
- **Soft deletes** — undo is a tombstone (`deleted_at`), not a destructive delete.
- **Derived results with manual override** — stats come from the timeline log, but a coach can correct with `manual_override` + audit trail.
- **Timed vs measured disciplines** — the schema and result-service foundation accommodate track times and field measurements. The deployed API/UI currently enforces 100m timing; each later discipline will add its own validation, entry controls, derivation, and placing rules.
- **Non-enumerating ownership** — owner IDs and audit actors come from authenticated server context, never request payloads. A resource that is missing, malformed, nested under the wrong parent or owned by another coach produces the same generic not-found response.

## Implementation status

Implemented in Stage 1: the 100m timing vertical slice, synchronized-auth gating and Auth0-hosted account lifecycle; API-backed roster, athlete profile/performance detail, event lifecycle, Open-Meteo forecasts and assignment workflows; hardened track-side timeline logging with lifecycle-aware versioned correction/undo; result read/override with canonical recomputation; and an API-backed dashboard. The event lifecycle, versioned timeline, audit trail, derived-result boundary, and discipline/unit columns are shared foundations for the remaining athletics-meet disciplines. The next discipline work will add explicit validation, data-entry controls, result derivation, placing, PB/SB, and test coverage for each timed or measured event type rather than treating them as a variation of the 100m rules.

## AI declaration

This document was created with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol], and updated with the assistance of OpenCode[gpt-5.6-terra].
