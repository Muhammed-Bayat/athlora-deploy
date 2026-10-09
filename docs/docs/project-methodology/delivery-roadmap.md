---
sidebar_position: 6
---

# Delivery Roadmap

This is the living delivery roadmap for Athlora, an athletics coaching application. It records completed work from Gitea issues and pull requests, then defines the next planned stages. Status is changed only when the implementation, tests, and relevant documentation have landed.

## Product Direction

Athlora is intended to support a complete athletics meet and season:

- **Timed track events:** sprints, middle and long distance, hurdles, relays, and race walks.
- **Measured field events:** horizontal jumps, throws, high jump, and pole vault.
- **Meet and season workflows:** athletes, training, competitions, assignments, live results, PB/SB progression, weather, shared fixtures, reporting, and scheduling.

The delivered release (**0.5.0**) covers the multi-discipline catalogue, shared fixtures, public statistics and schedule, offline sync, club branding, and the coaching assistant. What remains from the product direction above is multi-events (heptathlon/decathlon) and automated season scheduling. Two breaking schema changes landed after the `v0.5.0` tag: `0040_remove_club_accent_color.sql` (single `primaryColor` branding) and `0041_remove_squads.sql` (squad feature and API removal). Any discipline added to the catalogue must ship its own contract, validation, logger controls, result derivation, placing rules, PB/SB comparison, and tests.

## Core Model

```text
users              coach identity and role
athletes           coach-owned roster, profile, notes, archival state
events             competition or training event, discipline, venue, lifecycle
event_participants athlete assignment and RSVP state
timeline_entries   append-only, versioned live observations and tombstones
results            derived per athlete/event/discipline result and audited override
account_deletions  durable account-deletion and retry state
```

The timeline is the system of record for live activity. Results, placing, PBs, and SBs are derived from it and recomputed by the API. Manual corrections remain auditable rather than replacing the source observation.

## Completed Roadmap

### Phase 1: Platform and Contract Foundation

**Status: Complete**

Established the non-monolithic React/Vite frontend, Express API, PostgreSQL migrations, Auth0 authentication, deployed service foundations, Gitea CI, and documentation site. The first API contract deliberately fixed the implemented discipline to 100m/seconds while keeping the schema ready for additional athletics contracts.

| Work tracked | Delivered through |
|---|---|
| Project scaffold, approved branding, UI conversion, Neon, Auth0, deployments, and docs deployment: issues `#9`, `#11`, `#12`, `#16`-`#20` | PRs `#1`, `#2`, `#3`, `#4`, `#5`, `#6`, `#8`, `#19` |
| Shared 100m contract, authentication/ownership, validation, transaction utilities, and typed frontend API behavior: issues `#23`-`#27` | PRs `#49`, `#50`, `#51`, `#52` |

Key outcomes:

- Separate Vercel SPA, Render API, Neon PostgreSQL, and Cloudflare Pages documentation deployments.
- Auth0 Universal Login, verified JWTs, local-user synchronization, and non-enumerating coach ownership checks.
- Checksum-tracked SQL migrations and structured API validation/error responses.
- Shared 100m result DTOs and pure result-derivation foundations.

### Phase 2: Roster and Event Management

**Status: Complete**

Delivered the coach's day-to-day roster and event workflow, including preservation of historical data when an athlete is archived, an assignment is removed, or an event is cancelled.

| Work tracked | Delivered through |
|---|---|
| Athlete API, roster UI, and athlete performance detail: issues `#28`-`#31` | PRs `#54`, `#57`, `#67`, `#68` |
| Event lifecycle, participant API/UI, and event-management UI: issues `#32`-`#36` | PRs `#55`, `#56`, `#58`, `#59` |
| Event-day venue forecast | PR `#70` |

Key outcomes:

- Coach-owned athlete create, edit, archive, restore, filters, profiles, and 100m performance history.
- Competition/training event lifecycle, cancellation-as-history-preservation, event list/calendar views, and participant RSVP management.
- Venue forecasts and authenticated current-weather data for the coach console, now migrated to GraySky Free current/daily data.

### Phase 3: Live 100m Results and Coaching Insight

**Status: Complete**

Delivered the 100m track-side workflow from event start through derived outcomes, correction, completion, athlete statistics, and dashboard summary.

