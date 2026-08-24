---
sidebar_position: 3
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
athletes             (id, coach_id, name, dob, gender, squad, notes, archived_at)
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

**Stack:** React + Vite + TypeScript, CSS, Node.js + Express, PostgreSQL (Neon), Auth0, Open-Meteo, Vitest, RTL, Supertest, Gitea Actions, Vercel, Render, Docusaurus + Cloudflare Pages.

**Design source of truth:** the frontend mirrors the approved mockups `SDP-Landing.html`, `SDP-Coach-Console.html`, and `Athlora_Premium_Dashboard.html` (brand "Athlora", labelled "SDP" in the mockups as a placeholder: Space Grotesk headings, Satoshi body, Space Grotesk mono for results, deep-ink navy + teal/cyan/blue palette). All tokens are defined in the build spec — Section 6 — and no other colours/fonts should be introduced.

**Status: Complete**

### 2.1 Project Scaffold
- Monorepo layout: `/frontend`, `/backend`, `/docs`, `/e2e`
- Gitea Projects board with columns matching sprint milestones
- Vite + React + TypeScript (strict) frontend scaffold
- Express + TypeScript backend scaffold
- PostgreSQL on Neon with checksum-tracked migrations
- Auth0 tenant configured: sign up, login, password reset wired into SPA and Express middleware
- Gitea Actions CI: lint, typecheck, test on every push/PR
- Frontend deployed to Vercel, backend to Render
- Docusaurus site deployed to Cloudflare Pages
- README.md with AI Usage section, Conventional Commits enforced

### 2.2 Athlete & Roster Management
- `athletes` table with coach-scoped CRUD endpoints
- Roster list view, add/edit athlete form (name, DOB, gender, squad, notes)
- Archive/restore with historical data preservation
- Athlete performance detail with 100m statistics, PBs, SBs
- Tests: Supertest for CRUD, RTL for roster form and list

### 2.3 Event Management
- `events` table with CRUD endpoints, type (competition/training), discipline, date/time, location
- Event list/calendar views, create/edit/cancel event form
- Event lifecycle: scheduled → in_progress → completed, with cancellation preserving history
- Participant RSVP management and event assignments
- Open-Meteo integration: event-day forecasts and current weather
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
- 215 frontend tests, 301 backend tests, Playwright E2E vertical slice with axe accessibility

---

## 3. Stage 2 — Intermediate (Sprint 2)

**New stack:** IndexedDB + Dexie, vite-plugin-pwa, Socket.IO, Chart.js, Playwright.

**Status: Planned**

### 3.1 Discipline Expansion
1. Add timed contracts for 200m/400m, middle and long distance, hurdles, relays, and race walks.
2. Add measured contracts for long jump, triple jump, throws, high jump, and pole vault.
3. Give every discipline explicit unit, validation, timeline-entry, derivation, placing, PB/SB, and presentation rules.
4. Add migration, unit, API, component, and browser coverage with each discipline; do not loosen the 100m contract as a shortcut.

