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
- `src/types` mirrors the backend DTOs (camelCase on the wire).
- `src/api/client.ts` is the shared typed fetch wrapper; thinner per-resource files are added as each feature lands.

## Current state

- The app shell renders with **Athlora** branding, an ink sidebar and placeholder pages for each feature (Dashboard, Roster, Events, Live Logging, Results).
- Auth0 Universal Login is wired through `@auth0/auth0-react` for sign-up, sign-in and sign-out. The shared API client obtains an access token silently and sends it as a bearer token. After authentication, the app calls `PUT /api/v1/auth/me` to synchronize the verified Auth0 profile with the backend user record. Auth0 must be configured through the environment variables above and the tenant must allow the application's callback, logout and web-origin URLs.
- Design tokens from the approved mockups are encoded once in `src/styles/tokens.css`; Google Fonts (Bebas Neue, Inter, Space Mono) load in `index.html`.
- Tests: Vitest + React Testing Library (App shell, shared Button). Runs with `npm run test`.

## Deployment

The frontend is deployed to **Vercel** at:

```text
https://athlora-deploy.vercel.app
```

Vercel builds the `frontend` root from the private GitHub deployment mirror with `npm ci` and `npm run build`, then publishes `dist`. Production and preview environments require the four `VITE_*` variables above; `VITE_API_BASE_URL` is `https://athlora-deploy.onrender.com`.

The production URL must be listed in the Auth0 application's allowed callback URLs, logout URLs, and web origins. Auth0 production sign-in and redirect have been verified.

## AI declaration

This document was generated with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol].
