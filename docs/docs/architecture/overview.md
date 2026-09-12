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
│                        │  /api/v1/sync/batch         │                        │
└────────────────────────┘                             └────────────┬───────────┘
        │ Auth0 (login)                                              │ SQL
        │                                                           ▼
        │                                              ┌────────────────────────┐
        └──────────── Auth0 tenant ────────────────────│   PostgreSQL (Neon)    │
                                                       │   migrations in /db    │
                                                       └────────────────────────┘
┌────────────────────────┐
│  Socket.IO (realtime)  │
│  - Event subscriptions │
│  - Invalidation msgs   │
│  - Auth0 token auth    │
└────────────────────────┘

┌────────────────────────┐         WebSocket            ┌────────────────────────┐
│  Gemini Voice (AI)     │  ────────────────────────►  │  Google Gemini Live    │
│  Microphone capture    │  BidiGenerateContent        │  BidiGenerateContent   │
│  Audio playback        │  PCM 16kHz/24kHz            │  Tool calls            │
└────────────────────────┘                             └────────────────────────┘

┌────────────────────────┐
│  PWA Service Worker    │
│  - App shell cache     │
│  - API response cache  │
│  - IndexedDB (Dexie)   │
│  - Offline action queue│
│  - Sync on reconnect   │
└────────────────────────┘
```

## Frontend

- **State & structure**: feature folders (`src/features/*`). Shared primitives in `src/components`.
- **API access**: shared typed fetch client in `src/api/client.ts` preserves structured API error status/code/details; the roster consumes `src/api/athletes.ts` for list/create/full-replacement/archive/restore operations. The Auth0 bridge withholds authenticated content until `PUT /api/v1/auth/me` has synchronized the application user, and unauthenticated console entry invokes Auth0 rather than exposing protected views.
- **Offline-first**: Dexie/IndexedDB stores create/edit/undo actions in an offline queue when the network is unavailable. The designated offline logger per event owns the queue. On reconnect, the queue drains through `POST /api/v1/sync/batch` with idempotent action processing and optimistic version conflict detection.
- **PWA**: vite-plugin-pwa configures a service worker that caches the app shell and API responses. The app is installable with a manifest matching the Athlora branding.
- **Realtime**: online Socket.IO event subscriptions use the current Auth0 token and selected workspace context. They deliver only version-aware invalidations; feature screens refetch canonical HTTP state. Offline/PWA sync remains a later stage.
- **Design**: CSS variables from `src/styles/tokens.css`, CSS modules per component, Google Fonts loaded in `index.html`.
- **Public landing experience**: semantic React/HTML chapters remain separate from one lazy-loaded React Three Fiber canvas. A two-second visual-only Athlora brand opener precedes a short pre-hero scroll segment that drives a first-person, procedural side-stadium tunnel with dark Athlora panels, bright cyan/ice light channels, branded wall treatments, a shader-lit reflective floor, and a nearby portal onto the shared track. The deliberately minimal exterior has no stands, infield, or floodlights that could cross the controlled camera path, and the tunnel is removed from view immediately after the portal exit. One scroll-derived camera moves through the tunnel, aligns with a shared existing track lane, runs briefly with reduced head bob/FOV acceleration, then rises into a closer transform on the established Catmull-Rom track flight, deliberately skipping its distant opening approach. A composite timeline keeps that handoff physically continuous in either scroll direction; the existing track, signals, markers, and lane-to-performance-graph morph continue on their original story timeline. The canvas has a compact DPR/detail profile, a calmer reduced-motion profile, and remains decorative so all story content is available in the DOM.

## Backend

- **Routing**: resource routers under `src/routes` matching the database tables.
- **Services**: resource services own workspace-scoped PostgreSQL behavior for athletes, events and event participants; `src/services/weather.ts` validates the keyless Open-Meteo boundary and `src/services/venues.ts` is the Nominatim provider boundary. Business logic is never buried in route handlers.
- **Database access**: migration `0005_workspace_tenancy.sql` adds workspaces and migration `0006_workspace_roles_and_invitations.sql` limits memberships to coach/assistant, adds hashed expiring invitations, and records membership audit events.
- **Auth and account lifecycle**: authenticated resource context includes a validated active workspace selected with `X-Workspace-Id`. Central capability middleware grants coaches and assistants shared operational access while retaining coach-only Club membership administration, join-request review, participant-roster changes, and fixture-team withdrawals. The final coach cannot leave, be removed, demoted, or delete their account until another coach remains.

## Data flow for a live result

1. A coach logs a 100m finish or incident on the **Live Event** screen.
2. The frontend sends a `timeline_entries` request to the API over authenticated HTTP.
3. The API stores the append-only, soft-deletable, versioned entry.
4. The API recomputes the derived `results` row for that athlete and discipline, including placing and PB/SB effects.
5. The API broadcasts a non-authoritative invalidation to authorized online event viewers.
6. Each viewer refetches the authoritative timeline and result state over HTTP.

Socket authorization is rechecked on every explicit event subscription. A subscriber must have current workspace membership, accepted fixture participation, or an active event-helper grant. Grant revocation removes its active event subscription immediately; completed and cancelled events permit helper reads only for two hours. Socket messages do not carry a successful mutation result and do not replace HTTP authorization or optimistic-version checks.

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
- **Non-enumerating workspace isolation** — workspace selection and audit actors come from authenticated server context, never request payloads. A resource that is missing, malformed, nested under the wrong parent or in another workspace produces the same generic not-found response.
- **Provider boundary and fallback** — the browser calls authenticated `/venues/search`, not Nominatim. The server validates/reduces provider data, identifies itself, times out, caches and throttles according to the public policy. Search is explicit rather than autocomplete; selected and manually adjusted coordinates remain the existing event data, with a read-only OSM preview and external-link/coordinate fallback.

## Implementation status

Implemented in Stage 1: the 100m timing vertical slice, synchronized-auth gating and Auth0-hosted account lifecycle; API-backed roster, athlete performance detail, event lifecycle, Open-Meteo forecasts/current weather, assignments, live timeline correction/undo, result overrides, and dashboard aggregates. The public landing page uses a progressive React Three Fiber stadium-tunnel-to-track experience, while the premium coach console retains the approved visual direction; neither changes service boundaries. The event lifecycle, versioned timeline, audit trail, derived-result boundary, and discipline/unit columns are shared foundations for the remaining athletics-meet disciplines.

Implemented in Stage 2 (partial): offline-first PWA with service worker caching, IndexedDB action queue via Dexie, designated offline logger per event, idempotent batch sync endpoint, and optimistic version conflict detection. The app is installable as a Progressive Web App with offline shell and deterministic queue drain on reconnect. Additional Stage 2 features implemented: workspace switching, coach/assistant role enforcement, squad management, athlete lifecycle (active/inactive/archived), persistent injury records with 3D anatomy mapping, cross-workspace fixtures with RSVP, event helper invitations and offline designation, Socket.IO realtime invalidation, in-app event reminders, fixture notifications, public logger links, club onboarding with join requests, two-athlete comparison, single-athlete progression charts, athlete statistics, and Gemini voice assistant for voice-driven athlete creation.

Quality gates include unit/API integration suites, cross-coach isolation tests, and an expanded desktop/mobile Playwright suite (workspace, roles, squads, athlete lifecycle, injuries, event helpers, realtime, reminders, public logger, fixture notifications, authorization boundaries, migration verification, accessibility deep audit, routing, and analytics) with axe checks against a scratch PostgreSQL database.

## AI declaration

This document was created with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol], and updated with the assistance of OpenCode[gpt-5.6-terra].