### 3.2 Roles & Permissions
1. Enforce coach, assistant, and viewer permissions. Assistants may log events but cannot archive athletes.
2. Express middleware: permission checks per route.
3. React: role-aware UI (hide/disable controls the current user can't use).
4. Tests: Supertest permission-denied cases per role; Playwright E2E for role enforcement.

### 3.3 Fixtures, RSVPs, Shared Calendar
1. Extend fixtures so another coach's squad can participate without exposing unrelated workspace data.
2. Backend: endpoints to invite another coach's squad to a fixture, endpoints for RSVP.
3. React: shared calendar view, RSVP widget on event detail.
4. Notifications/reminders: simple scheduled job (or Socket.IO push when connected) reminding users of upcoming events.

### 3.4 Season Stats, Comparisons, Charts
1. Backend: aggregate queries/views for season totals, per-event breakdowns, athlete-vs-athlete and squad-vs-opponent comparisons (PB/SB progression over the season).
2. React + Chart.js: line charts for PB/SB progression, bar charts for comparisons.
3. Tests: Vitest for aggregation logic; RTL/Playwright for chart rendering with seeded data.

### 3.5 Offline-First Logging
1. Frontend: Dexie/IndexedDB store mirroring `timeline_entries` shape; all live-logging writes go to IndexedDB first.
2. vite-plugin-pwa: service worker + manifest so the app installs and the shell loads with no connection.
3. Background sync: on reconnect, queue drains and POSTs to the backend in order; conflicts at this stage are simply "last write wins" (true merge logic is Stage 3).
4. Socket.IO: when online, broadcast new/edited entries to other connected clients viewing the same event (live updates).
5. Tests: Playwright test that simulates offline (toggle network), logs entries, restores network, and asserts entries synced.

### 3.6 Stage 2 Definition of Done
- Core features (discipline expansion, roles, fixtures/RSVP, stats/charts, offline logging) implemented with automated UI+API tests.
- API documented (Docusaurus API reference) and externally reachable from Render.
- Database schema documented (ERD + migrations) in `/docs`.
- Third-party packages (Dexie, Socket.IO, Chart.js) documented with why each was chosen.
- Gitea Projects actively tracking issues.
- Testing docs: describe unit/integration/E2E strategy.

---

## 4. Stage 3 — Advanced (Sprint 3/4)

**New stack:** unique action IDs, PostgreSQL transactions, record version numbers, merge rules, pdf-lib, scheduling logic, rule-based summaries.

**Status: Planned**

### 4.1 Multi-Device Collaborative Offline Logging (core hard problem)
1. Every locally-created `timeline_entries` row gets a client-generated **unique action ID** (UUID) at creation time, before any server contact — prevents duplicate saves on retry/resync.
2. Add a `version` integer to `timeline_entries`/`results`; every edit increments it.
3. Sync endpoint accepts a batch of actions tagged with device ID + action ID + timestamp; server applies them inside a **PostgreSQL transaction** so a batch either fully commits or rolls back.
4. **Merge rules** (documented explicitly, since this is graded on correctness):
   - Two *new* entries from different devices for the same event → both kept (append-only log, no conflict by nature).
   - Two *edits* to the *same* entry → resolved by version number + a deterministic tiebreaker (e.g., server timestamp, or "most specific/latest valid attempt wins" for a field-event PB), with the losing edit retained in an audit trail rather than discarded silently.
   - Deletes (undos) are tombstones, not hard deletes, so a late-arriving edit to an undone entry doesn't resurrect bad data unexpectedly.
5. Recompute `results` server-side after each merged batch so all clients converge on the same derived result regardless of reconnection order.
6. Tests: Playwright/integration tests simulating two "devices" logging and reconnecting in different orders, asserting final state is identical either way — this is the most important test suite in the project.

### 4.2 League/Standings + Public Pages
1. DB: `standings` view aggregating results across events/fixtures for participating squads.
2. React: public, unauthenticated read-only pages per squad/athlete (shareable link) showing results and season stats.
3. **pdf-lib**: "Export report" button generating a PDF (and/or CSV) of an athlete's or event's results.

### 4.3 Automated Summaries & Selection Suggestions
1. **Rule-based** (explicitly non-AI-service, per the requirements doc) logic: e.g., flag "3 consecutive PBs," "biggest improvement this season," or suggest a relay/selection lineup by best recent times per leg — implemented as plain backend functions, unit-tested.

### 4.4 Season Scheduling
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
| Sprint 3 | Start Stage 3 | Multi-device merge, standings, scheduling, PDF export |
| Sprint 4 (Submission) | Finish + polish Stage 3 | Accessibility, performance, full docs, public pages, final API polish |

---

## AI Declaration

The preceding document was edited with the assistance of Codex[GPT-5], opencode[deepseek-v4-flash-free], and opencode[gpt-5.6-sol].
