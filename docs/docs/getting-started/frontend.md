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

- The app shell renders with **Athlora** branding and an ink sidebar. The roster and event-management views are live against the typed API; dashboard content remains staged preview data until its integration issue lands.
- Auth0 Universal Login is wired through `@auth0/auth0-react` for sign-up, sign-in and sign-out. The shared API client obtains an access token silently and sends it as a bearer token. After authentication, the app calls `PUT /api/v1/auth/me` to synchronize the verified Auth0 profile with the backend user record and withholds authenticated content until that call succeeds; a failed synchronization displays a retry state. Auth0 must be configured through the environment variables above and the tenant must allow the application's callback, logout and web-origin URLs.
- API failures use a typed `ApiError` that preserves the backend HTTP status, error code, message and details, including `AUTH_USER_NOT_SYNCHRONIZED` recovery information. Single-resource response envelopes are unwrapped by the shared client and empty successful responses are handled without JSON parse failures.
- `src/api/statistics.ts` and `src/api/dashboard.ts` expose the combined athlete statistics/history and dashboard summary resources through DTOs mirrored from the backend. The visible dashboard remains preview-backed and athlete performance detail is not yet rendered; these wrappers are the stable integration boundary for those frontend issues.
- Design tokens from the approved mockups are encoded once in `src/styles/tokens.css`; Google Fonts (Bebas Neue, Inter, Space Mono) load in `index.html`.
- `src/features/athletes/AthletesPage.tsx` consumes the coach-owned UUID athlete DTO through `src/api/athletes.ts`. It loads active and archived athletes, provides immediate name/squad/archive filters, renders distinct loading/error-retry/empty/filter-empty states, and persists create, full-replacement edit, archive and restore operations. Its reusable form sends only `name`, `dob`, `gender`, `squad` and `notes`, maps backend validation issues inline, and never invents fixture-only bib, status, PB, discipline or history fields.
- Archive confirmation explains that event assignments, timeline entries and results are preserved. Shared modal focus management supports Escape, Tab containment, focus restoration and blocked dismissal during submission; success/error feedback is announced and the responsive card grid collapses for mobile use.
- `src/features/events/EventsPage.tsx` loads coach-owned 100m events through `src/api/events.ts`, supports list and calendar views with date/type/status filters, and provides distinct loading, retry, empty and filter-empty states. Its reusable create/edit form sends strict full-replacement payloads, displays inline validation, and supports confirmed start, completion and history-preserving cancellation transitions.
- Event detail uses the participant and active-roster APIs to list current assignments, retain archived historical participants, assign active athletes with pending RSVP status, replace RSVP status, and confirm assignment removal. Participant and roster failures retry independently, persistence blocks modal-changing actions, and removal messaging explains that timeline entries and results remain intact.
- `src/api/timeline.ts` exposes typed active-list/create/version-aware PATCH/DELETE requests. Correction payloads require `expectedVersion`, limit edits to observation content, and send the DELETE precondition in its JSON body. `LiveLoggingPage` consumes events, assignments, timeline entries and results for finish/incident logging, correction, undo and live standings.
- Tests: Vitest + React Testing Library cover the app shell, shared Button, API response/error handling, authenticated synchronization, athlete/event/participant/timeline/aggregate wrappers, roster workflows, event management and live logging. Runs with `npm run test` (72 tests).

## Deployment

The frontend is deployed to **Vercel** at:

```text
https://athlora-deploy.vercel.app
```

Vercel builds the `frontend` root from the private GitHub deployment mirror with `npm ci` and `npm run build`, then publishes `dist`. Production and preview environments require the four `VITE_*` variables above; `VITE_API_BASE_URL` is `https://athlora-deploy.onrender.com`.

The production URL must be listed in the Auth0 application's allowed callback URLs, logout URLs, and web origins. Auth0 production sign-in and redirect have been verified.

## AI declaration

This document was generated with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol].
