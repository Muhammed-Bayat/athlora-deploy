---
sidebar_position: 1
---

# Architecture overview

Athlora is a non-monolithic web app: a React SPA and an Express API are separate deployables communicating over HTTP/JSON. This is a hard project requirement — no framework that fuses frontend and backend is allowed.

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
- **API access**: shared typed fetch client in `src/api/client.ts`; per-resource wrappers are added as features land.
- **Offline (Stage 2+)**: Dexie/IndexedDB mirror for live-logging writes, PWA service worker, background sync, Socket.IO live updates.
- **Design**: CSS variables from `src/styles/tokens.css`, CSS modules per component, Google Fonts loaded in `index.html`.

## Backend

- **Routing**: resource routers under `src/routes` matching the database tables.
- **Services**: pure, unit-testable functions for result derivation (`src/services/resultDerivation.ts`, tested) and (Stage 3) merge rules — never buried in route handlers.
- **Database access**: `pg` pool in `src/db/client.ts`; sequential SQL files in `src/db/migrations` are checksum-tracked and applied before production startup. `0001_init.sql` is applied to Neon.
- **Auth**: `src/middleware/auth.ts` verifies Auth0 JWT issuer and audience via `jose` on application resource routes; public results pages (Stage 3) will be explicitly allow-listed.

## Data flow for a live result

1. A coach logs an attempt on the **Live Event** screen.
2. The frontend POSTs a `timeline_entries` row (offline: writes to IndexedDB first, syncs later).
3. The API stores the append-only entry (soft-deletable, versioned).
4. The API recomputes the derived `results` row for that athlete/discipline.
5. Other connected clients receive the update (Socket.IO, Stage 2).

## Deployment

- Frontend → Vercel
- Backend → Render
- Docs site → Cloudflare Pages
- Postgres → Neon or university instance

## Design decisions

- **UUIDs everywhere** — client-generated IDs can be valid PKs, enabling offline creation without ID collisions.
- **Soft deletes** — undo is a tombstone (`deleted_at`), not a destructive delete.
- **Derived results with manual override** — stats come from the timeline log, but a coach can correct with `manual_override` + audit trail.
- **Timed vs measured disciplines** — the UI and result rules branch on whether a discipline is track (time) or field (distance/height).

## Implementation status

Implemented at the scaffold stage: frontend shell with feature placeholders, backend route/middleware/service shell, tokens, init migration, CI workflow and all automated checks. Still to build in Stage 1: real CRUD for athletes/events, Open-Meteo weather, live timeline logging endpoints + UI, and results/dashboard wiring (see the dev plan).

## AI declaration

This document was generated with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol].
