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
- **API access**: shared typed fetch client in `src/api/client.ts` preserves structured API error status/code/details; the roster consumes `src/api/athletes.ts` for list/create/full-replacement/archive/restore operations. The Auth0 bridge withholds authenticated content until `PUT /api/v1/auth/me` has synchronized the application user, and unauthenticated console entry invokes Auth0 rather than exposing protected views.
- **Offline (Stage 2+)**: Dexie/IndexedDB mirror for live-logging writes, PWA service worker, background sync, Socket.IO live updates.
- **Design**: CSS variables from `src/styles/tokens.css`, CSS modules per component, Google Fonts loaded in `index.html`.
- **Public landing experience**: semantic React/HTML content remains separate from one lazy-loaded cinematic layer. The desktop hero reveals the approved SDP-Landing track exactly — a 2D SVG oval (8 gradient lanes, start line, distance marks, lane numbers and javelin throw sector) shown in a soft-feather circular window that follows the pointer using the mockup's static alpha mask (so there is no hard lens ring) alongside a matching cursor glow; the SVG is tilted with a strong perspective for a more 3D read. From the features section downward, the lazy-loaded cinematic layer is a direct DOM/CSS port of the mockup's chase-camera rig: the same shared SVG oval is mounted in a two-layer wrapper where the track object translates by the negative runner position while an oblique drone camera (60° pitch, bend-dependent bank, fit-scaled zoom, yaw steered along the lane) completes one full lap exactly when the page is scrolled to the bottom. The shared `TrackArtwork` SVG and the per-frame camera/object transforms match the mockup exactly, and the whole scene fades per section (features `.23` → preview `.20` → how `.15` → faq `.075`). Camera easing is frame-rate independent (an 82ms exponential damping constant) so fast scrolling stays smooth and crisp, while the dark aurora background is preserved. Mobile and reduced-motion modes hide the scene entirely (matching the mockup) and hide the hero reveal. Actual scroll position enforces the hero/cinematic visibility boundary, and the scene does not change Auth0 or API behavior.

## Backend

- **Routing**: resource routers under `src/routes` matching the database tables.
- **Services**: resource services own coach-scoped PostgreSQL behavior for athletes, events and event participants; `src/services/weather.ts` isolates and validates the keyless Open-Meteo boundary; pure, unit-testable functions own result derivation (`src/services/resultDerivation.ts`, tested) and (Stage 3) merge rules — business logic is never buried in route handlers.
- **Database access**: `pg` pool in `src/db/client.ts`; sequential SQL files in `src/db/migrations` are checksum-tracked (line-ending-normalized) and applied before production startup. `0001_init.sql` and `0002_contract_100m.sql` are applied to Neon.
- **Auth and account lifecycle**: `src/middleware/auth.ts` verifies Auth0 JWT issuer and audience via `jose`, then resolves the verified subject to a typed application-user UUID/Auth0 ID/role context on resource routes. `PUT /api/v1/auth/me` intentionally uses token verification only so new identities can synchronize, but any durable deletion tombstone prevents re-synchronization and resource access. A backend-only, least-privilege Auth0 Management API client creates password tickets and deletes only the verified subject. Local deletion is transactional and a startup/interval reconciler retries partial external/database failures idempotently. Central ownership services scope athlete, event, timeline, participant and result access without disclosing cross-coach resources; public results pages (Stage 3) will be explicitly allow-listed.

## Data flow for a live result

1. A coach logs an attempt on the **Live Event** screen.
2. The frontend POSTs a `timeline_entries` row (offline: writes to IndexedDB first, syncs later).
3. The API stores the append-only entry (soft-deletable, versioned).
4. The API recomputes the derived `results` row for that athlete/discipline.
5. Other connected clients receive the update (Socket.IO, Stage 2).

## Deployment

- Frontend → Vercel (`https://athlora-deploy.vercel.app`)
- Backend → Render (`https://athlora-deploy.onrender.com`)
- Docs site → Cloudflare Pages (`https://athlora-deploy.pages.dev`)
- Postgres → Neon (Frankfurt)

## Design decisions

- **UUIDs everywhere** — client-generated IDs can be valid PKs, enabling offline creation without ID collisions.
- **Soft deletes** — undo is a tombstone (`deleted_at`), not a destructive delete.
- **Derived results with manual override** — stats come from the timeline log, but a coach can correct with `manual_override` + audit trail.
- **Timed vs measured disciplines** — the UI and result rules branch on whether a discipline is track (time) or field (distance/height).
- **Non-enumerating ownership** — owner IDs and audit actors come from authenticated server context, never request payloads. A resource that is missing, malformed, nested under the wrong parent or owned by another coach produces the same generic not-found response.

## Implementation status

Implemented in Stage 1: a cinematic public landing page with an accessible HTML/CSS interface and a mockup-exact SVG/CSS track experience; synchronized-auth gating and Auth0-hosted account lifecycle; API-backed roster, athlete profile/performance detail, event lifecycle, Open-Meteo forecasts and assignment workflows; hardened track-side timeline logging with lifecycle-aware versioned correction/undo; and result read/override with canonical recomputation. The landing page preserves the existing Auth0 login, signup and password-help callbacks while lazy-loading its DOM/SVG cinematic layer (no WebGL). The reachable Account view supports password management, sign-out and confirmed permanent identity/workspace deletion, backed by durable stale-token protection and retry reconciliation. Event detail independently loads a validated venue-local daily forecast, while it and Live Logging share one result presentation layer that applies the backend's effective-value precedence, preserves authoritative placing/PB/SB fields, shows non-void penalties and incident outcomes, and keeps manual corrections beside their original derivation and current audit metadata. The logger treats athlete/timeline data as primary and standings/history as independently recoverable, waits for authoritative refresh after writes, and exits stale controls when another client closes the event. The athlete detail view combines editable profile data with owner-scoped PB, calendar-year SB/counts and recent competition/training history, preserving explicit override, incident, best and non-scoring labels. The coach dashboard consumes the repeatable-read aggregate snapshot directly: one deterministically selected active event receives progress, latest entries and an exact logger handoff, while summary mode exposes factual roster, upcoming-event and recent result/PB data with onboarding and direct record navigation. Aggregate reads use one repeatable-read snapshot, cancelled events do not score, and archived identity is retained only in historical feeds. The coach console now ships as the approved premium dark-aurora redesign (with a light "Aurora Mist/Ice" toggle): a sidebar/topbar shell with squad readiness, live clock and a proxied live weather readout (`GET /api/v1/weather/current`, device geolocation with timezone-city fallback), an animated weather scene, and Dashboard/Athletes/Events/Live Logger/Account views sharing one theme-aware `--console-*` token namespace — every displayed figure remains real aggregate data.

Quality gates cover the whole stack: unit/API integration suites for both packages, a `TEST_DATABASE_URL`-gated backend suite that includes cross-coach ownership-isolation tests, and a deterministic Playwright suite (`/e2e`) that signs in through real Auth0 Universal Login and proves the full 100m vertical slice on desktop and mobile Chromium against a scratch PostgreSQL (roster → events → assignment → live logging → timeline correction/undo → result overrides → completion → statistics and dashboard), finishing with an axe accessibility audit of the key coach views. The Gitea Actions `e2e` job provisions a Postgres service container and skips with a clear message until the Auth0/E2E credentials are configured as repository secrets.

## AI declaration

This document was generated with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol].
