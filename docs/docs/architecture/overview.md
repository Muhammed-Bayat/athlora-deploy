---
sidebar_position: 1
---

# Architecture overview

Athlora is a non-monolithic web app: a React SPA and an Express API are separate deployables communicating over HTTP/JSON. This is a hard project requirement — no framework that fuses frontend and backend is allowed.

Athlora's deployed athletics-meet scope is a focused catalogue of track races and hurdles, selected jumps and throws, high jump, and 4 x 100m relay. It builds on the original 100m timeline foundation; that timeline, result, and ownership architecture is the base for remaining additions such as multi-events and automated season scheduling without changing the service boundaries.

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
                                                       │   migrations in src/db │
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

- **State & structure**: feature folders (`src/features/*`) covering landing, auth, dashboard, athletes, events, timeline (live logging), results, comparison, fixtures, fitness, assistant, public logger, public stats, public schedule, realtime and reports. Shared primitives in `src/components`.
- **Routing**: `react-router-dom` (`src/App.tsx`) separates the authenticated `/console/*` surfaces from public routes. `/log/:token`, `/stats*` and `/schedule*` are short-circuited in `src/main.tsx` before the Auth0 provider mounts so they render without Auth0 environment variables; the landing page and `/invitations/:token` render inside the provider.
- **API access**: shared typed fetch client in `src/api/client.ts` preserves structured API error status/code/details; the roster consumes `src/api/athletes.ts` for list/create/full-replacement/archive/restore operations. The Auth0 bridge withholds authenticated content until `PUT /api/v1/auth/me` has synchronized the application user, and unauthenticated console entry invokes Auth0 rather than exposing protected views.
- **Offline-first**: Dexie/IndexedDB stores create/edit/undo actions in an offline queue when the network is unavailable (auth database `version(2)` with `offlineActions`, `cachedEvents`, `cachedParticipants`, `cachedTimeline`, `cachedSessions`; a separate public-logger database holds `publicOfflineActions`, `publicCachedSessions` and `publicCachedSnapshots`). The designated offline logger per event owns the queue. On reconnect, the queue drains through `POST /api/v1/sync/batch` with idempotent action processing and optimistic version conflict detection.
- **PWA**: vite-plugin-pwa configures a service worker that caches the app shell and API responses (with a `NetworkOnly` rule for `/api/v1/public/logger/*`). The app is installable with a manifest matching the Athlora branding.
- **Realtime**: online Socket.IO event subscriptions use the current Auth0 token and selected workspace context. They deliver only version-aware invalidations; feature screens refetch canonical HTTP state. Offline/PWA actions drain deterministically on reconnect through the batch sync endpoint.
- **Design**: CSS variables from `src/styles/tokens.css`, CSS modules per component, web fonts loaded in `index.html` (Google Fonts and Fontshare).
- **Public landing experience**: semantic React/HTML chapters remain separate from one lazy-loaded React Three Fiber canvas. A two-second visual-only Athlora brand opener precedes a short pre-hero scroll segment that drives a first-person, procedural side-stadium tunnel with dark Athlora panels, bright cyan/ice light channels, branded wall treatments, a shader-lit reflective floor, and a nearby portal onto the shared track. The deliberately minimal exterior has no stands, infield, or floodlights that could cross the controlled camera path, and the tunnel is removed from view immediately after the portal exit. One scroll-derived camera moves through the tunnel, aligns with a shared existing track lane, runs briefly with reduced head bob/FOV acceleration, then rises into a closer transform on the established Catmull-Rom track flight, deliberately skipping its distant opening approach. A composite timeline keeps that handoff physically continuous in either scroll direction; the existing track, signals, markers, and lane-to-performance-graph morph continue on their original story timeline. The canvas has a compact DPR/detail profile, a calmer reduced-motion profile, and remains decorative so all story content is available in the DOM.

## Backend

- **Routing**: resource routers under `src/routes` matching the database tables; handlers stay thin and delegate request/response shaping to a controller layer.
- **Controllers**: `src/controllers` owns response envelopes, status codes and orchestration for every route, with request bodies parsed through `src/validation` parsers that reject unknown fields. Business logic is never buried in route handlers.
- **Services**: resource services own workspace-scoped PostgreSQL behavior for athletes, events and event participants; `src/services/weather.ts` owns GraySky validation, US-customary-to-metric normalization and shared ten-minute caching, while `src/services/venues.ts` is the Nominatim provider boundary. Discipline-specific derivation lives in `resultDerivation.ts` (legacy timed), `timedDerivation.ts`, `measuredDerivation.ts` and `verticalScoring.ts`.
- **Realtime**: `src/realtime` owns Socket.IO rooms, Auth0 token verification, workspace-scoped authorization, and version-aware invalidation broadcasts.
- **Database access**: migration `0005_workspace_tenancy.sql` adds workspaces and migration `0006_workspace_roles_and_invitations.sql` limits memberships to coach/assistant, adds hashed expiring invitations, and records membership audit events.
- **Auth and account lifecycle**: authenticated resource context includes a validated active workspace selected with `X-Workspace-Id`. Central capability middleware grants coaches and assistants shared operational access while retaining coach-only Club membership administration, join-request review, participant-roster changes, and fixture-team withdrawals. The final coach cannot leave, be removed, demoted, or delete their account until another coach remains.

