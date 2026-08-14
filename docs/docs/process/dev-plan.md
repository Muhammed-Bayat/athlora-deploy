---
sidebar_position: 3
---

# Athletics Coaching App — Development Plan & Build Spec

This plan turns the general Sport Coaching brief into a concrete build for **athletics (track & field)**, using the Stage 1/2/3 tech stack from the AI-Policy-Compliant requirements doc, and is structured so each stage maps directly onto the Sprint 1–4 rubrics.

---

## 0. Sport-Specific Decisions (Athletics)

Athletics is chosen as the sport, so before writing code the team should lock in the following domain decisions — they drive the schema, the live-logging UI, and the stats engine.

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

This means the "timeline" concept from the brief becomes, per event: a sequence of **attempts/splits/incidents** tied to an athlete, timestamped, editable/undoable, from which results and stats are derived.

---

## 1. Core Data Model (built in Stage 1, extended later)

```
users            (id, auth0_id, name, email, role[coach|assistant|viewer], created_at, updated_at)
athletes         (id, coach_id, name, dob, gender, squad, notes, archived_at, created_at, updated_at)
events           (id, created_by, type[competition|training], discipline, title, date, time,
                   location_name, latitude, longitude,
                   status[scheduled|in_progress|completed|cancelled], created_at, updated_at)
event_participants (event_id, athlete_id, rsvp_status[pending|yes|no])  -- live RSVP
timeline_entries (id, event_id, athlete_id, discipline, entry_type[attempt|split|penalty|note],
                   value, unit[seconds|metres|cm], is_foul, incident_type, note_text, recorded_by,
                   version, device_id, created_at, updated_at, deleted_at)
results          (event_id, athlete_id, discipline, outcome[no_result|valid|dq|dnf|dns], final_result,
                   unit, placing, is_pb, is_sb, manual_override, override_reason, overridden_by,
                   override_at, updated_at)
```

- `timeline_entries` is the append-only log the brief calls for ("recording what happens ... as it happens"). Soft-delete (`deleted_at`) supports "easy to edit or undo."
- `results` is a derived/materialized table recalculated from `timeline_entries`, with a `manual_override` field for correction — satisfies "statistics should be derived from this log, with a manual override."
- Stage 2/3 add `roles_permissions`, `season_totals` (view), `sync_queue`/`action_log` for offline merge, `standings`.

---

## 2. Stage 1 — Basic (maps to Sprint 1 & early Sprint 2 rubric items)

**Stack used:** React + Vite + TypeScript, CSS, Node.js + Express, PostgreSQL (Neon/university), Auth0, Open-Meteo, Vitest, RTL, Supertest, Gitea Actions, Vercel, Render, Docusaurus + Cloudflare Pages.

**Design source of truth:** the frontend mirrors the approved mockups `SDP-Landing.html` and `SDP-Coach-Console.html` (brand "Athlora", labelled "SDP" in the mockups as a placeholder: Bebas Neue headings, Inter body, Space Mono for results, deep-ink navy + teal/cyan/blue palette). All tokens are defined in the build spec — Section 6 — and no other colours/fonts should be introduced.

### 2.1 Setup (Week 1)
1. Create Gitea repo, mono-repo layout: `/frontend`, `/backend`, `/docs`.
2. Set up Trello board with columns matching sprint milestones; add cards for every Stage 1 feature below.
3. Scaffold frontend with Vite + React + TypeScript; scaffold backend with Express + TypeScript.
4. Provision PostgreSQL (Neon/university instance); write initial migration for the core tables above.
5. Configure Auth0 tenant: sign up, login, password reset flows wired into the React app and Express middleware (JWT verification).
6. Set up Gitea Actions: on push/PR, run lint, `tsc --noEmit`, Vitest, Supertest.
7. Deploy skeleton frontend to Vercel, skeleton backend to Render, confirm they talk to each other and to Auth0.
8. Init Docusaurus in `/docs`, deploy to Cloudflare Pages; add "Getting Started" pages for frontend and backend.
9. Add the `README.md` AI Usage section (template from the requirements document), require Conventional Commits for every commit, and use an `Assisted-by:` footer whenever AI generated code for a commit. Agree that the agent creates all commits during agent-driven sessions; developers only branch, push, review and merge — they never hand-write commits on an agent-driven branch.

