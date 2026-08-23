---
sidebar_position: 2
---

# Sprint 1 User Stories & Acceptance Criteria

This document defines the comprehensive set of user stories, acceptance criteria, and User Acceptance Tests (UATs) for **Athlora** Sprint 1. It is synthesized from project architecture documentation (`README.md`, developer plans, API contracts, database schemas), GitHub issues (`#27`, `#38`, `#41`, `#42`, `#54`, `#55`, `#56`, `#57`, `#58`, `#59`, `#60`, `#61`, `#62`), backend services, database migrations, and frontend UI components.

---

## Summary of User Stories

| ID | Title | Priority | Target Component / Module |
|---|---|---|---|
| **US-001** | Synchronized Authentication & Identity Gating | High | Auth0, Middleware (`auth.ts`), Token Bridge |
| **US-002** | Athlete Roster Management & Filtering | High | Frontend `AthletesPage`, API `/athletes` |
| **US-003** | Athlete Archival and Historical Preservation | Medium | Roster Archival Service & UI |
| **US-004** | Event Creation, Listing, and Calendar Management | High | Frontend `EventsPage`, API `/events` |
| **US-005** | Event Status Lifecycle & Forward-Only State Machine | High | Event Lifecycle & Logging Guard Service |
| **US-006** | Event Participant Assignments & RSVP Management | High | Event Details, Participants API (`/events/:id/participants`) |
| **US-007** | Append-Only Timeline Live Logging (100m Track Contract) | High | Timeline API (`/events/:id/entries`), Result Engine |
| **US-008** | Version-Aware Timeline Entry Corrections & Soft-Delete Undo | High | Timeline PATCH/DELETE, Optimistic Concurrency |
| **US-009** | Automated Result Derivation, Placings, and PB/SB Flagging | High | `resultDerivation.ts`, Materialized `results` table |
| **US-010** | Coach Manual Result Overrides & Audit Trail | Medium | Results Override API & Audit Columns |
| **US-011** | Dashboard Metrics & Roster Snapshot Overview | Medium | Frontend `CoachConsole`, `DashboardPage` |

---

## Detailed User Stories

### US-001: Synchronized Authentication & Identity Gating
- **Priority:** High
- **User Story:** As an athletics coach, I want my application access to be securely authenticated via Auth0 and synchronized to our PostgreSQL database, so that my account context, role, and private athlete data remain strictly secure.

#### Acceptance Criteria (Given/When/Then)
1. **Given** an unauthenticated visitor accesses the Athlora application, **When** they attempt to view protected console views, **Then** the Auth0 token bridge intercepts the request and redirects them to Auth0 login or displays the authentication landing page.
2. **Given** a successfully authenticated user whose Auth0 token is verified by the backend middleware, **When** they synchronize their profile via `PUT /api/v1/auth/me`, **Then** the application user row is created or updated in the `users` table and a typed user context (UUID, Auth0 ID, role) is established.
3. **Given** an authenticated user whose Auth0 identity has not been synchronized, **When** they access resource routes, **Then** the backend responds with HTTP `403` and code `AUTH_USER_NOT_SYNCHRONIZED`.

#### User Acceptance Tests (UAT)
- **UAT-001.1:** Navigate to the application root while logged out. Verify that protected console views are withheld and login prompts appear.
- **UAT-001.2:** Authenticate via Auth0 and verify that `PUT /api/v1/auth/me` successfully syncs the user and permits access to coach features.
- **UAT-001.3:** Send an API request with an invalid or missing JWT token. Verify response code `401 UNAUTHORIZED`.

---

### US-002: Athlete Roster Management & Filtering
- **Priority:** High
- **User Story:** As a coach, I want to manage a digital roster of my athletes (creating, viewing, and updating profiles) and filter them by name or squad, so that I can easily organize my training groups.

#### Acceptance Criteria (Given/When/Then)
1. **Given** I am on the Athletes Roster page (`AthletesPage`), **When** I view my roster, **Then** the client fetches active athletes from `GET /athletes`, ordered stably by lower-case name, creation date, and ID.
2. **Given** I fill out the athlete creation form with a valid name and optional DOB, gender, squad, and notes, **When** I submit the form (`POST /athletes`), **Then** a new athlete record is created with server-derived coach ownership and displayed in the roster.
3. **Given** I apply query filters such as `name` substring matching or exact `squad` matching, **When** the request is processed, **Then** only athletes matching the criteria are returned.

