---
sidebar_position: 1
slug: /
---

# Athlora

Run the whole season from one place.

Athlora is a web app for athletics (track & field) coaches to manage a roster, plan competitions and training, log results live, derive statistics and PBs/SBs, and collaborate around a whole meet season.

## Product scope

Athlora is intended to support a complete athletics meet: timed track races, hurdles, relays and race walks; measured jumps and throws; vertical events; and, later, multi-events, shared fixtures, public results, reporting, and scheduling. The current shipped vertical slice is **100m timing in seconds**. This deliberately narrow first discipline proves the live-log, correction, result, and statistics foundations before each additional discipline receives its own rules and interface.

## Monorepo layout

```
/frontend   React + Vite + TypeScript SPA (design tokens in src/styles/tokens.css)
/backend    Express + TypeScript REST API (PostgreSQL, Auth0)
/docs       This Docusaurus site
/e2e        Playwright end-to-end tests
```

Design mockups live at the repo root: `SDP-Landing.html` (marketing page), `SDP-Coach-Console.html` (in-app console) and `Athlora_Premium_Dashboard.html` (the approved premium coach-console redesign — dark aurora default with a light "Aurora Mist/Ice" variant). All carry the placeholder brand "SDP" — the real brand everywhere is **Athlora**.

## Key decisions

- **Non-monolithic architecture**: React frontend and Express API are separate services talking over HTTP/JSON. No fused framework (Next.js/SvelteKit) — this is a hard project requirement.
- **Timeline-first data model**: everything an athlete does during an event is captured as an append-only `timeline_entries` log; `results` are derived from it, with a manual override for corrections.
- **Safe distributed writes**: UUID primary keys and soft deletes everywhere, so offline logging (Stage 2+) and multi-device merge (Stage 3+) stay consistent.
- **Design tokens**: the approved mockups are encoded once in `frontend/src/styles/tokens.css`; no hard-coded colours in components.

## Current implementation (100m vertical slice)

The monorepo is scaffolded, committed, and all automated checks pass locally. What is done today:

