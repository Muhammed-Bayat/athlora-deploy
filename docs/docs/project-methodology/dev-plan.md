---
sidebar_position: 5
---

# Development Plan

This plan defines the build for **athletics (track & field)**, structured so each stage maps directly onto the Sprint 1–4 rubrics.

---

## 0. Sport-Specific Decisions (Athletics)

Athletics is chosen as the sport. The following domain decisions drive the schema, the live-logging UI, and the stats engine.

**Event types to support**
- **Track (timed):** sprints (100m/200m/400m), middle/long distance (800m–10000m), hurdles, relays, race walks
- **Field (measured):** long jump, triple jump, high jump, pole vault, shot put, discus, javelin, hammer
- **Multi-events (advanced/optional):** heptathlon/decathlon as a composite event referencing sub-events

**Result unit per event type**
- Time (`hh:mm:ss.ms`) for track
- Distance (metres, to 2 decimal places) for horizontal jumps/throws
- Height (metres/cm) for vertical jumps (high jump, pole vault)
- Attempts (each jump/throw is a discrete attempt: valid, foul, pass) — best attempt becomes the recorded result

**Penalties/notable actions specific to athletics**
- False start (track)
- Lane infringement / obstruction
- Foul (field event attempt)
- Disqualification (DQ), Did Not Finish (DNF), Did Not Start (DNS)
- Personal Best (PB) / Season Best (SB) flags (derived, not manually logged)

This means the "timeline" concept becomes, per event: a sequence of **attempts/splits/incidents** tied to an athlete, timestamped, editable/undoable, from which results and stats are derived.

---

## 1. Core Data Model (built in Stage 1, extended later)

```
users                (id, name, email, auth0_id, role, created_at, updated_at)
athletes             (id, coach_id, name, dob, gender, notes, archived_at)
events               (id, type[competition|training], discipline, title, date, time,
                      location_name, latitude, longitude, status, created_by)
event_participants   (event_id, athlete_id, rsvp_status)
timeline_entries     (id, event_id, athlete_id, discipline, entry_type[attempt|split|penalty|note],
                      value, unit, is_foul, incident_type, note_text, recorded_by, version,
                      device_id, created_at, updated_at, deleted_at)
results              (event_id, athlete_id, discipline, outcome, final_result, unit, placing,
                      is_pb, is_sb, manual_override, override_reason, overridden_by, override_at)
account_deletions    (auth0_id, status, attempts, next_attempt_at, last_error,
                      requested_at, updated_at, completed_at)
```

- `timeline_entries` is the append-only log ("recording what happens ... as it happens"). Soft-delete (`deleted_at`) supports "easy to edit or undo." `version` enables optimistic concurrency for offline merge (Stage 3).
- `results` is a derived/materialized table recalculated from `timeline_entries`, with `manual_override` for correction — satisfies "statistics should be derived from this log, with a manual override."
- `account_deletions` provides durable deletion tombstones and retry state for the account lifecycle.
- Stage 2/3 add `roles_permissions`, `season_totals` (view), `sync_queue`/`action_log` for offline merge, `standings`.

---

## 2. Stage 1 — Basic (Sprint 1 & early Sprint 2)

**Stack:** React + Vite + TypeScript, CSS, Node.js + Express, PostgreSQL (Neon), Auth0, GraySky Free, Vitest, RTL, Supertest, Gitea Actions, Vercel, Render, Docusaurus + Cloudflare Pages.

**Design source of truth:** the frontend mirrors the approved mockups `SDP-Landing.html`, `SDP-Coach-Console.html`, and `Athlora_Premium_Dashboard.html` (kept at `docs/docs/sprints/sprint-1/screenshots/00002803-Athlora_Premium_Dashboard.html`; brand "Athlora", labelled "SDP" in the mockups as a placeholder: Space Grotesk headings, Satoshi body, Space Grotesk mono for results, deep-ink navy + teal/cyan/blue palette). All tokens are defined in the build spec — Section 6 — and no other colours/fonts should be introduced.

**Status: Complete**