### 2.2 Athlete & Roster Management
1. DB: `athletes` table + Express CRUD endpoints (`GET/POST/PUT/DELETE /api/athletes`).
2. React: roster list view, add/edit athlete form (name, DOB, gender category, discipline group, notes).
3. Tests: Supertest for CRUD endpoints; RTL for the roster form and list.

### 2.3 Event Management
1. DB: `events` table + CRUD endpoints, with `type` (competition/training), discipline(s), date/time, location.
2. React: event list/calendar-lite view, create/edit/cancel event form.
3. Integrate **Open-Meteo**: on event detail view, fetch and display forecast for the event's location/date.
4. Tests: Supertest for event CRUD + weather-fetch error handling (API down/no data).

### 2.4 Live Event Timeline Logging
1. DB: `timeline_entries` table, discipline-aware `entry_type`/`value`/`unit`.
2. Backend endpoints: `POST /api/events/:id/entries` (log attempt/split/penalty), `PATCH /:entryId` (edit), `DELETE /:entryId` (soft-delete/undo).
3. React: "Live Event" screen — pick athlete + discipline, quick-entry buttons appropriate to the discipline (time entry for track, distance/attempt entry for field, penalty/incident buttons), with an undo affordance on the last few entries.
4. Design the entry form to branch by discipline type (time vs distance vs height vs attempt-pass/fail) — this is the sport-specific core of the whole app.
5. Tests: Vitest unit tests for result-derivation logic (e.g., "best of N attempts", "fastest split"); RTL tests for the live logging screen; Supertest for entry endpoints including edit/undo.

### 2.5 Results & Stats Derivation
1. Backend: pure functions that compute `results` from `timeline_entries` per discipline (best valid attempt for field, finishing time for track, applying DQ/DNF/DNS overrides).
2. `manual_override` field exposed in UI for corrections, with an audit trail (who/when overrode).
3. React: athlete summary page (recent results, PBs) and roster summary page.

### 2.6 Dashboard
1. React: dashboard component that switches between "Live Event" view (event in progress) and "Roster/Athlete Summary" view (no active event).
2. Basic responsive CSS pass (mobile-first, since logging happens track-side).

### 2.7 Stage 1 Definition of Done (tie back to Sprint 1 rubric)
- Repo organised, all members committing, README + getting-started docs present → *Version Control, Getting Started*.
- Trello board in active use → *Work Tracker*.
- Git methodology (e.g., trunk-based + PRs, or GitFlow) documented in `/docs` → *Git Methodology*.
- Tech stack table copied into `/docs` with one-line motivation per tool → *Tech Stack*.
- Docusaurus site live with non-trivial content (architecture overview, setup guide) → *Documentation Site*.
- Sign up/login/roster/events/live logging/dashboard/weather all working end-to-end → *Implementation*.

---

## 3. Stage 2 — Intermediate (maps to Sprint 2 rubric)

**New stack:** IndexedDB + Dexie, vite-plugin-pwa, Socket.IO, Chart.js, Playwright.