## Data flow for a live result

1. A coach logs a finish, incident, or session entry on the **Live Event** screen.
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
- **Timed vs measured vs vertical disciplines** — the schema and result-service foundation accommodate track times, field measurements and high-jump clearances. The catalogue ships 100m, 200m, 400m, 800m, 1500m, 100m hurdles, 400m hurdles, long jump, triple jump, shot put, discus, javelin, high jump, and 4 x 100m relay; each has its own validation, entry controls, derivation and placing rules. The legacy `/api/v1/events` timeline endpoints remain pinned to 100m for backwards compatibility.
- **Non-enumerating workspace isolation** — workspace selection and audit actors come from authenticated server context, never request payloads. A resource that is missing, malformed, nested under the wrong parent or in another workspace produces the same generic not-found response.
- **Provider boundary and fallback** — the browser calls authenticated `/venues/search`, not Nominatim. The server validates/reduces provider data, identifies itself, times out, caches and throttles according to the public policy. Search is explicit rather than autocomplete; selected and manually adjusted coordinates remain the existing event data, with a read-only OSM preview and external-link/coordinate fallback.

## Implementation status

Implemented in Stage 1: the original 100m timing foundation (now one session type within the catalogue), synchronized-auth gating and Auth0-hosted account lifecycle; API-backed roster, athlete performance detail, event lifecycle, forecasts/current weather, assignments, live timeline correction/undo, result overrides, and dashboard aggregates. Weather now uses GraySky Free current/daily data, nullable DTOs, existing condition visuals and linked attribution. The public landing page and premium coach console retain their approved visual direction; service boundaries remain unchanged. The event lifecycle, versioned timeline, audit trail, derived-result boundary, and discipline/unit columns are shared foundations for the athletics-meet catalogue.

Implemented in Stage 2: offline-first PWA with service worker caching, IndexedDB action queue via Dexie, designated offline logger per event, idempotent batch sync endpoint, optimistic version conflict detection, and offline conflict reconciliation with per-session resolution endpoints. The app is installable as a Progressive Web App with offline shell and deterministic queue drain on reconnect. Additional Stage 2 features implemented: workspace switching, coach/assistant role enforcement, athlete lifecycle (active/inactive/archived), persistent injury records with 3D anatomy mapping, cross-workspace fixtures with RSVP, event helper invitations and offline designation, Socket.IO realtime invalidation, in-app event reminders, fixture notifications, public logger links, club onboarding with join requests, two-athlete and multi-club/multi-discipline comparison, single-athlete progression charts, athlete statistics, the Gemini voice assistant with catalogue-aware athlete/discipline analysis and validated athlete drafts, independent club publication flags with unauthenticated public schedule endpoints gated only by `publicScheduleEnabled`, the standalone public schedule experience (`/schedule`, `/schedule/:clubId` with cross-links from the landing page and public stats, event `disciplines` projection, and non-disclosing disabled/unknown club states), public statistics pages with leaderboard, standings and shareable PDF/CSV report export, club branding with a WCAG-checked primary color and S3-compatible logo/cover storage, and athlete preferred disciplines with private measurable season goals.

Implemented multi-discipline catalogue and relay foundation (Sprint 3): catalogue-backed discipline definitions and sessions with entrants for 100m, 200m, 400m, 800m, 1500m, 100m hurdles, 400m hurdles, high jump, long jump, triple jump, javelin, discus, shot put, and the 4 x 100m relay. Coach-editable rosters while the meet is scheduled, session-scoped logging with offline enqueue, official-result finalization, coach-selected official entry (`selected_entry_id`) independent of `manual_override`, automatic read-time standings, athlete relay history that never writes PB/stats, and public session/team places on the Stats page using safe member summaries only. Schema support runs through migration `0041_remove_squads.sql`, after `0040_remove_club_accent_color.sql` dropped the club accent colour.

Quality gates include unit/API integration suites, cross-coach isolation tests, and an expanded desktop/mobile Playwright suite of 23 spec files (workspace, roles, athlete lifecycle, injuries, event helpers, realtime, reminders, public logger, fixture notifications, fixtures, public schedule, public statistics report, comparison, offline logging, authorization boundaries, migration verification, accessibility deep audit, routing, analytics, vertical events, relay session logging, the core vertical flow, and the anonymous smoke test) with axe checks against a scratch PostgreSQL database.

## AI declaration

This document was created with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol], and updated with the assistance of OpenCode[gpt-5.6-terra]. The GraySky migration documentation was edited with OpenCode[openai/gpt-6-astra]. The independent publication flags and public schedule endpoints were documented with the assistance of opencode[mimo-v2.6-flash-free]. The multi-discipline relay foundation notes were documented with the assistance of opencode[mimo-v2.6-flash-free]. The public club schedule experience was documented with the assistance of opencode[mimo-v2.6-flash-free]. The scope framing, layer descriptions, and implementation-status refresh were updated with the assistance of opencode[mimo-v2.6-flash-free] and OpenCode[openai/gpt-5.6-terra]. The supported-discipline catalogue was updated with OpenCode[gpt-5.6-terra].