### 2.1 Project Scaffold
- Monorepo layout: `/frontend`, `/backend`, `/docs`, `/e2e`
- Gitea Projects board with columns matching sprint milestones
- Vite + React + TypeScript (strict) frontend scaffold
- Express + TypeScript backend scaffold
- PostgreSQL on Neon with checksum-tracked migrations
- Auth0 tenant configured: sign up, login, password reset wired into SPA and Express middleware
- Gitea Actions CI: lint, typecheck, test, build, and an informational frontend/backend coverage report on every push/PR
- Frontend deployed to Vercel, backend to Render
- Docusaurus site deployed to Cloudflare Pages
- README.md with AI Usage section, Conventional Commits enforced

### 2.2 Athlete & Roster Management
- `athletes` table with coach-scoped CRUD endpoints
- Roster list view, add/edit athlete form (name, DOB, gender, notes)
- Archive/restore with historical data preservation
- Athlete performance detail with 100m statistics, PBs, SBs
- Tests: Supertest for CRUD, RTL for roster form and list

### 2.3 Event Management
- `events` table with CRUD endpoints, type (competition/training), discipline, date/time, location
- Event list/calendar views, create/edit/cancel event form
- Event lifecycle: scheduled → in_progress → completed, with cancellation preserving history
- Participant RSVP management and event assignments
- GraySky Free integration: event-day forecasts (up to ten days) and current weather
- Tests: Supertest for event CRUD, weather error handling

### 2.4 Live Event Timeline Logging
- `timeline_entries` table with discipline-aware entry_type/value/unit
- Backend endpoints: POST (log), PATCH (edit), DELETE (undo) with optimistic versioning
- Mobile-first "Live Event" screen with discipline-specific quick-entry controls
- Version-aware corrections and undo
- Transactional result recomputation on every mutation
- Tests: Vitest for result derivation, RTL for live logging, Supertest for entry endpoints

### 2.5 Results & Stats Derivation
- Pure functions that compute `results` from `timeline_entries` per discipline
- Manual override with audit trail (who/when/why)
- Derived placing, PB/SB flags
- Athlete statistics endpoint (PB, SB, counts, recent history)
- Dashboard aggregate endpoint (summary/live modes, roster, upcoming events, recent results)
- Tests: Vitest for derivation logic, Supertest for statistics/dashboard

### 2.6 Account Lifecycle
- Auth0 user synchronization
- Password ticket generation
- Permanent account deletion with durable tombstones and retry reconciliation
- Non-enumerating ownership checks across all resources
- Cross-coach authorization integration tests

### 2.7 Stage 1 Definition of Done
- Repo organised, all members committing, README + getting-started docs present
- Gitea Projects board in active use
- Git methodology documented in `/docs`
- Tech stack table in `/docs` with one-line motivation per tool
- Docusaurus site live with architecture overview, setup guide
- Sign up/login/roster/events/live logging/dashboard/weather all working end-to-end
- Frontend and backend tests passing, interactive Vitest V8 coverage artifacts, and a Playwright E2E vertical slice with axe accessibility

---

## 3. Stage 2 — Intermediate (Sprint 2)

**New stack:** IndexedDB + Dexie, vite-plugin-pwa, Socket.IO, hand-built SVG charts (no charting library), Playwright.

**Status: In Progress** — discipline expansion (3.1), roles (3.2), fixtures/RSVP (3.3), and offline logging (3.5) are implemented; season stats/comparisons (3.4) remains partially implemented.

### 3.1 Discipline Expansion
1. Add timed contracts for 200m/400m, middle and long distance, hurdles, relays, and race walks.
2. Add measured contracts for long jump, triple jump, throws, high jump, and pole vault.
3. Give every discipline explicit unit, validation, timeline-entry, derivation, placing, PB/SB, and presentation rules.
4. Add migration, unit, API, component, and browser coverage with each discipline; do not loosen the 100m contract as a shortcut.

**Status: Implemented** — migrations `0029`-`0031` (plus the relay catalogue in `0034`), derivation services, and e2e coverage in `vertical-events.spec.ts` and `relay-session.spec.ts`.

