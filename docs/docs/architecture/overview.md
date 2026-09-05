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
│  PWA Service Worker    │
│  - App shell cache     │
│  - API response cache  │
│  - IndexedDB (Dexie)   │
│  - Offline action queue│
└────────────────────────┘
```

## Frontend

- **State & structure**: feature folders (`src/features/*`). Shared primitives in `src/components`.
- **API access**: shared typed fetch client in `src/api/client.ts` preserves structured API error status/code/details; the roster consumes `src/api/athletes.ts` for list/create/full-replacement/archive/restore operations. The Auth0 bridge withholds authenticated content until `PUT /api/v1/auth/me` has synchronized the application user, and unauthenticated console entry invokes Auth0 rather than exposing protected views.
- **Offline-first**: Dexie/IndexedDB stores create/edit/undo actions in an offline queue when the network is unavailable. The designated offline logger per event owns the queue. On reconnect, the queue drains through `POST /api/v1/sync/batch` with idempotent action processing and optimistic version conflict detection.
- **PWA**: vite-plugin-pwa configures a service worker that caches the app shell and API responses. The app is installable with a manifest matching the Athlora branding.
- **Realtime**: online Socket.IO event subscriptions use the current Auth0 token and selected workspace context. They deliver only version-aware invalidations; feature screens refetch canonical HTTP state. Offline/PWA sync remains a later stage.
- **Design**: CSS variables from `src/styles/tokens.css`, CSS modules per component, Google Fonts loaded in `index.html`.
- **Public landing experience**: semantic React/HTML content remains separate from one lazy-loaded cinematic layer. The desktop hero reveals the approved SDP-Landing track exactly — a 2D SVG oval (8 gradient lanes, start line, distance marks, lane numbers and javelin throw sector) shown in a soft-feather circular window that follows the pointer using the mockup's static alpha mask (so there is no hard lens ring) alongside a matching cursor glow; the SVG is tilted with a strong perspective for a more 3D read. From the features section downward, the lazy-loaded cinematic layer is a direct DOM/CSS port of the mockup's chase-camera rig: the same shared SVG oval is mounted in a two-layer wrapper where the track object translates by the negative runner position while an oblique drone camera (60° pitch, bend-dependent bank, fit-scaled zoom, yaw steered along the lane) completes one full lap exactly when the page is scrolled to the bottom. The shared `TrackArtwork` SVG and the per-frame camera/object transforms match the mockup exactly, and the whole scene fades per section (features `.23` → preview `.20` → how `.15` → faq `.075`). Camera easing is frame-rate independent (an 82ms exponential damping constant) so fast scrolling stays smooth and crisp, while the dark aurora background is preserved. Mobile and reduced-motion modes hide the scene entirely (matching the mockup) and hide the hero reveal. Actual scroll position enforces the hero/cinematic visibility boundary, and the scene does not change Auth0 or API behavior.

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

Implemented in Stage 1: the 100m timing vertical slice, synchronized-auth gating and Auth0-hosted account lifecycle; API-backed roster, athlete performance detail, event lifecycle, Open-Meteo forecasts/current weather, assignments, live timeline correction/undo, result overrides, and dashboard aggregates. The public landing page and premium coach console implement the approved SVG/CSS visual direction without changing service boundaries. The event lifecycle, versioned timeline, audit trail, derived-result boundary, and discipline/unit columns are shared foundations for the remaining athletics-meet disciplines.

Implemented in Stage 2 (partial): offline-first PWA with service worker caching, IndexedDB action queue via Dexie, designated offline logger per event, idempotent batch sync endpoint, and optimistic version conflict detection. The app is installable as a Progressive Web App with offline shell and deterministic queue drain on reconnect. Additional Stage 2 features implemented: workspace switching, coach/assistant role enforcement, squad management, athlete lifecycle (active/inactive/archived), persistent injury records with 3D anatomy mapping, cross-workspace fixtures with RSVP, event helper invitations and offline designation, Socket.IO realtime invalidation, in-app event reminders, fixture notifications, public logger links, club onboarding with join requests, two-athlete comparison, single-athlete progression charts, and athlete statistics.

Quality gates include unit/API integration suites, cross-coach isolation tests, and an expanded desktop/mobile Playwright suite (workspace, roles, squads, athlete lifecycle, injuries, event helpers, realtime, reminders, public logger, fixture notifications, authorization boundaries, migration verification, accessibility deep audit, routing, and analytics) with axe checks against a scratch PostgreSQL database.

## AI declaration

This document was created with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol], and updated with the assistance of OpenCode[gpt-5.6-terra].
