---
sidebar_position: 1
---

# Frontend (React + Vite + TypeScript)

The SPA lives in `/frontend`. It talks to the backend API over HTTP/JSON and is the design source of truth for the visual identity.

## Requirements

- Node.js 20+
- npm

## Install & run

```bash
cd frontend
npm install
npm run dev
```

`npm run dev` starts the Vite dev server (default `http://localhost:5173`).

## Environment

Copy `.env.example` to `.env.local` and set the values when they are available:

```
VITE_API_BASE_URL=http://localhost:4000
VITE_AUTH0_DOMAIN=
VITE_AUTH0_CLIENT_ID=
VITE_AUTH0_AUDIENCE=
```

`VITE_API_BASE_URL` points at the backend (see the backend guide).

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Type-check and production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | `tsc -b` (strict) |
| `npm run test` | Vitest + React Testing Library, single run |
| `npm run lint` | ESLint (flat config) |

## Structure conventions

- Shared UI primitives live in `src/components` (Button, Input, Select, Card, Badge, Modal, Toast, EmptyState).
- Feature code lives in `src/features/<feature>` folders, not global pages/forms dirs.
- All colours, fonts, radii and shadows come from `src/styles/tokens.css` — never hard-code hex values.
- `src/types` mirrors the backend DTOs (camelCase on the wire). The MVP 100m contract is encoded there: `DISCIPLINE_100M`/`Discipline`, `RESULT_UNIT_SECONDS`/`ResultUnit`, `ResultOutcome`, and the aligned `Athlete`, `TimelineEntry`, `Result`, `EventParticipant`, `AthleteStatistics` and `DashboardSummary` types.
- `src/api/client.ts` is the shared typed fetch wrapper with per-resource files (`athletes`, `events`, `participants`, `timeline`, `results`, `statistics`, `dashboard`), and `src/components/AsyncBoundary.tsx` renders shared loading/error/empty states for them.

## Current state

