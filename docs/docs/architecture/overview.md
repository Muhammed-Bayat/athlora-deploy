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
- **API access**: one typed fetch wrapper per resource in `src/api`.
- **Offline (Stage 2+)**: Dexie/IndexedDB mirror for live-logging writes, PWA service worker, background sync, Socket.IO live updates.
- **Design**: CSS variables from `src/styles/tokens.css`, CSS modules per component, Google Fonts loaded in `index.html`.

## Backend

- **Routing**: resource routers under `src/routes` matching the database tables.
- **Services**: pure, unit-testable functions for result derivation and (Stage 3) merge rules — never buried in route handlers.
- **Database access**: `pg` pool in `src/db/client.ts`; schema is migration files in `src/db/migrations`.
- **Auth**: `src/middleware/auth.ts` verifies Auth0 JWTs via `jose`. Non-public routes require `Authorization: Bearer <JWT>`; public results pages (Stage 3) are explicitly allow-listed.

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