| Work tracked | Delivered through |
|---|---|
| Result engine, live-entry API, version-aware corrections, recomputation, and overrides: issues `#37`-`#42` | PRs `#53`, `#60`, `#61`, `#62`, `#63` |
| Athlete statistics, aggregates, logger, results UI, dashboard, and verification: issues `#43`-`#48` | PRs `#64`, `#65`, `#66`, `#71`, `#73`, `#74` |
| Account lifecycle management | PR `#69` |

Key outcomes:

- Mobile-first 100m finish, incident, note, correction, and undo logging with optimistic versions.
- Transactional derived outcomes for valid results, DQ, DNF, DNS, placing, PBs, SBs, and audited manual overrides.
- Athlete statistics, live/summary dashboard states, current event progress, recent results, and PB feeds.
- Permanent account deletion with durable tombstones and retry reconciliation.
- Desktop/mobile Playwright vertical-slice coverage, accessibility audits, and cross-coach authorization integration tests.

`#71` was closed without a formal merge, but its dashboard work was incorporated during the `#73` conflict-resolution sequence and is present on `main`.

### Phase 4: Experience and Release Hardening

**Status: Complete**

Polished the public landing experience and authenticated console after the core workflow was in place.

| Work tracked | Delivered through |
|---|---|
| Landing-page redesign and mockup-matched cinematic track | PRs `#75`, `#76` |
| Premium coach-console redesign, theme controls, weather readout, and filter refinements | PR `#77` |

The console uses real dashboard data rather than mockup figures. The landing page and console retain responsive and reduced-motion behavior.

### Phase 5: Shared Workspaces, Roles, and Fixtures

**Status: Complete** — Sprint 2, delivered between `v0.3.0` and `v0.4.0`.

Moved the single-coach console to shared club workspaces with membership, roles, injury tracking, cross-workspace fixtures, event helpers, realtime updates, and in-app reminders/notifications.

| Work tracked | Delivered through |
|---|---|
| Workspace tenancy, coach/assistant roles, athlete lifecycle, and persisted injury/recovery records: issues `#89`, `#93` | PRs `#105`, `#107`, `#108`, `#110`, `#115`, `#118` |
| Cross-workspace fixture invitations, audited RSVPs, host lifecycle, shared calendar, and fixture notifications: issues `#93`, `#145` | PRs `#111`-`#116`, `#119`, `#164`, `#166`, `#181`, `#182`, `#196`, `#204`, `#213` |
| Capped event helpers, public QR event logger, authorized realtime broadcast, in-app reminders, and notifications: issues `#95`, `#96`, `#146` | PRs `#125`, `#128`, `#129`, `#150`-`#152`, `#120`, `#205`-`#207` |
| Club onboarding, assistant permission expansion, privacy/consent gate, and navigation hardening | PRs `#148`, `#149`, `#156`, `#157`, `#178`, `#183` |
| Fitness anatomy maps, venue search, and the GraySky weather migration | PRs `#79`, `#117`, `#140`, `#195`, `#219` |

Key outcomes:

- Club workspaces with `requireOperationalAccess`/`requireCoach` role enforcement and non-enumerating membership checks.
- Athlete lifecycle states and injury/recovery records with anatomy mapping.
- Fixtures that invite other clubs without exposing unrelated workspace data, with audited RSVPs and host-authoritative results.
- Socket.IO realtime invalidations, in-app reminders, notification actions, and capped temporary event helpers.

### Phase 6: Offline PWA, Comparisons, and Release Hardening

**Status: Complete** — Sprint 2, closed at `v0.4.0`.

| Work tracked | Delivered through |
|---|---|
| Installable offline-first PWA (service worker, manifest, background replay) | PRs `#158`, `#209` |
| Two-athlete comparison, all-time progression, club comparisons, multi-entity comparisons, and season filters | PRs `#122`, `#127`, `#208`, `#215`, `#217`, `#221` |
| Public statistics landing presentation | PR `#210` |
| First Gemini voice assistant release and audio stabilization | PRs `#161`, `#229` |
| Expanded E2E suite, coverage lift (61.9% → 78.6%), testing/DB/API docs, and sprint records | PRs `#160`, `#193`, `#216`, `#222`, `#223`, `#224`, `#230`, `#233` |

### Phase 7: Multi-Discipline Meets and Public Surfaces

**Status: Complete** — Sprint 3, delivered between `v0.4.0` and `v0.5.0`, with regression fixes and post-release cleanup through PR `#332`.

