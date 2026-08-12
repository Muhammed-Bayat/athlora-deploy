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

- The app shell renders with **Athlora** branding, an ink sidebar and placeholder pages for each feature (Dashboard, Roster, Events, Live Logging, Results, Sign in).
- Design tokens from the approved mockups are encoded once in `src/styles/tokens.css`; Google Fonts (Bebas Neue, Inter, Space Mono) load in `index.html`.
- Tests: Vitest + React Testing Library (App shell, shared Button). Runs with `npm run test`.

## Deployment

Skeleton deploys to **Vercel** (see the dev plan, Stage 1).

## AI declaration

This document was generated with the assistance of opencode[deepseek-v4-flash-free].