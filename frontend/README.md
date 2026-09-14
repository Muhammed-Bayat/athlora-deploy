# Athlora Frontend

## Core Requirements

### Project Title

**Athlora Frontend**

### Short Description

The frontend is the React single-page application used by coaches to manage athletes and events, log the current 100m workflow, review results, and view coaching insight. It consumes the separate Athlora Express API through authenticated HTTP requests.

### System Requirements

- Node.js 22 LTS recommended; Node.js 20 or later supported.
- npm.
- A running Athlora backend.
- Auth0 SPA credentials for authenticated features.

## Installation Guide

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

For local API development, set the following in `.env.local`:

```dotenv
VITE_API_BASE_URL=http://localhost:4000
VITE_AUTH0_DOMAIN=your-tenant.eu.auth0.com
VITE_AUTH0_CLIENT_ID=your-spa-client-id
VITE_AUTH0_AUDIENCE=https://api.example.com
```

Vite runs at `http://localhost:5173`. Add that address to the Auth0 application's callback URLs, logout URLs, and web origins.

## Usage Examples

Start the development server:

```bash
npm run dev
```

Build and preview the production bundle:

```bash
npm run build
npm run preview
```

Run the frontend quality checks:

```bash
npm run lint
npm run typecheck
npm run test
```

In the application, sign in, create athletes and a 100m event, assign participants, start the event, then record finishes from **Live Logger**. The dashboard and athlete profile views update from API-derived result data.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start Vite with HMR. |
| `npm run build` | Type-check and build `dist/`. |
| `npm run preview` | Serve `dist/` locally. |
| `npm run typecheck` | Run strict TypeScript checks. |
| `npm run test` | Run Vitest and React Testing Library. |
| `npm run lint` | Run ESLint. |

## AI Declaration

This document was created and updated with the assistance of OpenCode[gpt-5.6-terra].
