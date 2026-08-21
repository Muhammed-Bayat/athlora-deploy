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

The dashboard and other authenticated views wait for `PUT /api/v1/auth/me` to finish successfully. If synchronization fails, the UI provides a retry state instead of showing protected data.

## Testing

Frontend tests cover UI behavior, accessibility interactions, API wrappers, authenticated state, dashboard states, athlete and event workflows, live logging, result corrections, and weather handling. Run them with:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

For browser-level coverage of the full stack, use the [E2E guide](./e2e).

## Deployment

The production SPA is deployed to Vercel:

```text
https://athlora-deploy.vercel.app
```

Vercel runs `npm ci` and `npm run build` from `/frontend`, then publishes `dist/`. Configure the same four `VITE_*` values in Vercel and register the production URL in Auth0's callback, logout, and web-origin settings.

## AI declaration

This document was created with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol], and updated with the assistance of OpenCode[gpt-5.6-terra].
