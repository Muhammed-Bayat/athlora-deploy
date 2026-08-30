---
sidebar_position: 1
---

# Frontend

The `/frontend` package is the Athlora React single-page application. It is a separate deployment from the Express API and communicates only through authenticated HTTP/JSON requests. The shipped live-logging UI covers 100m; the product roadmap expands it into the full athletics-meet interface.

## Requirements

- Node.js 22 LTS recommended (Node.js 20 or later supported)
- npm
- A running backend and Auth0 SPA application for authenticated features

## Run locally

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Vite serves the app at `http://localhost:5173`. Start the backend separately on `http://localhost:4000` before signing in.

## Environment

`.env.local` is ignored by Git. Set these Vite variables:

```dotenv
VITE_API_BASE_URL=http://localhost:4000
VITE_AUTH0_DOMAIN=your-tenant.eu.auth0.com
VITE_AUTH0_CLIENT_ID=your-spa-client-id
VITE_AUTH0_AUDIENCE=https://api.example.com
```

`VITE_*` values are embedded in the browser build. They must contain only public configuration, never Management API credentials or database URLs. In Auth0, register `http://localhost:5173` as an allowed callback URL, logout URL, and web origin.

The Playwright E2E suite boots a separate Vite dev server on `http://localhost:5174` (strict port) with `VITE_API_BASE_URL=http://localhost:4100` and the same `VITE_AUTH0_*` variables — see `getting-started/scripts.md`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite development server with HMR. |
| `npm run build` | Type-check and create `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm run typecheck` | Run strict TypeScript project checks. |
| `npm run test` | Run Vitest and React Testing Library once. |
| `npm run lint` | Run ESLint. |

## Application structure

- `src/features` contains feature-owned UI for landing, authentication, dashboard, athletes, events, live logging, and results.
- `src/components` contains reusable accessible controls and async states.
- `src/api` contains the typed fetch client and one module per API resource. It preserves the API error code, message, status, and validation details.
- `src/types` mirrors the API's camel-case DTOs. The current contract is 100m results in seconds; later contracts will add the units and entry shapes required by track, relays, jumps, throws, and vertical events.
- `src/styles/tokens.css` contains shared visual tokens. Component and feature styling uses CSS modules.

## Implemented features

- Auth0 Universal Login, application-user synchronization, account password links, sign-out, and permanent account deletion.
- API-backed dashboard with summary, live-event, loading, onboarding, and recovery states.
- Athlete roster management, archival/restoration, editable athlete profiles, current 100m performance statistics, PBs, and SBs. Athlete profiles are intended to become multi-discipline records.
- Event creation, lifecycle changes, participant RSVP management, results, manual corrections, and event-day Open-Meteo forecasts.
- Mobile-first live 100m logging with finishes, incidents, version-aware corrections, undo, derived standings, and lifecycle guards. These interaction and recovery patterns are the base for future race, relay, jump, throw, and height-entry controls.
- A responsive coach console with an optional weather-effects display, theme preference, live clock, and current local weather readout.
- A shell-contained athlete Fitness & Injury Map sub-view with progressive body-region selection, live temporary injury previews, active-injury resolution, and an on-demand React Three Fiber anatomical body viewer. Injury data intentionally remains in the current athlete-performance page session only; a persistent injury API/schema will be added later.

The dashboard and other authenticated views wait for `PUT /api/v1/auth/me` to finish successfully. If synchronization fails, the UI provides a retry state instead of showing protected data.

## Canonical console routes

- `/console` — dashboard
- `/console/athletes` and `/console/athletes/:athleteId` — roster and athlete detail
- `/console/events` and `/console/events/:eventId` — event list and direct-loadable event detail
- `/console/live` and `/console/live/:eventId` — live logger and selected event
- `/console/account` — account management

Unauthenticated console visits return to the requested canonical path after Auth0 completes. Event list date, type, and status filters are retained in its query string when opening and returning from detail.

## Testing

Frontend tests cover UI behavior, accessibility interactions, API wrappers, authenticated state, dashboard states, athlete and event workflows, live logging, result corrections, and weather handling. Run them with:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

