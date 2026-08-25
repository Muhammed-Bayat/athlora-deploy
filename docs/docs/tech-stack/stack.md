---
sidebar_position: 1
---

# Tech Stack

Athlora is a non-monolithic athletics coaching application: a browser SPA, a REST API, and PostgreSQL are separate services. The current implementation is deliberately limited to 100m timing so the team can make live logging, corrections, result derivation, and coach ownership reliable before expanding to the full athletics meet: races, hurdles, relays, race walks, jumps, throws, and vertical events.

## Implemented Stack
| Layer | Tool | Why |
|-------|------|-----|
| Frontend framework | React + Vite (TypeScript, strict) | Fast dev/build, strict typing, standard React data flow |
| Styling | Plain CSS (variables + modules) | Design tokens from approved mockups, no runtime dependency |
| Landing visuals | SVG + CSS (shared `TrackArtwork`) + DOM chase-camera | Mockup-exact oval art for the hero reveal and cinematic lap; no WebGL dependency |
| Fitness body viewer | Three.js + React Three Fiber + Drei | On-demand static anatomical viewer for temporary injury mapping with topology-bound surface heat maps |
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
| Coverage reports | Vitest V8 coverage | JSON summaries rendered as a short Gitea Actions Markdown table |
| CI/CD | Gitea Actions | Lint, typecheck, test, build, coverage, and credential-gated E2E jobs on every push/PR |
| Hosting | Vercel (frontend), Render (backend) | Static SPA hosting + API hosting |
| Docs site | Docusaurus on Cloudflare Pages | Versioned docs: setup, API, schema |

| Area | Technology | How Athlora uses it | Why it fits Athlora |
|---|---|---|---|
| Frontend | React 18, Vite 6, strict TypeScript | The coach console, roster, events, dashboard, live logger, results, and account screens. | A fast SPA keeps the track-side logger responsive, while strict types keep the 100m DTOs aligned with the API. |
| Styling | CSS variables and CSS modules | Shared tokens, component styles, responsive layouts, console themes, and weather effects. | The approved Athlora visual language is encoded once without adding a runtime styling dependency to a mobile-focused application. |
| API | Node.js, Express 5, strict TypeScript | JSON API under `/api/v1`, resource routes, validation, and error responses. | The API stays independently deployable while remaining small enough for explicit coach-ownership and event-lifecycle rules. |
| Database | PostgreSQL on Neon, `pg` | Coach-owned athletes, events, participants, timeline entries, results, and deletion tombstones. | Relational constraints and transactions protect the link between a live entry, derived result, placing, PB, and SB. UUIDs also prepare the model for future offline writes. |
| Migrations | Checksum-tracked SQL migrations | Creates and evolves the production schema before API startup. | Results history must not depend on manual schema changes; checksum verification detects a changed migration before it damages a season's data. |
| Authentication | Auth0, `@auth0/auth0-react`, `jose` | Universal Login in the SPA and JWT verification in the API. | Coaches do not need Athlora-managed passwords. Auth0 handles identity flows while the API maps a verified subject to one local coach workspace. |
| API protection | Helmet, CORS, ownership middleware | Security headers, origin allow-listing, authenticated user resolution, and non-enumerating resource checks. | A coach must never be able to discover or modify another coach's athletes, entries, or results. |
| Weather | Open-Meteo | Event-day venue forecasts and the coach console's current-weather readout, both proxied by the API. | Wind, rain, and conditions matter when planning or logging athletics events; Open-Meteo provides these without storing a paid-provider API key in the project. |
| Unit and component tests | Vitest, React Testing Library, jsdom | Result rules, API wrappers, components, forms, mutations, and accessibility interactions. | Most correctness risks are in calculations and state transitions, so fast focused tests provide feedback before a coach uses the logger. |
| API tests | Supertest | HTTP contracts, validation, ownership, lifecycle guards, and error behavior. | The frontend relies on predictable status codes and error envelopes when handling stale corrections and closed events. |
| End-to-end tests | Playwright, axe-core/playwright | Anonymous checks plus authenticated desktop/mobile 100m vertical-slice and accessibility tests. | The real workflow crosses Auth0, the SPA, the API, and PostgreSQL; browser tests verify that a coach can complete it at a desk or track-side. |
| Documentation | Docusaurus | Versioned setup, architecture, API, schema, and process documentation. | The stack has several services and environment boundaries, so executable team documentation prevents setup knowledge staying with one contributor. |
| CI | Gitea Actions | Separate frontend, backend, docs, coverage, and credential-gated E2E jobs on push and pull request. The coverage job prints a short Markdown summary. | A feature is not complete if it breaks a different service in the monorepo; CI verifies each deployable before merging and makes source-coverage gaps visible without an initial threshold. |
| Hosting | Vercel, Render, Cloudflare Pages | SPA, API, and documentation deployments respectively. | Independent hosting matches the architecture and lets the public documentation remain available without exposing the API or database. |