- **Frontend shell and roster** — Vite + React + TypeScript (strict), design tokens from the mockups, shared components (`Button`, `Input`, `Select`, `Card`, `Badge`, `Modal`, `Toast`, `EmptyState`), feature folders, a typed API client with structured errors, and Auth0 Universal Login integration that synchronizes the application user before authenticated content renders. The roster is API-backed with active/archived views, name/squad filters, reusable add/edit forms, archive/restore confirmation, and complete loading/error/empty feedback.
- **Landing page** — the hero reveals the approved SDP-Landing track exactly (a pointer-following 2D SVG oval with 8 gradient lanes, start line, distance marks, lane numbers and a javelin throw sector) in a soft-feather circular window that uses the mockup's static alpha mask (no lens ring), with a cursor glow; the track is drawn with a stronger perspective tilt for extra depth. The scroll-driven lap is a direct DOM/CSS port of the mockup's cinematic chase-camera rig: the same shared SVG oval is translated by the negative runner position while an oblique drone camera (60° pitch, bend-dependent bank, fit-scaled zoom, yaw steered along the lane) flies a full lap that completes exactly when the page is scrolled to the bottom. Both the shared `TrackArtwork` SVG and the per-frame camera/object transforms match the mockup byte-for-byte, the whole scene fades per section exactly like the mockup (features `.23` → preview `.20` → how `.15` → faq `.075`), and it is hidden entirely on small screens and for reduced-motion users. Scroll easing is frame-rate independent (an 82ms exponential damping constant) so fast scrolling stays smooth and crisp instead of snapping, while the dark aurora background gradient is preserved.
- **Backend shell** — Express + TypeScript, `/api/v1` resource routers, standard error shape, Auth0 JWT protection that resolves every resource request to a typed application-user context, Neon PostgreSQL with checksum-tracked migrations, and pure result-derivation services.
- **100m data/API contract** — the first implemented discipline is defined in `docs/api-reference/contract`, encoded in the aligned backend/frontend TypeScript domain types, and backed by the forward-only migration `0002_contract_100m.sql`. It is a current contract, not the product limit: the database keeps a discipline/unit foundation for the later track and field rollout. The current result model distinguishes no result, a valid finish, DQ, DNF and DNS.
- **Ownership foundation** — verified Auth0 subjects resolve to `users.id` and role before protected resource handlers run. Unsynchronized identities receive a structured recovery error, while reusable athlete/event/timeline/participant/result checks scope access to the current user and return the same generic not-found response for missing and cross-coach resources.
- **Account lifecycle** — public sign-up/password-help controls use Auth0 Universal Login and the reachable Account console supports provider-aware password management, sign-out and typed-confirmation permanent deletion. The backend uses a least-privilege Auth0 Management API client, durable deletion tombstones, transactional workspace purge and scheduled idempotent reconciliation so stale tokens and partial failures cannot restore access.
- **Athlete roster CRUD** — the `/api/v1/athletes` routes are live against PostgreSQL: coach-scoped list with name/squad filtering and stable ordering, create (server-derived owner), detail, full replacement, plus reversible archival (`DELETE` = archive, `POST /:id/unarchive`) that preserves timeline entries and results. Covered by API, service, and a `TEST_DATABASE_URL`-gated integration suite.
- **Event CRUD & lifecycle** — the `/api/v1/events` routes are live against PostgreSQL for the current 100m vertical slice: coach-scoped list with `type`/`status`/date-range filters and stable ordering, create, detail, full replacement with forward-only status transitions (`cancelled` is terminal), and cancellation-as-delete (`DELETE` sets `status = 'cancelled'`, preserving timeline entries and results). The same event lifecycle will be reused as additional meet disciplines are introduced. Timeline routes reject logging against any event that is not `in_progress` (`409 EVENT_NOT_IN_PROGRESS`).
- **Event management UI** — the coach console event view now consumes the typed event API with responsive list/calendar views, date/type/status filters, async and empty states, strict create/edit forms, detail participant counts, and confirmed start/complete/history-preserving cancel actions. API-wrapper and RTL tests cover filters, payloads, validation, details and lifecycle failures.
- **Event weather** — owned event detail proxies the stored coordinates through keyless Open-Meteo and independently displays the venue-local event-day conditions, Celsius range, rain chance and wind. The boundary validates dates, units and provider data, maps outage/no-data cases safely, aborts stale UI requests and never blocks the rest of event detail.
- **Event athlete assignments** — authenticated event routes can list assigned athletes with logger-ready summaries, assign active owned athletes, idempotently update RSVP status, and remove assignments without deleting timeline/results history. Duplicate assignments and archived new assignments return explicit conflicts; all ownership failures remain non-enumerating. Covered by API, service, row-mapper, validation and gated PostgreSQL integration tests.
- **Event assignment UI** — event detail lists assigned athletes and RSVP state, keeps archived historical participants visible, loads active roster candidates, assigns athletes, replaces RSVP status, and confirms relationship removal with preserved-history messaging. Independent loading/retry states and mutation focus/locking behavior are covered by API-wrapper and RTL tests.
- **Event results and corrections UI** — event detail and the live logger share an authoritative outcome board for the current 100m contract. Competition finishers are ordered by effective time while preserving backend tied placings, training omits misleading places, penalties/incidents and partial results remain distinct, and PB/SB plus archived history stay visible. The same presentation model will expand with discipline-specific ranking and measurement rules.
- **Live timeline API** — authenticated coaches can read the active log, create normalized 100m entries, correct finish/incident/note content with optimistic `expectedVersion` checks, and undo through versioned tombstones. Stale requests conflict instead of overwriting newer state, exact repeated undo is a no-op, and tombstones are hidden from normal timeline/results views. Mutations enforce ownership, parent IDs and lifecycle under transaction locks while atomically refreshing outcomes, placings and PB/SB flags.
- **Track-side live logger** — the mobile-first logger currently records 100m decimal finishes and incidents through serialized controls. Its versioned entries, corrections, undo, lifecycle guards, and responsive controls are the shared foundation for later time, distance, height, foul, and relay-entry interfaces.
- **Statistics and dashboard aggregates** — `GET /api/v1/athletes/:id/statistics` returns owner-scoped PB, calendar-year SB, effective-result counts, latest result and separate recent competition/training history. `GET /api/v1/dashboard/summary` returns one stable summary/live shape with deterministic active-event selection, progress and latest entries, roster counts/snapshot, scheduled upcoming events, recent results and PBs. Cancelled events do not score, archived athletes remain named in history but not in the active roster, and empty accounts receive zero counts and empty arrays.
- **Athlete performance detail UI** — every real roster athlete opens a responsive profile and current 100m history view with editable shared profile fields, DOB/current age, PB, calendar-year SB/counts, and recent competition/training outcomes. The view is designed to become a multi-discipline performance record as event support grows.
- **API-backed coach dashboard** — the authenticated entry point now consumes the dashboard aggregate directly. Active events receive a dominant progress/latest-entry panel and an exact resume-logging action; otherwise coaches see factual roster, upcoming event, result and PB summaries with onboarding states and direct athlete/event navigation. Returning after event lifecycle changes refetches the aggregate so live and summary modes stay current.
- **Premium console redesign** — the coach console shell and every authenticated view now mirror `Athlora_Premium_Dashboard.html`: a dark aurora shell (light "Aurora Mist/Ice" toggle) with sidebar brand/nav/readiness, topbar clock, a live weather readout (device geolocation with timezone-city fallback, proxied through `GET /api/v1/weather/current`), weather effects toggle and animated scene, plus mockup-matched Dashboard, Athletes, Events, Live Logger and Account views. All console colors live in one `--console-*` token namespace in the shell (theme-aware light overrides included); the Dashboard hero, metric row, roster/upcoming panels and PB trend render real aggregate data — no fabricated figures. Weather endpoint contract is §4.4 in `docs/api-reference/contract`.
- **Fitness and injury mapping UI** — Athlete Performance now opens a shell-contained Fitness & Injury Map sub-view with progressive anatomical selections, immediate temporary previews, active-injury resolution, and a responsive editor/viewer/history layout. The on-demand viewer uses the supplied static anatomical mesh on a dark medical stage in both themes, automatic framing, rotate/zoom/reset controls, and topology-bound surface heat maps rather than floating markers. Injury records intentionally remain in the current performance-page session; persistence awaits a dedicated backend schema and API.
- **Athlete performance detail UI** — every real roster athlete opens a responsive profile and 100m history view with editable shared profile fields, DOB/current age, PB, calendar-year SB/counts, and recent competition/training outcomes. Effective times, manual overrides, incidents, PB/SB and cancelled/non-scoring states remain explicit in text, while profile and statistics failures retry independently.
- **Backend deployment** — the Render service is live at `https://athlora-deploy.onrender.com` and its `/health` check is verified.
- **Frontend deployment** — the Vercel SPA is live at `https://athlora-deploy.vercel.app` with production Auth0 sign-in verified.
- **100m vertical-slice E2E suite** — a deterministic Playwright run (desktop and mobile Chromium) proves the whole slice end to end against a dedicated local PostgreSQL: authenticated roster → event creation → athlete assignment → track-side live logging of finishes and incidents → timeline correction and undo → result overrides and clearing → event completion → statistics, PBs/SBs and the returning dashboard summary. The suite signs in through real Auth0 Universal Login once (`auth-setup` project), keeps an unauthenticated smoke project, seeds unique per-project data so desktop and mobile runs never collide, and runs an axe accessibility audit across key coach views.
- **Cross-coach authorization integration test** — a `TEST_DATABASE_URL`-gated backend suite proves every owned resource (athletes, events, participants, timeline entries, result overrides and athlete statistics) is scoped to the owning coach with the generic non-enumerating `404`, and that list endpoints never leak foreign rows.
- **Workspace tenancy** — workspaces and memberships now form the shared authorization boundary. Existing records migrate losslessly into default UTC workspaces; the console selects an accessible workspace and scopes every request, aggregate and local view reset through `X-Workspace-Id`. Creator and result actors remain durable attribution, so an account departure removes memberships without destroying shared history.
- **Quality gate** — lint, typecheck, Vitest/RTL, Supertest, production builds, an informational Vitest V8 coverage report, the Playwright E2E suite (smoke + desktop/mobile vertical slice + axe audit), and the Docusaurus build are configured in CI. The Gitea `coverage` job prints a short Markdown summary; the `e2e` job boots a Postgres service container and skips with a clear message until the Auth0/E2E credentials are configured as repository secrets.
- **Docs deployment** — the Docusaurus site is live at `https://athlora-deploy.pages.dev`.