For browser-level coverage of the full stack, use the [E2E guide](./e2e).
- The app shell renders with **Athlora** branding and an ink sidebar. The roster, event-management and dashboard views are live against the typed API.
- Weather presets use paired semantic surface, text, control, status and focus colors across the authenticated console. `night` and `night-rain` keep dashboards, forms, dialogs, badges, result boards, empty states and live-logging controls consistently dark and readable without changing the approved Athlora palette; disabling Weather FX removes the weather theme.
- The console shell is a premium dark aurora redesign of `Athlora_Premium_Dashboard.html` with a light "Aurora Mist/Ice" toggle (`localStorage` `athlora-theme`, `theme-light` class on `<html>`). The topbar shows a live weather readout for the coach's device location (geolocation with timezone-city fallback, refreshed every 10 minutes while visible) proxied through `GET /api/v1/weather/current`, a weather-effects toggle with an animated scene, and a live clock. Dashboard, Athletes, Events, Live Logger and Account views all consume the same `--console-*` tokens; the mockup dashboard's fabricated numbers are replaced with real aggregate data.
- Auth0 Universal Login is wired through `@auth0/auth0-react` for sign-up, sign-in, password help and sign-out. After synchronization, the console loads accessible workspaces, restores a validated per-subject selection, sends it centrally as `X-Workspace-Id`, and exposes an accessible sidebar switcher. Switching resets and remounts dashboard, roster, events, and live logger state so similarly named resources cannot leak between workspaces. Account deletion removes the caller's identity and memberships, not shared workspace data.
- API failures use a typed `ApiError` that preserves the backend HTTP status, error code, message and details, including `AUTH_USER_NOT_SYNCHRONIZED` recovery information. Account synchronization failures display the safe API error code and correlation reference so operators can match a failed sign-in to backend logs without collecting credentials. Single-resource response envelopes are unwrapped by the shared client and empty successful responses are handled without JSON parse failures.
- `src/api/statistics.ts` and `src/api/dashboard.ts` expose the combined athlete statistics/history and dashboard summary resources through DTOs mirrored from the backend. Athlete performance detail consumes the statistics resource directly. The dashboard consumes the stable summary/live aggregate with loading and retry states, active-event progress and latest entries, onboarding, factual roster/event/result/PB panels, and targeted navigation to athlete details, event details and the selected live logger. Summary mode uses the approved signature hero with a live greeting/clock and reduced-motion-aware orbit animation, while every displayed count comes from the aggregate.
- Design tokens from the approved mockups are encoded once in `src/styles/tokens.css`; Google Fonts (Space Grotesk, Satoshi, Inter — loaded with Space Grotesk as the mono) load in `index.html`. The premium console's `--console-*` namespace (dark aurora default + `html.theme-light` overrides) lives on the shell in `CoachConsole.module.css`.
- `src/features/athletes/AthletesPage.tsx` consumes the coach-owned UUID athlete DTO through `src/api/athletes.ts`. It loads active, inactive, and archived athletes, provides immediate name/squad/status filters plus status counts and badges, renders distinct loading/error-retry/empty/filter-empty states, and persists create, full-replacement edit, lifecycle transition, archive and restore operations. `AthleteForm` is shared by roster and detail editing; archived athlete profiles are read-only until restored.
- `AthleteDetailPage` combines the editable API profile with owner-scoped 100m statistics in a performance-first layout: a featured athlete identity panel, PB/calendar-year SB/count KPI strip, compact profile details and keyboard-accessible competition/training history tabs. Full-width result rows keep effective times, overrides, incidents, PB/SB and cancelled/non-scoring states explicit in text. Profile and statistics requests load and retry independently, while opening and returning move focus between the detail heading and the exact originating roster action without adding a routing dependency.
- Archive confirmation explains that event assignments, timeline entries and results are preserved. Shared modal focus management supports Escape, Tab containment, focus restoration and blocked dismissal during submission; success/error feedback is announced and the responsive card grid collapses for mobile use.
- `src/features/events/EventsPage.tsx` loads coach-owned 100m events through `src/api/events.ts`, supports list and calendar views with date/type/status filters, and provides distinct loading, retry, empty and filter-empty states. `EventDetailPage.tsx` is a dedicated direct-loadable route with retry/not-found states; create/edit and lifecycle confirmations remain accessible modal overlays.
- Event detail uses the participant and active-roster APIs to list current assignments, retain inactive/archived historical participants, assign only active athletes with pending RSVP status, replace RSVP status, acknowledge independent lifecycle-review items, and confirm assignment removal. Participant and roster failures retry independently, persistence blocks modal-changing actions, and removal messaging explains that timeline entries and results remain intact.
- Event detail independently loads its Open-Meteo event-day forecast when both coordinates are present. It shows WMO conditions, Celsius range, rain probability, maximum wind and venue timezone; missing coordinates and unsupported dates are quiet guidance states, while service failures are announced with an isolated retry that does not block results, assignments or event actions. In-flight requests abort when detail closes.
- `src/api/timeline.ts` exposes typed active-list/create/version-aware PATCH/DELETE requests. Correction payloads require `expectedVersion`, limit edits to valid entry-type fields, and send the DELETE precondition in its JSON body. `LiveLoggingPage` consumes fresh event detail, assignments and timeline data for finish/incident logging, correction and accessible confirmed undo. It distinguishes stale versions from event-closed conflicts, reloads before continuing, serializes mutations through standings refresh, exits when the event closes, and keeps core track-side logging open when secondary results/history fail. Decimal inputs and controls reflow without horizontal overflow on narrow phones, while modal completion restores focus to the originating action or timeline heading.
- `src/features/results/EventResultsView.tsx` is shared by event detail and Live Logging. It orders competition finishers by effective time while displaying backend placings (including ties), suppresses placing for training, distinguishes DQ/DNF/DNS from an unrecorded result, groups active false-start/lane penalties, and retains archived or removed athlete identity. Event detail loads these outcomes independently with refresh/retry states and permits time corrections only for materialized results on in-progress/completed events.
- The athlete Performance view includes an on-demand Fitness & Injury Map sub-view. `src/features/fitness` keeps the progressive region/area/side/severity draft, current-page-session injury list, verified topology-bound anatomy map and accessibility-first controls separate from the R3F `BodyViewer`. The viewer loads only when Fitness opens, presents the supplied static anatomy on a dark medical stage in both console themes, automatically frames it, supports rotate/zoom/reset, and maps saved/preview injuries directly onto the cyan material surface. It has no backend persistence yet, so closing the Performance page or refreshing clears the temporary list by design.
- Manual correction keeps the timeline-derived outcome/value read-only beside the effective value. Set/update requires a positive hundredth-precision time and a non-blank reason; active audit metadata identifies the synchronized application user and timestamp. Clearing requires confirmation and sends paired nulls. Every successful set/clear re-fetches the complete result board because one override can change other placings and PB/SB flags.
- Tests: Vitest + React Testing Library cover the app shell and weather-theme state, shared Button, API response/error handling, authenticated synchronization, account API/password/deletion/sign-out/social-provider workflows, public sign-up/password help, athlete/event/participant/timeline/result/aggregate/weather wrappers, event forecast success/unavailable/retry/abort states, fixture invitation workspace recovery and guest-workspace selection, roster status filters/transitions, archived detail read-only behavior, event assignment review acknowledgment, live-logger mutation locking/lifecycle conflicts/stale recovery/entry-type payloads/secondary failures/mobile inputs/modal focus, dashboard onboarding/summary/live/error/navigation modes, signature-hero aggregate values/timer lifecycle and exact destination handoffs, stale live-event recovery, result ordering/ties, training, every incident, partial/history states, overrides, PB/SB, profile editing, set/clear/failure correction paths, and temporary Fitness injury selection/preview/resolution. Runs with `npm run test` (241 tests).

## Deployment

The production SPA is deployed to Vercel:

```text
https://athlora-deploy.vercel.app
```

Vercel runs `npm ci` and `npm run build` from `/frontend`, then publishes `dist/`. `frontend/vercel.json` rewrites direct SPA routes, including email invitation links, to `index.html`; retain this file when changing Vercel settings. Configure the same four `VITE_*` values in Vercel and register the production URL in Auth0's callback, logout, and web-origin settings.

## AI declaration

This document was created with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol], and updated with the assistance of OpenCode[gpt-5.6-terra] and opencode[gpt-5.6-sol].
