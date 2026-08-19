---
sidebar_position: 1
---

# Tech stack

Chosen in the dev plan and fixed by the build spec. Do not substitute a tool listed here without whole-team agreement and a spec update.

| Layer | Tool | Why |
|-------|------|-----|
| Frontend framework | React + Vite (TypeScript, strict) | Fast dev/build, strict typing, standard React data flow |
| Styling | Plain CSS (variables + modules) | Design tokens from approved mockups, no runtime dependency |
| Landing 3D | Three.js + React Three Fiber | Lazy-loaded procedural track model for the public hero reveal and cinematic lap |
| Backend | Node.js + Express (TypeScript) | Small hand-written REST API, shares TS types with the frontend |
| Database | PostgreSQL | Relational results/log data; UUID PKs enable offline-safe inserts |
| Auth | Auth0 | Never hand-roll auth; hosted identity + verified JWTs |
| Weather | Open-Meteo | Keyless REST forecast for event venues |
| Offline storage (Stage 2+) | IndexedDB via Dexie | Promise-friendly store mirroring `timeline_entries` |
| PWA (Stage 2+) | vite-plugin-pwa | Service worker + manifest for offline shell |
| Realtime (Stage 2+) | Socket.IO | Live broadcast of new/edited entries to event viewers |
| Charts (Stage 2+) | Chart.js | PB/SB progression and comparison charts |
| PDF export (Stage 3) | pdf-lib | Athlete/event results reports |
| Unit/component tests | Vitest, React Testing Library | Fast component + pure-logic tests |
| API tests | Supertest | Endpoint happy paths + validation/error paths |
| E2E tests | Playwright | Cross-cutting flows, offline sync, multi-device merge |
| CI/CD | Gitea Actions | Lint + typecheck + test on every push/PR |
| Hosting | Vercel (frontend), Render (backend) | Static SPA hosting + API hosting |
| Docs site | Docusaurus on Cloudflare Pages | Versioned docs: setup, API, schema |

## Third-party rationale

- **Dexie**: wraps IndexedDB with a typed, promise API and explicit transactions — the cleanest fit for an offline-first write queue.
- **Socket.IO**: reliable fallbacks (polling) and rooms make per-event broadcast trivial and resilient.
- **Chart.js**: batteries-included for line/bar charts without a heavier data-viz framework.
- **Open-Meteo**: no API key, free rate limits — ideal for a university project with no billing.
- **Auth0**: hosted login (sign up, social, password reset) plus JWT verification middleware; keeps credentials and user data out of our code.
- **React Three Fiber**: keeps the landing page's isolated Three.js scene declarative and aligned with React while all content and controls remain semantic HTML/CSS.
- **pdf-lib**: pure-JS PDF generation — works in Node and the browser without native deps.

Anything currently listed but unused in the codebase is there deliberately for a named stage — see the dev plan.

## Currently in use

- **In the code and verified by tests/builds**: React + Vite + TypeScript, plain CSS (tokens + modules), lazy-loaded Three.js/React Three Fiber landing visuals, the API-backed roster/dashboard and shared accessible UI primitives, Express, `pg`, `jose` (Auth0 JWT verification), Open-Meteo event forecasts, Vitest, React Testing Library, Supertest, Playwright, Docusaurus, and the Gitea Actions workflow file.
- **Configured and exercised**: Auth0 Universal Login/JWT verification, application-user synchronization and owner-scoped resource authorization, plus PostgreSQL on Neon with checksum-tracked migrations.
- **Reserved for later stages**: Dexie/PWA/Socket.IO (Stage 2), Chart.js (Stage 2), pdf-lib (Stage 3).

## AI declaration

This document was generated with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol].