#### User Acceptance Tests (UAT)
- **UAT-002.1:** Create a new athlete with name "Usain Bolt", squad "Sprints", and verify successful creation (HTTP `201`).
- **UAT-002.2:** Filter the roster by squad "Sprints" and verify that only athletes belonging to that squad are listed.
- **UAT-002.3:** Attempt to create an athlete without a mandatory `name`. Verify validation error `400 VALIDATION_ERROR`.

---

### US-003: Athlete Archival and Historical Preservation
- **Priority:** Medium
- **User Story:** As a coach, I want to archive inactive or graduated athletes without destroying their historical event participation, timeline entries, and results, so that past season records remain intact and auditable.

#### Acceptance Criteria (Given/When/Then)
1. **Given** an active athlete in my roster, **When** I click archive (`DELETE /athletes/:id`), **Then** their `archivedAt` timestamp is populated, and they are excluded from the default active roster and dashboard counts.
2. **Given** an archived athlete, **When** I request the roster with `includeArchived=true`, **Then** the archived athlete is included in the list.
3. **Given** an archived athlete who previously participated in past events, **When** I view those event details or historical logs, **Then** their past participation, timeline entries, and results remain fully visible and preserved.
4. **Given** an archived athlete, **When** I restore them (`POST /athletes/:id/unarchive`), **Then** `archivedAt` is cleared and they return to active status.

#### User Acceptance Tests (UAT)
- **UAT-003.1:** Archive an athlete and verify they disappear from the default roster view (`GET /athletes`).
- **UAT-003.2:** Verify via `GET /athletes?includeArchived=true` that the archived athlete is returned with a non-null `archivedAt`.
- **UAT-003.3:** Verify that historical timeline entries and results for the archived athlete remain intact and queryable.
- **UAT-003.4:** Restore the athlete via `POST /athletes/:id/unarchive` and verify `archivedAt` becomes `null`.

---

### US-004: Event Creation, Listing, and Calendar Management
- **Priority:** High
- **User Story:** As a coach, I want to schedule and manage competitions and training sessions with dates, times, and locations, so that I can plan my team's season calendar effectively.

#### Acceptance Criteria (Given/When/Then)
1. **Given** I am on the Events calendar/management page (`EventsPage`), **When** I view events, **Then** they are fetched via `GET /events` with optional filters for `type` (`competition` or `training`), `status`, and date ranges (`dateFrom`, `dateTo`), ordered by date and time.
2. **Given** I submit an event creation form (`POST /events`) with title, type, date, location, and discipline (`100m`), **When** validated and saved, **Then** the event is created with `status` defaulting to `scheduled`.
3. **Given** an existing scheduled event, **When** I perform a full replacement update (`PUT /events/:id`), **Then** its mutable fields are updated.

#### User Acceptance Tests (UAT)
- **UAT-004.1:** Create a new competition event titled "Spring Invitational" for date `2026-09-15` and verify HTTP `201` response.
- **UAT-004.2:** Filter events by `type=competition` and verify correct filtering.
- **UAT-004.3:** Send an invalid latitude/longitude range (e.g. latitude `95.0`) and verify validation rejection (`400 VALIDATION_ERROR`).

---

### US-005: Event Status Lifecycle & Forward-Only State Machine
- **Priority:** High
- **User Story:** As a coach, I want event statuses to follow a strict forward-only lifecycle (`scheduled` -> `in_progress` -> `completed` / `cancelled`), so that timeline logging is only permitted during live execution and completed/cancelled records cannot be corrupted.

#### Acceptance Criteria (Given/When/Then)
1. **Given** an event in `scheduled` status, **When** I update its status to `in_progress`, **Then** the transition is permitted, opening timeline logging.
2. **Given** an event in `completed` or `cancelled` status, **When** I attempt to revert its status to `in_progress` or `scheduled`, **Then** the API rejects the transition with HTTP `409 INVALID_EVENT_TRANSITION`.
3. **Given** an event that is not `in_progress`, **When** I attempt to create or edit timeline entries, **Then** the operation is rejected with HTTP `409 EVENT_NOT_IN_PROGRESS`.
4. **Given** an event, **When** I cancel it (`DELETE /events/:id`), **Then** its status becomes `cancelled` (terminal), while preserving its historical timeline and result rows as non-scoring.

#### User Acceptance Tests (UAT)
- **UAT-005.1:** Transition an event from `scheduled` to `in_progress`, then to `completed`. Verify success.
- **UAT-005.2:** Attempt to move a `completed` event back to `in_progress`. Verify HTTP `409 INVALID_EVENT_TRANSITION`.
- **UAT-005.3:** Attempt to log a timeline entry for an event in `scheduled` status. Verify HTTP `409 EVENT_NOT_IN_PROGRESS`.
- **UAT-005.4:** Cancel an event (`DELETE /events/:id`) and verify status updates to `cancelled`.