## Keeping these docs current

These pages are a living record that agents maintain as part of every task. If you are an agent working in this repo: the sections marked **Current status** / **Current state** and the **check-status table** in `getting-started/scripts.md` must be updated in the same session as the code they describe, documentation changes are committed with the feature (Conventional Commits, `Assisted-by:` footer), the docs build must pass before you finish, and this site's source-of-truth process docs must never be edited for progress. The full mandatory rules are in the build spec, Section 14.

## Getting around

- [Getting Started](/docs/getting-started/frontend) — run the stack locally
- [Architecture overview](/docs/architecture/overview) — how the pieces fit
- [Database](/docs/db-schema/overview) — schema and result derivation rules
- [Project Methodology](/docs/project-methodology/methodology) — workflow, Git methodology, build plan, roadmap, and Sprint records

## AI Usage

This documentation site and the repository follow the course AI policy.

- **Code generation:** `opencode[deepseek-v4-flash-free]`, `opencode[gpt-5.6-sol]`, `OpenCode[gpt-5.6-terra]`
- **In-line editing:** `opencode[deepseek-v4-flash-free]`, `opencode[gpt-5.6-sol]`, `Codex[GPT-5]`, `Claude-Web[Sonnet 5]`, `OpenCode[gpt-5.6-terra]`
- **Code review:** `opencode[gpt-5.6-sol]`
- Commits that contain AI-generated code carry an `Assisted-by:` footer naming every tool and model.
- Every submitted document ends with an explicit AI usage or non-usage declaration.

This section is kept current as tools and models change.

## AI declaration

This document was created with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol], and updated with the assistance of OpenCode[gpt-5.6-terra].