| Work tracked | Delivered through |
|---|---|
| Sprint 3 client follow-ups: past-event ordering, accessible chart colours, AI voice command/idle sleep, split publication flags: issues `#234`-`#237` | PRs `#255`-`#258` |
| Dashboard preferences and saved views, club branding and media endpoints: issues `#241`, `#243` | PRs `#262`, `#263` |
| Idempotent offline batch sync, offline recovery surface, and conflict reconciliation: issues `#253`, `#252`, `#254` | PRs `#264`, `#275`, `#285` |
| Multi-discipline meet foundation plus timed, measured, and vertical discipline catalogues (migrations `0028`-`0031`): issues `#244`-`#247` | PRs `#265`-`#270` |
| Athlete preferred disciplines/goals, session rosters with guest entrants, and relay teams: issues `#242`, `#248`, `#249` | PRs `#271`-`#273` |
| Official result finalization and automatic places: issue `#250` | PR `#276` |
| Public club schedule, filtered leaderboards, statistics reports, and multi-discipline public meet logging: issues `#238`-`#240`, `#251` | PRs `#274`, `#277`, `#278`, `#279` |
| Athlete discipline performance views, all-discipline comparison, tabbed meet logger, per-session rosters, recorder attribution, field official-result selection, and incident undo | PRs `#286`, `#288`-`#290`, `#294`-`#301` |
| Public athlete leaderboard and club standings | PR `#292` |
| Discipline-aware Gemini assistant, dashboard simplification, and the `0.5.0` version bump | PRs `#303`, `#305`, `#306` |
| Regression fixes (unit-only session rows, progression history, calendar current-day entries, injury delete confirmation): issue `#316` | PRs `#308`, `#320`-`#322` |
| Stale docsite refresh, club accent-colour removal (`0040`), and public-logger decimal inputs | PRs `#323`-`#325` |
| Squad feature/API/schema removal (`0041`), events calendar copy, and dialog/top-bar layering: issue `#310` | PRs `#330`-`#332` |

Key outcomes:

- One meet container hosts many discipline sessions with entrants, session rosters, guests, and relays, while legacy 100m history stays untouched.
- Timed, horizontal-jump/throw, and vertical (high jump/pole vault) rules with countback, elimination, and automatic places.
- Unauthenticated public schedule, statistics, report, leaderboard, and standings surfaces gated by independent club publication flags.
- Offline logging with idempotent batch sync, duplicate receipts, conflict evidence, and coach-led resolution before finalization.
- Club branding/media endpoints, dashboard personalisation, and a discipline-aware Gemini assistant.

## Planned Roadmap

### Stage 2: Full Athletics Events and Connected Coaching

**Status: In Progress**

#### 2.1 Discipline Expansion

**Status: Implemented** — the full athletics catalogue ships in migrations `0029`-`0031`, with browser coverage in `e2e/tests/vertical-events.spec.ts` and `e2e/tests/relay-session.spec.ts`.

1. Add timed contracts for 200m/400m, middle and long distance, hurdles, relays, and race walks.
2. Add measured contracts for long jump, triple jump, throws, high jump, and pole vault.
3. Give every discipline explicit unit, validation, timeline-entry, derivation, placing, PB/SB, and presentation rules.
4. Add migration, unit, API, component, and browser coverage with each discipline; do not loosen the 100m contract as a shortcut.

#### 2.2 Roles, Fixtures, and Shared Calendar

**Status: Implemented**

1. Coach and assistant permissions enforced through `requireOperationalAccess` and `requireCoach` middleware. Assistants can create/edit athletes and log events; coaches manage members, join requests, participant rosters, and fixture withdrawals.
2. Cross-workspace fixtures with hashed invitations, independent participating-team status, guest roster isolation, revision reacceptance, and withdrawals.
3. In-app event reminders, fixture notifications, and RSVP audit trails.
4. API and Playwright coverage for workspace, roles, athlete lifecycle, injuries, event helpers, realtime, reminders, public logger, fixture notifications, and authorization boundaries.

#### 2.3 Season Analysis

1. Add season totals and discipline-aware athlete comparisons.
2. Render PB/SB progression and comparison charts as hand-built SVG — the project ships no charting library (`chart.js` is not a frontend dependency).
3. Add chart tests using seeded, multi-discipline data.