### 3.2 Roles & Permissions
1. Enforce coach and assistant permissions. Assistants can create/edit athletes and log events; coaches manage members, join requests, participant rosters, and fixture withdrawals.
2. Express middleware: permission checks per route.
3. React: role-aware UI (hide/disable controls the current user can't use).
4. Tests: Supertest permission-denied cases per role; Playwright E2E for role enforcement.

**Status: Implemented** — coach/assistant roles enforced through `requireOperationalAccess` and `requireCoach` middleware.

### 3.3 Fixtures, RSVPs, Shared Calendar
1. Extend fixtures so another club can participate without exposing unrelated workspace data.
2. Backend: endpoints to invite another club to a fixture, endpoints for RSVP.
3. React: shared calendar view, RSVP widget on event detail.
4. Notifications/reminders: simple scheduled job (or Socket.IO push when connected) reminding users of upcoming events.

**Status: Implemented** — cross-workspace fixtures with hashed invitations, RSVP, revision reacceptance, withdrawals, fixture notifications, event helper invitations, and offline designation.

### 3.4 Season Stats, Comparisons, Charts
1. Backend: aggregate queries/views for season totals, per-event breakdowns, and athlete-vs-athlete comparisons (PB/SB progression over the season).
2. React with hand-built SVG charts (no charting library): line charts for PB/SB progression, bar charts for comparisons.
3. Tests: Vitest for aggregation logic; RTL/Playwright for chart rendering with seeded data.

**Status: Partially implemented** — two-athlete comparison and single-athlete progression charts are implemented. Protected normalized athlete and workspace discipline analysis now combines legacy 100m and finalized generic-session results with direction-aware PB ranking and PDF exports, and multi-discipline comparison has shipped (`GET /api/v1/athletes/comparison/multi`, `GET /api/v1/clubs/comparison/multi`). Broader season totals remain planned.

### 3.5 Offline-First Logging
1. Frontend: Dexie/IndexedDB store mirroring `timeline_entries` shape; all live-logging writes go to IndexedDB first.
2. vite-plugin-pwa: service worker + manifest so the app installs and the shell loads with no connection.
3. Background sync: on reconnect, queue drains and POSTs batches to the backend in order. Conflicts are no longer "last write wins": optimistic `expectedVersion` checks reject stale authenticated edits with `409 TIMELINE_ENTRY_VERSION_CONFLICT`, duplicate `actionId`s return idempotent receipts, conflict evidence is retained, and a coach resolves each conflict before finalization (merge rules delivered with Stage 3 work).
4. Socket.IO: when online, broadcast new/edited entries to other connected clients viewing the same event (live updates).
5. Tests: Playwright test that simulates offline (toggle network), logs entries, restores network, and asserts entries synced.

**Status: Implemented** — PWA shell, IndexedDB action queue, designated offline logger, idempotent batch sync, sync engine, queue status UI, and offline detection.

### 3.6 Stage 2 Definition of Done
- Core features (discipline expansion, roles, fixtures/RSVP, stats/charts, offline logging) implemented with automated UI+API tests.
- API documented (Docusaurus API reference) and externally reachable from Render.
- Database schema documented (ERD + migrations) in `/docs`.
- Third-party packages (Dexie, Socket.IO) and the hand-built SVG chart approach documented with why each was chosen.
- Gitea Projects actively tracking issues.
- Testing docs: describe unit/integration/E2E strategy.

---

## 4. Stage 3 — Advanced (Sprint 3/4)

**New stack:** unique action IDs, PostgreSQL transactions, record version numbers, merge rules, pdf-lib, scheduling logic, rule-based summaries.

**Status: In Progress** — 4.1 (multi-device merge) and 4.2 (standings, public pages, PDF export) are implemented; 4.3 (rule-based summaries) and 4.4 (season scheduling) are still planned.

### 4.1 Multi-Device Collaborative Offline Logging (core hard problem)

**Status: Implemented** — client `actionId`s, idempotent `POST /api/v1/sync/batch` with durable receipts, `expectedVersion` conflict detection, and coach conflict resolution (`backend/src/routes/meets.ts:23`-`24`, migrations `0020` and `0036`).
1. Every locally-created `timeline_entries` row gets a client-generated **unique action ID** (UUID) at creation time, before any server contact — prevents duplicate saves on retry/resync.
2. Add a `version` integer to `timeline_entries`/`results`; every edit increments it.
3. Sync endpoint accepts a batch of actions tagged with device ID + action ID + timestamp; server applies them inside a **PostgreSQL transaction** so a batch either fully commits or rolls back.
4. **Merge rules** (documented explicitly, since this is graded on correctness):
   - Two *new* entries from different devices for the same event → both kept (append-only log, no conflict by nature).
   - Two *edits* to the *same* entry → resolved by version number + a deterministic tiebreaker (e.g., server timestamp, or "most specific/latest valid attempt wins" for a field-event PB), with the losing edit retained in an audit trail rather than discarded silently.
   - Deletes (undos) are tombstones, not hard deletes, so a late-arriving edit to an undone entry doesn't resurrect bad data unexpectedly.
5. Recompute `results` server-side after each merged batch so all clients converge on the same derived result regardless of reconnection order.
6. Tests: **the two-device simulation is not yet built.** No automated suite logs from two devices and reconnects them in different orders. Current coverage is `backend/src/services/sync.test.ts` (unit), `backend/src/services/sync.integration.test.ts` (real database, idempotent/duplicate receipts), and `e2e/tests/offline-logging.spec.ts` (single-client offline queue drain). The two-device reconnection-order suite remains an outstanding Stage 3 test item.

### 4.2 League/Standings + Public Pages

**Status: Implemented** — `standings` service and public leaderboard/standings pages (issue `#240`, PR `#292`), unauthenticated public statistics/schedule/report pages (issues `#238`, `#239`, PRs `#274`, `#278`), and PDF/CSV export via `pdf-lib` (`frontend/src/features/reports`, `frontend/src/features/publicStats/reportExport.ts`).

1. DB: `standings` view aggregating results across events/fixtures for participating clubs.
2. React: public, unauthenticated read-only pages per athlete (shareable link) showing results and season stats.
3. **pdf-lib**: "Export report" button generating a PDF (and/or CSV) of an athlete's or event's results.

### 4.3 Automated Summaries & Selection Suggestions

**Status: Planned**

1. **Rule-based** (explicitly non-AI-service, per the requirements doc) logic: e.g., flag "3 consecutive PBs," "biggest improvement this season," or suggest a relay/selection lineup by best recent times per leg — implemented as plain backend functions, unit-tested. Note: the product separately ships a Gemini assistant (`@google/genai`, PR `#303`) for free-form coaching queries; it does not implement these deterministic summaries.

### 4.4 Season Scheduling

**Status: Planned**

1. Scheduling logic: given a list of fixtures/venues/athlete availability, generate a proposed season calendar and flag clashes (same athlete double-booked, venue double-booked).
2. React: schedule view with clash warnings surfaced inline.

### 4.5 Stage 3 Definition of Done
- Multi-device merge tested and demonstrably consistent.
- API has documentation and is deployed/available externally with auth.
- Public pages accessible, responsive, accessible (WCAG basics: alt text, contrast, keyboard nav).
- Full DB schema + deployment docs finalized.

---

## 5. AI Compliance — Ongoing Checklist (every stage)

- [ ] Every commit, including documentation, test and squash-merge commits, follows Conventional Commits (`type(scope): description`); descriptions are short, lowercase and imperative.
- [ ] `README.md` **AI Usage** section kept current (generation / in-line editing / code review tools + models, or explicit non-usage statements).
- [ ] `Assisted-by:` footer on every commit where AI generated code, listing every tool and model that contributed. In-line editing and code review do not require a footer on every commit but must be declared in the README.
- [ ] The agent, not the developer, creates all commits in agent-driven sessions; the developer only creates and pushes the branch, then reviews and merges the PR.
- [ ] AI usage/non-usage declaration on every submitted document.
- [ ] All AI-generated code and tests reviewed and tested before merge — passing AI-written tests never assumed to prove correctness.
- [ ] Reports/discussions rewritten in the team's own voice, especially motivation/design-rationale sections.
- [ ] For each assessment: start a new AI session, keep an unedited transcript/tool export as evidence.
- [ ] Re-check the COMS3011A and University AI policies before each submission; University policy wins on conflict.

---

## 6. Sprint-to-Stage Mapping

| Sprint (rubric) | Build stage | Primary focus |
|---|---|---|
| Sprint 1 | Stage 1 setup + start of Basic build | Infra, auth, roster, events, project docs/methodology |
| Sprint 2 | Finish Stage 1 + all of Stage 2 | Live logging, results/dashboard, roles, offline PWA, stats/charts |
| Sprint 3 | Start Stage 3 | Multi-discipline meets, official-result selection, public statistics/schedule/report/leaderboards, club branding, dashboard personalisation, AI assistant (standings, PDF export, and multi-device merge also landed; automated scheduling did not) |
| Sprint 4 (Submission) | Finish + polish Stage 3 | Accessibility, performance, full docs, public pages, final API polish |

---

## AI declaration

This document was created or updated with the assistance of OpenCode[openai/gpt-5.6-terra].