### 3.1 Roles & Permissions
1. DB: `role` on `users` (coach, assistant, viewer) or a join table if athletes can also belong to multiple squads/coaches.
2. Express middleware: permission checks per route (e.g., assistants can POST timeline entries but not DELETE athletes).
3. React: role-aware UI (hide/disable controls the current user can't use).
4. Tests: Supertest permission-denied cases per role; Playwright E2E for "assistant logs an event but cannot edit roster."

### 3.2 Fixtures, RSVPs, Shared Calendar
1. DB: `event_participants` (athlete/user, RSVP status), extend `events` to support cross-coach fixtures (event visible to multiple coach accounts).
2. Backend: endpoints to invite another coach's squad to a fixture, endpoints for RSVP.
3. React: shared calendar view, RSVP widget on event detail.
4. Notifications/reminders: simple scheduled job (or Socket.IO push when connected) reminding users of upcoming events.

### 3.3 Season Stats, Comparisons, Charts
1. Backend: aggregate queries/views for season totals, per-event breakdowns, athlete-vs-athlete and squad-vs-opponent comparisons (PB/SB progression over the season).
2. React + Chart.js: line charts for PB/SB progression, bar charts for comparisons.
3. Tests: Vitest for aggregation logic; RTL/Playwright for chart rendering with seeded data.

### 3.4 Offline-First Logging
1. Frontend: Dexie/IndexedDB store mirroring `timeline_entries` shape; all live-logging writes go to IndexedDB first.
2. vite-plugin-pwa: service worker + manifest so the app installs and the shell loads with no connection.
3. Background sync: on reconnect, queue drains and POSTs to the backend in order; conflicts at this stage are simply "last write wins" (true merge logic is Stage 3).
4. Socket.IO: when online, broadcast new/edited entries to other connected clients viewing the same event (live updates).
5. Tests: Playwright test that simulates offline (toggle network), logs entries, restores network, and asserts entries synced.

### 3.5 Stage 2 Definition of Done (tie back to Sprint 2 rubric)
- Core features (roles, fixtures/RSVP, stats/charts, offline logging) implemented with automated UI+API tests → *Core Features, Automated Testing*.
- API documented (e.g., OpenAPI or Docusaurus API reference) and externally reachable from Render → *API*.
- Database schema documented (ERD + migrations) in `/docs` → *Database Documentation*.
- Third-party packages (Dexie, Socket.IO, Chart.js, Open-Meteo, Auth0) documented with why each was chosen → *Third-Party Code Documentation*.
- Bug tracker (Trello labels or Gitea issues) actively used → *Bug Tracker*.
- Testing docs: describe unit/integration/E2E strategy and any user-feedback process → *Testing Documentation*.

---

## 4. Stage 3 — Advanced (maps to Sprint 3/4 rubric)

**New stack:** unique action IDs, PostgreSQL transactions, record version numbers, merge rules, pdf-lib, scheduling logic, rule-based summaries.

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

### 4.5 Stage 3 Definition of Done (tie back to Sprint 3/4 rubric)
- Multi-device merge tested and demonstrably consistent → *Feature Implementation, Performance*.
- API has documentation and is deployed/available externally with auth → *API Implementation, Availability, Design*.
- Public pages accessible, responsive, accessible (WCAG basics: alt text, contrast, keyboard nav) → *Accessibility, Responsiveness, App Design*.
- Full DB schema + deployment docs finalized → *Database: Data, Deployment, Structure*.

---

## 5. AI Compliance — Ongoing Checklist (every stage)

- [ ] Every commit, including documentation, test and squash-merge commits, follows Conventional Commits (`type(scope): description`); descriptions are short, lowercase and imperative.
- [ ] `README.md` **AI Usage** section kept current (generation / in-line editing / code review tools + models, or explicit non-usage statements).
- [ ] `Assisted-by:` footer on every commit where AI generated code, listing every tool and model that contributed. In-line editing and code review do not require a footer on every commit but must be declared in the README.
- [ ] The agent, not the developer, creates all commits in agent-driven sessions; the developer only creates and pushes the branch, then reviews and merges the PR.
- [ ] AI usage/non-usage declaration on every submitted document (including this plan, if AI-assisted).
- [ ] All AI-generated code and tests reviewed and tested before merge — passing AI-written tests never assumed to prove correctness.
- [ ] The `/docs` site is kept current in every session: status/state sections and the check-status table are updated with the code (build spec Section 14), doc changes committed with the feature, and the docs build passes before a task is declared done.
- [ ] Reports/discussions rewritten in the team's own voice, especially motivation/design-rationale sections.
- [ ] For each assessment: start a new AI session, keep an unedited transcript/tool export as evidence.
- [ ] Re-check the COMS3011A and University AI policies before each submission; University policy wins on conflict.

---

## 6. Suggested Sprint-to-Stage Mapping

| Sprint (rubric) | Build stage | Primary focus |
|---|---|---|
| Sprint 1 | Stage 1 setup + start of Basic build | Infra, auth, roster, events, project docs/methodology |
| Sprint 2 | Finish Stage 1 + all of Stage 2 | Live logging, results/dashboard, roles, offline PWA, stats/charts |
| Sprint 3 | Start Stage 3 | Multi-device merge, standings, scheduling, PDF export |
| Sprint 4 (Submission) | Finish + polish Stage 3 | Accessibility, performance, full docs, public pages, final API polish |

## 7. Immediate Next Actions
1. Finalise which athletics disciplines are in scope for MVP (recommend: sprints, one distance event, long jump, shot put — enough to exercise both "timed" and "measured" result types without overbuilding).
2. Draft the ERD from Section 1 and review it as a team before writing migrations.
3. Set up repo, Trello, and Docusaurus skeleton in the first working session so Version Control/Work Tracker/Docs Site rubric items are "exists" from day one.

---

## AI Declaration

The preceding document was edited with the assistance of Codex[GPT-5], opencode[deepseek-v4-flash-free].
