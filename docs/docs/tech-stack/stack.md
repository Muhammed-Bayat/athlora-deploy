---
sidebar_position: 1
---

# Tech Stack

Athlora is a non-monolithic athletics coaching application: a browser SPA, a REST API, and PostgreSQL are separate services. The current implementation is deliberately limited to 100m timing so the team can make live logging, corrections, result derivation, and coach ownership reliable before expanding to the full athletics meet: races, hurdles, relays, race walks, jumps, throws, and vertical events.

## Implemented Stack

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
| CI | Gitea Actions | Separate frontend, backend, docs, and credential-gated E2E jobs on push and pull request. | A feature is not complete if it breaks a different service in the monorepo; CI verifies each deployable before merging. |
| Hosting | Vercel, Render, Cloudflare Pages | SPA, API, and documentation deployments respectively. | Independent hosting matches the architecture and lets the public documentation remain available without exposing the API or database. |

## Implemented Supporting Libraries

- `dotenv` loads server-only local configuration; browser configuration is restricted to public `VITE_*` values.
- `tsx` provides the API's watch-mode development server without a separate build step.
- `@testing-library/user-event` exercises real keyboard and pointer interactions for controls used during event logging.
- `@axe-core/playwright` checks serious and critical accessibility violations in the browser suite.

## Planned Stack

These tools are in the development plan but are **not** current runtime dependencies. They will be introduced only with the feature they support.

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