- The app shell renders with **Athlora** branding and an ink sidebar. The roster, event-management and dashboard views are live against the typed API.
- Weather presets use paired semantic surface, text, control, status and focus colors across the authenticated console. `night` and `night-rain` keep dashboards, forms, dialogs, badges, result boards, empty states and live-logging controls consistently dark and readable without changing the approved Athlora palette; disabling Weather FX removes the weather theme.
- Auth0 Universal Login is wired through `@auth0/auth0-react` for sign-up, sign-in, password help and sign-out. Every public “Get started” control opens Auth0 sign-up. The reachable Account console view shows profile/security details, creates short-lived Auth0 password links for Auth0 database identities, directs social users to their identity provider, signs out through Auth0, and requires typed `DELETE` confirmation before permanent identity/workspace removal. Destructive persistence locks dismissal and announces in-dialog failures. The shared API client obtains an access token silently and sends it as a bearer token. After authentication, the app calls `PUT /api/v1/auth/me` to synchronize the verified Auth0 profile with the backend user record and withholds authenticated content until that call succeeds; a failed synchronization displays a retry state. Auth0 must be configured through the environment variables above and the tenant must allow the application's callback, logout and web-origin URLs.
- API failures use a typed `ApiError` that preserves the backend HTTP status, error code, message and details, including `AUTH_USER_NOT_SYNCHRONIZED` recovery information. Single-resource response envelopes are unwrapped by the shared client and empty successful responses are handled without JSON parse failures.
- `src/api/statistics.ts` and `src/api/dashboard.ts` expose the combined athlete statistics/history and dashboard summary resources through DTOs mirrored from the backend. Athlete performance detail consumes the statistics resource directly. The dashboard consumes the stable summary/live aggregate with loading and retry states, active-event progress and latest entries, onboarding, factual roster/event/result/PB panels, and targeted navigation to athlete details, event details and the selected live logger. Summary mode uses the approved signature hero with a live greeting/clock and reduced-motion-aware orbit animation, while every displayed count comes from the aggregate.
- Design tokens from the approved mockups are encoded once in `src/styles/tokens.css`; Google Fonts (Bebas Neue, Inter, Space Mono) load in `index.html`.
- `src/features/athletes/AthletesPage.tsx` consumes the coach-owned UUID athlete DTO through `src/api/athletes.ts`. It loads active and archived athletes, provides immediate name/squad/archive filters, renders distinct loading/error-retry/empty/filter-empty states, and persists create, full-replacement edit, archive and restore operations. `AthleteForm` is shared by roster and detail editing; it sends only `name`, `dob`, `gender`, `squad` and `notes`, maps backend validation issues inline, and never invents fixture-only fields.
- `AthleteDetailPage` combines the editable API profile with owner-scoped 100m statistics in a performance-first layout: a featured athlete identity panel, PB/calendar-year SB/count KPI strip, compact profile details and keyboard-accessible competition/training history tabs. Full-width result rows keep effective times, overrides, incidents, PB/SB and cancelled/non-scoring states explicit in text. Profile and statistics requests load and retry independently, while opening and returning move focus between the detail heading and the exact originating roster action without adding a routing dependency.
- Archive confirmation explains that event assignments, timeline entries and results are preserved. Shared modal focus management supports Escape, Tab containment, focus restoration and blocked dismissal during submission; success/error feedback is announced and the responsive card grid collapses for mobile use.
- `src/features/events/EventsPage.tsx` loads coach-owned 100m events through `src/api/events.ts`, supports list and calendar views with date/type/status filters, and provides distinct loading, retry, empty and filter-empty states. Its reusable create/edit form sends strict full-replacement payloads, displays inline validation, and supports confirmed start, completion and history-preserving cancellation transitions.
- Event detail uses the participant and active-roster APIs to list current assignments, retain archived historical participants, assign active athletes with pending RSVP status, replace RSVP status, and confirm assignment removal. Participant and roster failures retry independently, persistence blocks modal-changing actions, and removal messaging explains that timeline entries and results remain intact.
- Event detail independently loads its Open-Meteo event-day forecast when both coordinates are present. It shows WMO conditions, Celsius range, rain probability, maximum wind and venue timezone; missing coordinates and unsupported dates are quiet guidance states, while service failures are announced with an isolated retry that does not block results, assignments or event actions. In-flight requests abort when detail closes.
- `src/api/timeline.ts` exposes typed active-list/create/version-aware PATCH/DELETE requests. Correction payloads require `expectedVersion`, limit edits to observation content, and send the DELETE precondition in its JSON body. `LiveLoggingPage` consumes events, assignments, timeline entries and results for finish/incident logging, correction, undo and live standings.
- `src/features/results/EventResultsView.tsx` is shared by event detail and Live Logging. It orders competition finishers by effective time while displaying backend placings (including ties), suppresses placing for training, distinguishes DQ/DNF/DNS from an unrecorded result, groups active false-start/lane penalties, and retains archived or removed athlete identity. Event detail loads these outcomes independently with refresh/retry states and permits time corrections only for materialized results on in-progress/completed events.
- Manual correction keeps the timeline-derived outcome/value read-only beside the effective value. Set/update requires a positive hundredth-precision time and a non-blank reason; active audit metadata identifies the synchronized application user and timestamp. Clearing requires confirmation and sends paired nulls. Every successful set/clear re-fetches the complete result board because one override can change other placings and PB/SB flags.
<<<<<<< HEAD
- Tests: Vitest + React Testing Library cover the app shell and weather-theme state, shared Button, API response/error handling, authenticated synchronization, account API/password/deletion/sign-out/social-provider workflows, public sign-up/password help, athlete/event/participant/timeline/result/aggregate wrappers, roster and athlete-detail workflows, accessible history tabs and focus restoration, event management, live logging, dashboard onboarding/summary/live/error/navigation modes, signature-hero aggregate values/timer lifecycle and exact destination handoffs, stale live-event recovery, result ordering/ties, training, every incident, partial/history states, overrides, PB/SB, profile editing, and set/clear/failure correction paths. Runs with `npm run test` (175 tests).
=======
- Tests: Vitest + React Testing Library cover the app shell and weather-theme state, shared Button, API response/error handling, authenticated synchronization, account API/password/deletion/sign-out/social-provider workflows, public sign-up/password help, athlete/event/participant/timeline/result/aggregate/weather wrappers, event forecast success/unavailable/retry/abort states, roster and athlete-detail workflows, accessible history tabs and focus restoration, event management, live logging, result ordering/ties, training, every incident, partial/history states, overrides, PB/SB, profile editing, and set/clear/failure correction paths. Runs with `npm run test` (165 tests).
>>>>>>> b2f0e66b54855a75b8c9010e0c3691f8f0638ea9

## Deployment

The frontend is deployed to **Vercel** at:

```text
https://athlora-deploy.vercel.app
```

Vercel builds the `frontend` root from the private GitHub deployment mirror with `npm ci` and `npm run build`, then publishes `dist`. Production and preview environments require the four `VITE_*` variables above; `VITE_API_BASE_URL` is `https://athlora-deploy.onrender.com`.

The production URL must be listed in the Auth0 application's allowed callback URLs, logout URLs, and web origins. Auth0 production sign-in and redirect have been verified.

## AI declaration

This document was generated with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol].