---

### US-006: Event Participant Assignments & RSVP Management
- **Priority:** High
- **User Story:** As a coach, I want to assign active athletes to specific events, manage their RSVP statuses (`pending`, `yes`, `no`), and remove assignments cleanly, so that I know who is participating in each fixture.

#### Acceptance Criteria (Given/When/Then)
1. **Given** an event detail view, **When** I assign an active owned athlete (`POST /events/:eventId/participants`), **Then** a participant record is created with `rsvpStatus` defaulting to `pending`.
2. **Given** an assigned participant, **When** I update their RSVP status (`PUT /events/:eventId/participants/:athleteId`), **Then** their status is idempotently replaced (e.g. to `yes` or `no`).
3. **Given** an attempt to assign an archived athlete, **When** the request is submitted, **Then** the API rejects it with HTTP `409 ATHLETE_ARCHIVED`.
4. **Given** a participant assignment, **When** I remove it (`DELETE /events/:eventId/participants/:athleteId`), **Then** only the join row is deleted while existing timeline entries and results for that athlete remain intact.

#### User Acceptance Tests (UAT)
- **UAT-006.1:** Assign an active athlete to an event and verify HTTP `201` response.
- **UAT-006.2:** Attempt to assign the same athlete twice. Verify HTTP `409 PARTICIPANT_ALREADY_ASSIGNED`.
- **UAT-006.3:** Update participant RSVP status to `yes` and verify persistence.
- **UAT-006.4:** Remove a participant assignment and verify timeline/results data remains intact.

---

### US-007: Append-Only Timeline Live Logging (100m Track Contract)
- **Priority:** High
- **User Story:** As a coach (or assistant), I want to record live timeline entries (`attempt`, `split`, `penalty`, `note`) during an in-progress 100m event, so that athletic performance is logged accurately in seconds.

#### Acceptance Criteria (Given/When/Then)
1. **Given** an `in_progress` event, **When** I record an `attempt` with a time value in seconds (`POST /events/:eventId/entries`), **Then** the append-only timeline entry is stored with version `1`, and results are automatically recomputed.
2. **Given** a 100m event, **When** competition finishing times are derived (`deriveTrackTime`), **Then** for a **competition** event it uses the **latest** valid attempt, and for a **training** event it uses the **fastest** (lowest) valid positive attempt.
3. **Given** an entry with incident types (`false_start`, `dq`, `dnf`, `dns`, `lane_infringement`), **When** processed, **Then** `dq`, `dnf`, or `dns` void the result outcome (`outcome` set to `dq`/`dnf`/`dns`, `final_result = NULL`), whereas `false_start` and `lane_infringement` act as penalties without voiding the result.

#### User Acceptance Tests (UAT)
- **UAT-007.1:** Log a valid 100m attempt of `10.45` seconds for an athlete in an `in_progress` competition. Verify HTTP `201` and successful storage.
- **UAT-007.2:** Record a `dq` incident for an athlete and verify that the derived result outcome correctly becomes `dq` with `final_result: null`.
- **UAT-007.3:** Verify that splits are recorded correctly as informational entries without altering the primary finishing time derivation.

---

### US-008: Version-Aware Timeline Entry Corrections & Soft-Delete Undo
- **Priority:** High
- **User Story:** As a coach, I want to correct or undo live timeline observations using optimistic concurrency control and soft-delete tombstones, so that accidental misentries can be safely corrected without destroying audit history or causing race conditions.

#### Acceptance Criteria (Given/When/Then)
1. **Given** an existing timeline entry with version `N`, **When** I send a `PATCH` request with `expectedVersion: N` and corrected values, **Then** the update succeeds, the version increments to `N + 1`, and results are atomically recomputed.
2. **Given** a stale `PATCH` or `DELETE` request with an outdated `expectedVersion`, **When** processed, **Then** the request is rejected with HTTP `409 TIMELINE_ENTRY_VERSION_CONFLICT`.
3. **Given** a timeline entry, **When** I undo it (`DELETE /entries/:entryId` with `expectedVersion`), **Then** a soft-delete tombstone (`deleted_at`) is set, excluding it from normal reads and result calculations.
4. **Given** an already undone entry, **When** I send an exact retry of the undo request, **Then** it remains a `204` no-op without bumping versions or timestamps.