**Status: Partially implemented** — two-athlete comparison and single-athlete progression charts are implemented. Protected normalized athlete and workspace discipline analysis now combines legacy 100m and finalized generic-session results with direction-aware PB ranking and PDF exports, and coach-facing multi-discipline comparison surfaces have shipped (`GET /api/v1/athletes/comparison/multi`, `GET /api/v1/clubs/comparison/multi`). Broader season totals remain planned.

#### 2.4 Offline-First Logging

**Status: Implemented**

| Work tracked | Delivered through |
|---|---|
| PWA shell + service worker caching | `vite-plugin-pwa` configuration, manifest, icons |
| IndexedDB offline queue via Dexie | `frontend/src/offline/db.ts`, `actionQueue.ts` |
| Designated offline logger | Migration `0019`, backend service + routes, frontend UI |
| Idempotent batch sync endpoint | Migration `0020`, `POST /api/v1/sync/batch` |
| Sync engine + queue drain | `frontend/src/offline/syncEngine.ts` |
| Queue status UI | `frontend/src/features/timeline/QueueStatusBadge.tsx` |
| Offline detection | `frontend/src/hooks/useOnlineStatus.ts` |
| Backend tests | `backend/src/services/sync.test.ts` |
| Frontend tests | `frontend/src/offline/actionQueue.test.ts`, `designationGuard.test.ts`, `syncEngine.test.ts` |
| Playwright E2E | `e2e/tests/offline-logging.spec.ts` |

Key outcomes:

- Installable PWA with service worker caching app shell and API responses.
- IndexedDB offline queue for create/edit/undo actions with deterministic ordering.
- One designated offline logger per event with transfer protocol.
- Idempotent batch sync with version conflict detection.
- Deterministic queue drain with result recomputation.
- Sign-out/revocation cleanup of offline data.
- Workspace switching, coach/assistant roles, athlete lifecycle, injury mapping, fixtures, RSVP, event helpers, realtime, reminders, notifications, public loggers, club onboarding, comparison, and progression charts.

### Stage 3: Collaborative Meets and Season Tools

**Status: In Progress** — 3.1 and 3.2 are implemented; 3.3 is still planned.

#### 3.1 Multi-Device Offline Merge

**Status: Implemented** — client-generated `actionId`s, idempotent `POST /api/v1/sync/batch` with durable receipts, `expectedVersion` conflict detection, and coach resolution through `GET …/resolution` and `POST …/conflicts/:conflictId/resolve` (`backend/src/routes/meets.ts:23`-`24`, migrations `0020`, `0036`).

1. Give every locally created action a unique ID before it reaches the server.
2. Add batch sync in PostgreSQL transactions with version checks and a durable audit trail.
3. Keep concurrent new entries, resolve concurrent edits deterministically, and preserve undo tombstones.
4. Recompute results after each accepted batch so every device converges on the same outcome.
5. Test different reconnection orders across two simulated devices — a dedicated two-device suite does not exist yet; ordering is covered indirectly by `backend/src/services/sync.test.ts`, `backend/src/services/sync.integration.test.ts`, and `e2e/tests/offline-logging.spec.ts`.

#### 3.2 Public Results and Exports

**Status: Implemented** — public leaderboards and standings, the `/stats*` public pages, and PDF/CSV export via `pdf-lib` (issues `#239`, `#240`; PRs `#277`, `#278`, `#292`).

1. Add standings and explicitly allow-listed, read-only public athlete result pages.
2. Generate athlete and event PDF/CSV reports with `pdf-lib`.

#### 3.3 Coaching Summaries and Scheduling

**Status: Planned**

1. Add rule-based summaries such as consecutive PBs and selection suggestions. The product now ships an external Gemini assistant (`@google/genai`, PR `#303`) for discipline-aware coaching queries, but this specific schedule/selection summary work is unbuilt and would stay deterministic application logic rather than model output.
2. Generate season schedules from fixtures, venues, and availability, with athlete and venue clash warnings.

## Quality Gates

Every roadmap item is complete only when its implementation and documentation are aligned, relevant tests pass, and the applicable CI checks are green. The current CI runs frontend, backend, documentation, an informational frontend/backend coverage job, and credential-gated E2E jobs. The coverage job prints a short Markdown summary and does not yet impose a threshold. New work must preserve the coach-ownership boundary, responsive track-side interaction, accessible controls, and server-authoritative result derivation.

## AI declaration

This document was created or updated with the assistance of OpenCode[openai/gpt-5.6-terra].