## Implemented Supporting Libraries
- **Dexie**: wraps IndexedDB with a typed, promise API and explicit transactions — the cleanest fit for an offline-first write queue.
- **Socket.IO**: reliable fallbacks (polling) and rooms make per-event broadcast trivial and resilient.
- **Chart.js**: batteries-included for line/bar charts without a heavier data-viz framework.
- **Open-Meteo**: no API key, free rate limits — ideal for a university project with no billing.
- **Auth0**: hosted login (sign up, social, password reset) plus JWT verification middleware; keeps credentials and user data out of our code.
- **Lazy-loaded SVG/CSS landing track**: the mockup-exact oval is drawn once as a shared SVG component and painted differently per context; the cinematic lap is pure DOM transforms, so the landing page needs no WebGL.
- **pdf-lib**: pure-JS PDF generation — works in Node and the browser without native deps.

- `dotenv` loads server-only local configuration; browser configuration is restricted to public `VITE_*` values.
- `tsx` provides the API's watch-mode development server without a separate build step.
- `@testing-library/user-event` exercises real keyboard and pointer interactions for controls used during event logging.
- `@axe-core/playwright` checks serious and critical accessibility violations in the browser suite.

## Responsive Overlay Convention

All authenticated dialogs (add, edit, correction, confirmation) use the shared `<Modal>` component. Layout rules:

- **Desktop (≥768px):** Centered card with `max-width: 560px`, `max-height: 90vh`, and vertical scroll only when content exceeds the viewport.
- **Mobile (<768px):** Full-screen sheet with safe-area insets. No border radius, no shadow, no backdrop padding.
- **Body scroll lock:** `document.body.style.overflow` is set to `'hidden'` while any modal is open and restored on close.
- **Forms inside Modal:** Always `width: 100%`. Never use hardcoded widths that exceed ~512px (560px minus 24px padding each side).
- **Action buttons:** Stack vertically (`flex-direction: column`) below 620px with `width: 100%; min-height: 44px` for touch targets.
- **Focus management:** Auto-focuses first input on open, restores focus to trigger on close, traps Tab within the dialog, Escape dismisses unless `closeDisabled`.
- **Accessibility:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-busy` during saves.

## Planned Stack

These tools are in the development plan but are **not** current runtime dependencies. They will be introduced only with the feature they support.
- **In the code and verified by tests/builds**: React + Vite + TypeScript, plain CSS (tokens + modules), lazy-loaded SVG/CSS landing visuals, the API-backed roster/dashboard and shared accessible UI primitives, Express, `pg`, `jose` (Auth0 JWT verification), Open-Meteo event forecasts, Vitest, React Testing Library, Supertest, Playwright, Docusaurus, and the Gitea Actions workflow file.
- **Fitness viewer**: Three.js, React Three Fiber and Drei are current frontend dependencies. They are lazy-loaded with the Fitness sub-view so regular roster/performance navigation does not download the static anatomical viewer. Its current injury state is intentionally temporary until a dedicated backend contract is introduced.
- **Configured and exercised**: Auth0 Universal Login/JWT verification, application-user synchronization and owner-scoped resource authorization, plus PostgreSQL on Neon with checksum-tracked migrations.
- **Reserved for later stages**: Dexie/PWA/Socket.IO (Stage 2), Chart.js (Stage 2), pdf-lib (Stage 3).

| Stage | Technology | Intended Athlora use | Why it is deferred |
|---|---|---|---|
| Stage 2 | Dexie over IndexedDB | Queue live timeline writes locally when a track has poor or no signal. | The online, versioned logging path must be stable before adding offline conflict states. |
| Stage 2 | `vite-plugin-pwa` | Installable shell and service-worker caching for the coach console. | A PWA is useful only once the logger has defined offline behavior and recovery rules. |
| Stage 2 | Socket.IO | Broadcast new or corrected event entries to other coaches viewing the same event. | The current API provides an authoritative source of truth first; realtime transport comes after the mutation contract is settled. |
| Stage 2 | Chart.js | PB/SB progression and athlete or squad comparisons. | Existing dashboard counts and athlete statistics establish the correct data before visualising trends. |
| Stage 3 | `pdf-lib` | Downloadable athlete or event reports. | Exports depend on stable results, public/reporting requirements, and agreed layout. |

Planned work also includes role-based authorization, shared fixtures, offline merge rules, public result pages, scheduling, and rule-based coaching summaries. These are product capabilities rather than currently selected packages; their implementation will be documented when their contracts are agreed.

## Deliberate Constraints

- The currently shipped live contract supports 100m results in seconds only. The product scope is the full athletics meet; each added discipline requires coordinated validation, UI, schema, derivation, placing, PB/SB, and test changes.
- The frontend and backend remain separate services. A fused framework is intentionally not used.
- Derived results remain server-authoritative. A manual override is audited rather than replacing the original timeline record.
- No third-party service receives the Auth0 Management API secret except the backend; it is never exposed through the frontend build.

## AI Declaration

This document was created with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol], and updated with the assistance of OpenCode[gpt-5.6-terra].