#### User Acceptance Tests (UAT)
- **UAT-008.1:** Update a timeline entry value using the correct `expectedVersion`. Verify success and version increment.
- **UAT-008.2:** Attempt to update a timeline entry with an incorrect `expectedVersion`. Verify HTTP `409 TIMELINE_ENTRY_VERSION_CONFLICT`.
- **UAT-008.3:** Soft-delete (undo) a timeline entry and verify it is excluded from subsequent reads and result calculations.
- **UAT-008.4:** Send a duplicate delete request for the already-undone entry and verify idempotent `204` no-op response.

---

### US-009: Automated Result Derivation, Placings, and PB/SB Flagging
- **Priority:** High
- **User Story:** As a coach, I want event results, placings, and Personal Bests (PB) / Season Bests (SB) to be automatically derived and updated whenever timeline entries change, so that I have instant, accurate performance analytics without manual calculation.

#### Acceptance Criteria (Given/When/Then)
1. **Given** timeline entries for an event, **When** results are computed, **Then** the result outcome is mapped (`no_result`, `valid`, `dq`, `dnf`, `dns`) and stored in the materialized `results` table.
2. **Given** valid results in an event, **When** placings are calculated, **Then** athletes are ranked in ascending order of time (fastest is 1st), with tied athletes sharing placings.
3. **Given** a newly derived valid result or promoted override, **When** compared against historical records, **Then** `isPb` is set to `true` if it beats all prior recorded times for that discipline, and `isSb` is set to `true` if it beats the best effective result in the current season.

#### User Acceptance Tests (UAT)
- **UAT-009.1:** Log times for three athletes (`10.50s`, `10.20s`, `10.80s`). Verify placings are correctly assigned (1st: 10.20s, 2nd: 10.50s, 3rd: 10.80s).
- **UAT-009.2:** Record a new PB time for an athlete and verify `isPb` and `isSb` flags are set to `true`.
- **UAT-009.3:** Verify that voided outcomes (`dq`/`dnf`/`dns`) do not trigger PB/SB status or placings.

---

### US-010: Coach Manual Result Overrides & Audit Trail
- **Priority:** Medium
- **User Story:** As a coach, I want to manually override or correct an athlete's derived result with a specific reason and audit trail, so that I can handle timing discrepancies or official judge corrections while maintaining complete transparency.

#### Acceptance Criteria (Given/When/Then)
1. **Given** an athlete's result row for an event, **When** I submit a manual override containing `manualOverride` value (positive seconds) and a non-blank `overrideReason`, **Then** the override is recorded along with `overriddenBy` (coach user ID) and `overrideAt` timestamp.
2. **Given** a result with a manual override, **When** statistics and PB/SB calculations run, **Then** they use the effective override value while retaining the raw derived `finalResult` for auditability.
3. **Given** an existing override, **When** I submit paired nulls to clear it, **Then** the override fields are reset and the result reverts to raw derivation.

#### User Acceptance Tests (UAT)
- **UAT-010.1:** Apply a manual override of `10.15` seconds with reason "Hand-timing correction" and verify persistence of audit metadata (`overriddenBy`, `overrideAt`).
- **UAT-010.2:** Verify that statistics and PB calculations correctly use the override value (`10.15s`).
- **UAT-010.3:** Clear the manual override and verify the result reverts to the raw derived value.

---

### US-011: Dashboard Metrics & Roster Snapshot Overview
- **Priority:** Medium
- **User Story:** As a coach, I want a centralized dashboard showing key season metrics (active athletes count, upcoming events, season PBs count) and a roster snapshot, so that I have an immediate high-level view of team status upon logging in.

#### Acceptance Criteria (Given/When/Then)
1. **Given** I am on the Coach Dashboard (`CoachConsole` / `DashboardPage`), **When** the dashboard loads, **Then** it fetches and displays aggregate metrics: total athletes, active athletes count, upcoming events count, and season PBs.
2. **Given** dashboard data, **When** rendered, **Then** it presents an upcoming events list (non-cancelled events with date >= today) and an active roster snapshot.

#### User Acceptance Tests (UAT)
- **UAT-011.1:** Load the dashboard and verify that active athlete counts and upcoming event counts match database records.
- **UAT-011.2:** Verify that archived athletes are excluded from the roster snapshot and active athlete count.
- **UAT-011.3:** Verify that upcoming events list displays future non-cancelled fixtures in chronological order.

---

## AI Usage Declaration

This document was generated and refined with the assistance of AI tools:
- **Code Generation & Documentation Synthesis:** `opencode[deepseek-v4-flash-free]`, `opencode[gpt-5.6-sol]`
- **In-line Review & Structuring:** `opencode[deepseek-v4-flash-free]`
