---
sidebar_position: 4
---

# Sprint 3 User Stories & Acceptance Criteria

This document defines the user stories, acceptance criteria, and User Acceptance Tests (UATs) for **Athlora** Sprint 3. It builds on the foundations established in Sprint 1 and Sprint 2 and extends Athlora from the 100m vertical slice towards multi-discipline meets, public statistics and schedules, reports, club branding, and richer live-result and offline workflows. It is synthesized from the Sprint 3 client-review notes, Gitea issues (`#234`, `#235`, `#236`, `#237`, `#238`, `#239`, `#240`, `#241`, `#242`, `#243`, `#244`, `#245`, `#246`, `#247`, `#248`, `#249`, `#250`, `#251`, `#252`, `#253`, `#254`), backend services, database migrations, and frontend UI components.

Stories are ordered by the team's delivery-row plan (quick wins, parallel foundations, multi-discipline foundation, discipline implementation, next features, results and placements, public features, final meet logger, multi-device offline sync) rather than numerically, so later stories remain consistent with the foundation they depend on.

---

## Summary of User Stories

| ID | Title | Priority | Target Component / Module |
|---|---|---|---|
| **US-001** | Past Events Newest-First Ordering | Medium | Frontend `EventsPage` |
| **US-002** | Accessible Distinct Chart Colours | Medium | `ProgressionChart`, `ComparisonPage`, `PublicStatsPage`, `chartSeries` tokens |
| **US-003** | AI Voice Command and Idle Sleep | Medium | AI API (`geminiMicrophone`), `AthletesPage` |
| **US-004** | Independent Club Publication Flags | High | Clubs API (`/clubs/publication`), Public Schedule, Public Statistics |
| **US-005** | Dashboard Personalisation and Saved Views | Medium | Preferences API (`/preferences`), `CoachConsole`, `DashboardPage` |
| **US-006** | Club Branding and Media | Medium | Club Branding API, Media API, `ClubBadge` |
| **US-007** | Idempotent Offline Batch Sync | High | Sync API (`POST /sync/batch`), `syncEngine`, Action Queue |
| **US-008** | Multi-Discipline Meet Foundation | High | Meets API (`/disciplines`, `/sessions`, `/entrants`), Migration `0028` |
| **US-009** | Timed Discipline Rules (Sprints, Distance, Hurdles, Steeplechase, Race Walk) | High | Timed Catalogue (Migration `0029`), `timedDerivation.ts` |
| **US-010** | Horizontal Jumps and Throws Rules | High | Measured Catalogue (Migration `0030`), `measuredDerivation.ts` |
| **US-011** | High Jump and Pole Vault Rules | High | Vertical Catalogue (Migration `0031`), `verticalScoring.ts` |
| **US-012** | Relay Team Support | High | Relay Catalogue (Migration `0034`), `MeetRosterPanel`, `SessionLivePanel` |
| **US-013** | Athlete Preferred Disciplines and Season Goals | Medium | Athletes API, `AthleteForm`, `AthleteDetailPage` |
| **US-014** | Session Rosters and Guest Entrants | High | Meets API (`/sessions`, `/entrants`), `MeetRosterPanel` |
| **US-015** | Public Club Schedule Pages | Medium | Public Schedule API (`/public/schedule`), `PublicSchedule*` pages |
| **US-016** | Offline Logger Recovery Surface | Medium | `OfflineRecoverySurface`, Offline Hooks, Action Queues |
| **US-017** | Official Result Finalization and Automatic Places | High | `sessionResultPolicy.ts`, `SessionLivePanel`, Statistics surfaces |
| **US-018** | Public Athlete Leaderboards and Club Standings | Medium | Leaderboard API, `PublicLeaderboardPage`, `PublicStandingsPage` |
| **US-019** | Public Statistics Reports and Export | Medium | Public Statistics Report API, `PublicStatisticsReportPage`, `reportExport` |
| **US-020** | Multi-Discipline Public Meet Logging | Medium | Public Logger API (`/public/logger`), `PublicMeetLogger` |
| **US-021** | Multi-Device Offline Conflict Reconciliation | Medium | Resolution API (`/sessions/:sessionId/resolution`), `offlineResolution.ts` |

---

## Detailed User Stories

### US-001: Past Events Newest-First Ordering
- **Issue:** #234
- **Priority:** Medium
- **User Story:** As a coach, I want past events to be listed newest-first, so that I can find my most recent competitions and training sessions without scrolling through old history.

#### Acceptance Criteria (Given/When/Then)
1. **Given** I am on the Events page (`EventsPage`), **When** I view past events, **Then** they are ordered by date descending (newest first), with deterministic tiebreakers for equal dates.
2. **Given** past events spanning multiple seasons, **When** the list renders, **Then** the most recent event appears at the top and the oldest at the bottom.
3. **Given** upcoming events, **When** the list renders, **Then** their existing chronological ordering is preserved and unaffected by the past-events change.

#### User Acceptance Tests (UAT)
- **UAT-001.1:** Create events dated `2026-09-01`, `2026-09-15`, and `2026-09-28`. View past events and verify they appear in `09-28`, `09-15`, `09-01` order.
- **UAT-001.2:** Create two events on the same date. Verify their relative order is stable across reloads.
- **UAT-001.3:** Verify upcoming events still render soonest-first while past events render newest-first.

---

### US-002: Accessible Distinct Chart Colours
- **Issue:** #235
- **Priority:** Medium
- **User Story:** As a coach, I want every athlete's line-chart series to use a visually distinct, accessible colour, so that I can tell athletes apart in progression, comparison, and public statistics charts.

#### Acceptance Criteria (Given/When/Then)
1. **Given** a chart with multiple athlete series, **When** it renders, **Then** each athlete is assigned a distinct series colour from the shared `chartSeries` palette and design tokens, with a matching accessible legend.
2. **Given** a newly added athlete, **When** they appear in a chart, **Then** they receive the next distinct colour rather than duplicating an existing series colour.
3. **Given** the progression, comparison, and public statistics charts, **When** any of them renders, **Then** all three use the same unified colour scheme.

#### User Acceptance Tests (UAT)
- **UAT-002.1:** Render a progression chart with three athletes. Verify each series has a distinct colour and the legend matches each series.
- **UAT-002.2:** Add a fourth athlete and re-render. Verify the new series uses a distinct colour, not a duplicate of an existing one.
- **UAT-002.3:** Open the comparison page and the public statistics page for the same athletes. Verify series colours are consistent across both surfaces.

---

### US-003: AI Voice Command and Idle Sleep
- **Issue:** #236
- **Priority:** Medium
- **User Story:** As a coach, I want to control the voice assistant with an explicit command and to put it to sleep when idle, so that it stops listening when I no longer need hands-free input.

#### Acceptance Criteria (Given/When/Then)
1. **Given** an active voice-assistant session, **When** I speak the documented end/sleep instruction, **Then** the assistant ends the session and stops capturing microphone input.
2. **Given** an idle voice session with no speech for the configured idle window, **When** the timeout elapses, **Then** the assistant transitions to sleep without erroring.
3. **Given** the assistant is asleep, **When** I issue the wake command, **Then** a new session can start and athlete creation remains available.

#### User Acceptance Tests (UAT)
- **UAT-003.1:** Start a voice session, speak the sleep instruction. Verify the microphone indicator switches off and no further speech is transcribed.
- **UAT-003.2:** Leave a voice session idle past the idle window. Verify it sleeps gracefully without a crash or stuck listening state.
- **UAT-003.3:** After sleep, wake the assistant and create an athlete by voice. Verify the athlete appears in `GET /athletes` with the spoken name.

---

### US-004: Independent Club Publication Flags
- **Issue:** #237
- **Priority:** High
- **User Story:** As a coach, I want to choose independently whether my club publishes results and whether it publishes its schedule, so that I can share fixtures publicly without exposing athlete performance (or vice versa).

#### Acceptance Criteria (Given/When/Then)
1. **Given** I am a coach of the active club workspace, **When** I read `GET /api/v1/clubs/publication`, **Then** the response contains both `publicResultsEnabled` and `publicScheduleEnabled` booleans.
2. **Given** I submit `PUT /api/v1/clubs/publication` with both booleans, **When** the request is processed, **Then** the flags are replaced as a pair, and enabling one flag never changes the other.
3. **Given** a club with results published but schedule unpublished, **When** a visitor requests the public schedule endpoints, **Then** a non-enumerating `404 NOT_FOUND` is returned, while public statistics remain visible (and vice versa).
4. **Given** a non-coach member, **When** they attempt to update publication, **Then** the request is rejected with `403`.

#### User Acceptance Tests (UAT)
- **UAT-004.1:** Set `{ "publicResultsEnabled": true, "publicScheduleEnabled": false }`. Verify public statistics are visible and the public schedule returns `404 NOT_FOUND`.
- **UAT-004.2:** Set `{ "publicResultsEnabled": false, "publicScheduleEnabled": true }`. Verify the schedule is visible and public statistics return `404 NOT_FOUND`.
- **UAT-004.3:** Submit a publication update missing one flag. Verify validation rejection (`400 VALIDATION_ERROR`).
- **UAT-004.4:** Attempt a publication update as an assistant. Verify `403` and unchanged flags.

---

### US-005: Dashboard Personalisation and Saved Views
- **Issue:** #241
- **Priority:** Medium
- **User Story:** As a coach, I want to personalize which dashboard cards are visible and save named views (including season), so that my console shows only the information I care about.

#### Acceptance Criteria (Given/When/Then)
1. **Given** I am authenticated, **When** I request `GET /preferences`, **Then** my stored dashboard preferences (card order/visibility, saved views) are returned, defaulting to the standard layout when none exist.
2. **Given** my preferences, **When** I submit `PUT /preferences` reordering cards or hiding hideable cards, **Then** the layout persists and required cards remain visible.
3. **Given** a saved view with a season, **When** I apply it from the toolbar, **Then** the dashboard aggregates reflect that season's data.
4. **Given** stored preferences, **When** the dashboard loads, **Then** it hydrates without blocking the default layout if preferences are unavailable.

#### User Acceptance Tests (UAT)
- **UAT-005.1:** Hide an optional dashboard card via `PUT /preferences`, reload. Verify the card stays hidden and required cards remain visible.
- **UAT-005.2:** Reorder two cards, reload. Verify the new order persists.
- **UAT-005.3:** Save a named view for season `2026`, apply it. Verify dashboard aggregates reflect only 2026 data.

---

### US-006: Club Branding and Media
- **Issue:** #243
- **Priority:** Medium
- **User Story:** As a coach, I want to add my club's description, primary colour, logo, and cover image, so that public pages and the console present a recognizable club identity.

#### Acceptance Criteria (Given/When/Then)
1. **Given** I am a coach, **When** I upload a club logo and cover via the club branding endpoints, **Then** the media is stored and served through the media API, and `club.branding` (`description`, `primaryColor`, `logoUrl`, `coverUrl`) reflects the update.
2. **Given** a club with branding set, **When** public statistics or schedule pages render, **Then** the club badge/identity uses the stored branding, falling back to name initials when `logoUrl` is null.
3. **Given** an invalid upload (wrong type or oversized file), **When** submitted, **Then** the API rejects it with `400 VALIDATION_ERROR` without changing existing branding.
4. **Given** object storage is not configured, **When** an upload is attempted, **Then** the request fails gracefully without corrupting existing branding (media storage is deferred until the bucket is available).

#### User Acceptance Tests (UAT)
- **UAT-006.1:** Upload a valid logo image. Verify `logoUrl` is populated and the `ClubBadge` renders it on the console and public pages.
- **UAT-006.2:** Upload an invalid file type. Verify `400 VALIDATION_ERROR` and unchanged branding.
- **UAT-006.3:** View a club with no logo. Verify initials fallback renders instead of a broken image.

---

### US-007: Idempotent Offline Batch Sync
- **Issue:** #253
- **Priority:** High
- **User Story:** As a coach logging at a venue with poor connectivity, I want my queued offline actions to drain to the server exactly once when I reconnect, so that no race data is lost or duplicated.

#### Acceptance Criteria (Given/When/Then)
1. **Given** pending offline actions with client-generated UUID action IDs, **When** connectivity returns and `drainQueue` runs, **Then** actions are sent in creation order to `POST /api/v1/sync/batch` (chunked at 50 actions) with `deviceId`, `eventId`, `actionId`, payload, `expectedVersion`, and client timestamp.
2. **Given** a batch response with per-action receipts, **When** receipts are processed, **Then** accepted/duplicate actions are marked synced (storing the server receipt) and rejected actions are marked failed with their rejection code, without blocking accepted siblings.
3. **Given** a transport or HTTP failure during drain, **When** the failure occurs, **Then** all affected actions remain pending for the next reconnect, and re-sending never creates duplicates (server is idempotent by `actionId`).
4. **Given** a structurally invalid batch (non-canonical `actionId`, unknown action type, more than 50 actions), **When** submitted, **Then** the server rejects it with `400 VALIDATION_ERROR` before any write.

#### User Acceptance Tests (UAT)
- **UAT-007.1:** Go offline, queue three timeline entries, reconnect. Verify all three sync in order and appear in `GET /events/:eventId/entries`.
- **UAT-007.2:** Interrupt a sync mid-drain and retry. Verify no duplicate entries are created (idempotent by `actionId`).
- **UAT-007.3:** Queue one valid and one invalid action (e.g. for a completed event). Verify the valid action syncs while the invalid one is flagged failed with its rejection code.
- **UAT-007.4:** Submit a batch of 51 actions. Verify `400 VALIDATION_ERROR` before any write.

---

### US-008: Multi-Discipline Meet Foundation
- **Issue:** #244
- **Priority:** High
- **User Story:** As a coach, I want an event to act as a meet container with discipline sessions, entrants, and session-scoped results, so that one fixture can host many athletics disciplines while my existing 100m history stays untouched.

#### Acceptance Criteria (Given/When/Then)
1. **Given** migration `0028_multi_discipline_meet_foundation.sql` is applied, **When** I read the catalogue at `/api/v1/disciplines` or event-nested `/sessions` and `/entrants`, **Then** versioned immutable discipline definitions and session-scoped resources are available, and no historical 100m event, participant, timeline, or result row has been rewritten or backfilled.
2. **Given** a new performance target, **When** it is recorded, **Then** it references `{ disciplineSessionId, entrantId }` together beneath an `eventId`, with one result per session/entrant; legacy targets remain event/athlete/100m and are never inferred as sessions.
3. **Given** a session with its own `scheduled`/`in_progress`/`completed`/`cancelled` state and optimistic version, **When** logging is attempted, **Then** it succeeds only while both the event and the session are `in_progress`; parent completion stops logging and cancellation excludes results from statistics without deleting history.
4. **Given** entrants of type `athlete`, `guest`, or `relay`, **When** they are managed, **Then** athlete references must belong to the entrant workspace, guests are event-local names (not athlete rows), relay members are ordered entrants in the same event/workspace, and registrations can be withdrawn without deleting results.
5. **Given** recorded session performances, **When** definitions or relay membership are edited, **Then** changes underneath recorded performances are rejected, and all mutable changes record actor, timestamps, and before/after audit details.

#### User Acceptance Tests (UAT)
- **UAT-008.1:** Apply migration `0028` on a database populated through `0027`. Verify legacy 100m rows are unchanged and new catalogue/session tables exist.
- **UAT-008.2:** Create two independent sessions of the same discipline in one event. Verify entries/results in one session never leak into the other.
- **UAT-008.3:** Attempt to log to a session whose parent event is `completed`. Verify rejection and no write.
- **UAT-008.4:** Withdraw a session registration. Verify the entrant's prior results remain queryable.

---

### US-009: Timed Discipline Rules (Sprints, Distance, Hurdles, Steeplechase, Race Walk)
- **Issue:** #245
- **Priority:** High
- **User Story:** As a coach, I want timed disciplines (200m/400m, middle and long distance, hurdles, steeplechase, race walks) validated and derived in seconds, so that performances outside 100m are recorded with the correct contract instead of loosening the 100m rules.

#### Acceptance Criteria (Given/When/Then)
1. **Given** the timed catalogue (migration `0029`, `timedDerivation.ts`, `timedMeets.ts`), **When** a timed attempt is logged for a supported discipline, **Then** the value is validated as a positive time in seconds and derived per the discipline's rule (latest valid attempt for competition, fastest for training, unless discipline rules state otherwise).
2. **Given** a hurdles configuration, **When** the discipline definition is read, **Then** the canonical `hurdleCount` contract is enforced and invalid hurdle configurations are rejected.
3. **Given** incident types (`false_start`, `dq`, `dnf`, `dns`, `lane_infringement`), **When** processed for a timed session, **Then** `dq`/`dnf`/`dns` void the result (`final_result = NULL`) while penalties without voiding preserve the derived time.

#### User Acceptance Tests (UAT)
- **UAT-009.1:** Log a valid 400m attempt of `48.20` seconds. Verify HTTP `201` and correct derivation.
- **UAT-009.2:** Submit a hurdles session with an invalid hurdle count. Verify `400 VALIDATION_ERROR`.
- **UAT-009.3:** Record a `dq` incident for a timed entrant. Verify the derived outcome becomes `dq` with `final_result: null`.

---

### US-010: Horizontal Jumps and Throws Rules
- **Issue:** #246
- **Priority:** High
- **User Story:** As a coach, I want horizontal jumps (long jump, triple jump) and throws (shot put, discus, javelin, hammer) recorded in metres with foul/pass handling, so that each attempt is judged and the best legal mark becomes the result.

#### Acceptance Criteria (Given/When/Then)
1. **Given** the measured catalogue (migration `0030`, `measuredDerivation.ts`), **When** a jump or throw attempt is logged, **Then** the value is validated as a distance in metres to two decimal places, and the result is the best valid (non-foul) attempt.
2. **Given** an attempt marked foul, **When** derivation runs, **Then** the foul attempt is excluded from the best-mark calculation but retained in history; a pass records no mark for that round.
3. **Given** an entrant with no valid attempt, **When** results are derived, **Then** the outcome is `no_result` rather than zero metres.

#### User Acceptance Tests (UAT)
- **UAT-010.1:** Log long jump attempts `7.20m`, foul, `7.45m`. Verify the derived result is `7.45`.
- **UAT-010.2:** Log only foul attempts for a shot put entrant. Verify outcome `no_result`, not `0.00`.
- **UAT-010.3:** Submit a negative distance. Verify `400 VALIDATION_ERROR`.

---

### US-011: High Jump and Pole Vault Rules
- **Issue:** #247
- **Priority:** High
- **User Story:** As a coach, I want high jump and pole vault sessions to enforce height progression, elimination, and countback, so that vertical results and ties follow athletics rules.

#### Acceptance Criteria (Given/When/Then)
1. **Given** a vertical session (migration `0031`, `verticalScoring.ts`), **When** entries are logged in metres (two decimals), **Then** each entry records target height, server-assigned order, and state (`O` clearance, `X` failure, `–` pass, void annulled); heights never decrease and clearing closes the height and resets consecutive failures.
2. **Given** three consecutive failures (or the configured limit), **When** the third failure is recorded, **Then** the entrant is eliminated, including across multiple heights; voids never count as failures or clearances.
3. **Given** completed vertical results, **When** placings are assigned, **Then** ties are resolved by countback (highest clearance, fewest failures at that height, fewest failures up to and including it; shared place uses competition ranking `1, 1, 3`), and PB/SB compare height only within the same discipline.
4. **Given** an entrant with no clearance, **When** results are derived, **Then** the outcome is `no_result` (displayed NH), never zero; `DQ`/`DNS` invalidate the result while a cleared athlete who stops retains that clearance (`DNF` is not used).

#### User Acceptance Tests (UAT)
- **UAT-011.1:** Log clearances at `1.70m` and `1.75m` with a failure pattern. Verify the result is `1.75` and failures are counted correctly.
- **UAT-011.2:** Record three consecutive failures across two heights. Verify the entrant is eliminated.
- **UAT-011.3:** Create a tie on height with different failure counts. Verify countback assigns the correct places (`1, 1, 3` on a shared place).
- **UAT-011.4:** Verify an entrant with only failures shows NH (`no_result`), not `0.00`.

---

### US-012: Relay Team Support
- **Issue:** #249
- **Priority:** High
- **User Story:** As a coach, I want to create 4x100m and 4x400m relay teams with ordered members, so that relay squads can be entered, logged, and ranked as teams.

#### Acceptance Criteria (Given/When/Then)
1. **Given** the relay catalogue (migration `0034`, seeded `4x100m` and `4x400m`), **When** I create a relay entrant with ordered individual members in the same event/workspace, **Then** the team is stored with its member order and heats/finals remain independent sessions.
2. **Given** a relay roster, **When** I rename the team or rewrite member order via coach-only `PATCH` while the meet is still `scheduled` and no session timeline entry exists, **Then** the change succeeds; otherwise it is rejected with `ROSTER_LOCKED`.
3. **Given** relay session results, **When** they are exposed publicly, **Then** only ordered safe member summaries are shown, never raw member IDs.

#### User Acceptance Tests (UAT)
- **UAT-012.1:** Create a `4x100m` relay team with four ordered members. Verify the team and order persist.
- **UAT-012.2:** Reorder relay members while `scheduled` with no entries. Verify success; then log an entry and attempt another reorder. Verify `ROSTER_LOCKED`.
- **UAT-012.3:** View relay results publicly. Verify member names appear as safe summaries without raw IDs.

---

### US-013: Athlete Preferred Disciplines and Season Goals
- **Issue:** #242
- **Priority:** Medium
- **User Story:** As a coach, I want to record each athlete's preferred disciplines and season goals, so that training groups and selection reflect what each athlete is actually targeting.

#### Acceptance Criteria (Given/When/Then)
1. **Given** the athlete form (`AthleteForm`), **When** I submit preferred disciplines and season goals (migration `0032`), **Then** they are validated and stored on the athlete record.
2. **Given** athletes with disciplines set, **When** I view the roster (`AthletesPage`), **Then** I can group or filter athletes by discipline.
3. **Given** an athlete detail view (`AthleteDetailPage`), **When** it renders, **Then** preferred disciplines and season goals are displayed alongside existing profile fields.

#### User Acceptance Tests (UAT)
- **UAT-013.1:** Set an athlete's preferred disciplines to `200m` and `Long Jump` with a season goal. Verify persistence across reload.
- **UAT-013.2:** Filter the roster by discipline. Verify only matching athletes are listed.
- **UAT-013.3:** Submit an invalid discipline code. Verify `400 VALIDATION_ERROR` and unchanged record.

---

### US-014: Session Rosters and Guest Entrants
- **Issue:** #248
- **Priority:** High
- **User Story:** As a coach hosting a meet, I want to register my athletes (and guest entrants from invited clubs) into specific discipline sessions, so that each session starts with the correct start list.

#### Acceptance Criteria (Given/When/Then)
1. **Given** a meet session, **When** the host registers entrants (migration `0033` guest details), **Then** each registration binds the same event, session, entrant, and participating workspace, and the session roster lists all registered entrants across attending teams.
2. **Given** an accepted fixture guest, **When** they manage entrants, **Then** they can access only their own entrants while host reads use safe entrant summaries.
3. **Given** a session registration, **When** it is withdrawn, **Then** only the registration is removed while existing session entries and results for that entrant remain intact.
4. **Given** the meet logger, **When** an unregistered entrant attempts to log, **Then** the entry is rejected until a coach registers them for that session.

#### User Acceptance Tests (UAT)
- **UAT-014.1:** Register two host athletes and one guest entrant into a 200m session. Verify all three appear on the session roster.
- **UAT-014.2:** As a guest club, attempt to read another club's entrant details. Verify denial (non-enumerating `404`).
- **UAT-014.3:** Withdraw a registration after entries exist. Verify entries and results remain queryable.
- **UAT-014.4:** Attempt to log for an unregistered entrant. Verify rejection before registration and success after.

---

### US-015: Public Club Schedule Pages
- **Issue:** #238
- **Priority:** Medium
- **User Story:** As a visitor, I want to browse published club schedules without an account, so that I can see upcoming meets and venues for clubs that chose to share them.

#### Acceptance Criteria (Given/When/Then)
1. **Given** clubs with `publicScheduleEnabled = true`, **When** I request `GET /api/v1/public/schedule/clubs?q={name}`, **Then** up to 100 matching published clubs are returned; unpublished clubs never appear.
2. **Given** a published club, **When** I request `GET /api/v1/public/schedule/clubs/{clubId}`, **Then** upcoming events (`date >= today`, status `scheduled` or `in_progress`) are returned ordered by date/time, each with title, date, time, type, discipline(s), venue, and status — never rosters, participants, results, timeline entries, injuries, or notes.
3. **Given** an unknown or unpublished club, **When** its schedule URL is visited, **Then** a non-enumerating `404 NOT_FOUND` is returned.
4. **Given** a multi-discipline meet, **When** its schedule entry renders, **Then** the `disciplines` array lists distinct non-cancelled session disciplines (falling back to the legacy `discipline` scalar when no sessions exist).

#### User Acceptance Tests (UAT)
- **UAT-015.1:** Publish a schedule with two upcoming events. Visit the public schedule page without logging in. Verify both events render with venue and status.
- **UAT-015.2:** Unpublish the schedule, revisit the same URL. Verify `404 NOT_FOUND`.
- **UAT-015.3:** Search clubs by name. Verify only published clubs match and unpublished clubs are excluded.
- **UAT-015.4:** Verify completed and cancelled events never appear in the public schedule.

---

### US-016: Offline Logger Recovery Surface
- **Issue:** #252
- **Priority:** Medium
- **User Story:** As a coach returning online with queued entries, I want a clear recovery surface showing connection state, queued actions, and per-action retry, so that I know exactly what synced and what still needs attention.

#### Acceptance Criteria (Given/When/Then)
1. **Given** the live logger or public logger with queued actions, **When** the `OfflineRecoverySurface` renders, **Then** it shows connection state, cache freshness, designated-logger status (authenticated), last local sync, and each local action with type, target session, entrant/athlete, device ID, creation time, receipt time, and server error where present.
2. **Given** queued data, **When** it is displayed, **Then** it is explicitly labelled local-only until the server accepts it, kept visually distinct from refreshed server data.
3. **Given** a failed action with a server rejection code, **When** I reset it to pending and retry, **Then** it re-enters the normal idempotent sync path without a page reload.
4. **Given** the recovery surface, **When** it renders, **Then** it remains responsive and keyboard-accessible with refresh and sync-now controls.

#### User Acceptance Tests (UAT)
- **UAT-016.1:** Queue two entries offline. Verify the surface shows `2` pending with correct session/entrant labels and creation times.
- **UAT-016.2:** Reconnect and sync one entry. Verify it moves to synced with receipt time while the other stays pending.
- **UAT-016.3:** Fail an action (e.g. validation), reset to pending, retry. Verify it re-syncs without reload.
- **UAT-016.4:** Operate the surface by keyboard only. Verify all controls (refresh, sync-now, retry) are reachable and labelled.

---

### US-017: Official Result Finalization and Automatic Places
- **Issue:** #250
- **Priority:** High
- **User Story:** As a coach, I want to select the official entry when multiple observations were logged and have places assigned automatically, so that published results resolve ambiguity deterministically.

#### Acceptance Criteria (Given/When/Then)
1. **Given** a timed session with multiple logged observations, **When** I select the official entry (`session_results.selected_entry_id`), **Then** ranking and statistics use the selected entry while all source observations are preserved for audit.
2. **Given** finalized session results, **When** places are assigned, **Then** timed disciplines rank fastest-first, measured disciplines rank by best legal mark (highest distance/height) with the applicable tie rules, and only `completed` sessions contribute to statistics; cancelled sessions are excluded without deleting history.
3. **Given** a training session, **When** results finalize, **Then** places remain `null` (training does not assign placings) while PB/SB still derive from valid marks.
4. **Given** a session with void outcomes (`dq`/`dnf`/`dns`) or `no_result`, **When** places are assigned, **Then** void and empty results receive no placing and trigger no PB/SB.

#### User Acceptance Tests (UAT)
- **UAT-017.1:** Log two times (`10.50s`, `10.20s`) for one entrant, select `10.20s` as official. Verify ranking/statistics use `10.20` and both observations remain visible.
- **UAT-017.2:** Finalize a competition long jump session with marks `7.20m`, `7.45m`, foul. Verify places `1st: 7.45`, `2nd: 7.20`, foul unplaced.
- **UAT-017.3:** Finalize a training session. Verify all places are `null`.
- **UAT-017.4:** Finalize a session where one entrant is `dq`. Verify the `dq` entrant is unplaced with no PB/SB while valid entrants place normally.

---

### US-018: Public Athlete Leaderboards and Club Standings
- **Issue:** #240
- **Priority:** Medium
- **User Story:** As a visitor, I want to view public athlete leaderboards and club standings without an account, so that I can compare competitiveness across published clubs.

#### Acceptance Criteria (Given/When/Then)
1. **Given** a club with `publicResultsEnabled = true`, **When** I visit its public leaderboard, **Then** ranked athlete performances are shown, filtered by discipline and season where requested, sourced from legacy 100m and finalized session results only (unfinalized sessions excluded).
2. **Given** completed shared fixtures, **When** club standings render, **Then** clubs are scored with `5/3/1` points and ordered descending, with season filtering applied.
3. **Given** a club that has not enabled results publication, **When** its leaderboard URL is visited, **Then** `404 NOT_FOUND` is returned without authentication prompts leaking data.

#### User Acceptance Tests (UAT)
- **UAT-018.1:** Publish results with three athletes holding valid finalized marks. Verify the leaderboard ranks them correctly by discipline.
- **UAT-018.2:** Request the leaderboard with `?year=2026`. Verify only 2026-season marks are ranked.
- **UAT-018.3:** Visit the leaderboard for an unpublished club. Verify `404 NOT_FOUND` with no login prompt.
- **UAT-018.4:** Complete a shared fixture. Verify club standings award `5/3/1` points to the top three clubs.

---

### US-019: Public Statistics Reports and Export
- **Issue:** #239
- **Priority:** Medium
- **User Story:** As a visitor, I want to view detailed public statistics reports and export them (PDF/CSV) via a shareable link, so that I can download and share club performance without an account.

#### Acceptance Criteria (Given/When/Then)
1. **Given** a published club, **When** I open its public statistics report page, **Then** detailed finalized performances render live without authentication, backed by the public statistics report API.
2. **Given** a rendered report, **When** I choose PDF or CSV export, **Then** the file downloads with the same filtered data shown on screen (discipline, season, search filters preserved).
3. **Given** the landing page export control, **When** I configure filters and export, **Then** a shareable link is produced that reproduces the same report view for anyone opening it.
4. **Given** an unpublished club, **When** its report URL or share link is opened, **Then** `404 NOT_FOUND` is returned and no export is generated.

#### User Acceptance Tests (UAT)
- **UAT-019.1:** Open a published club's report without logging in. Verify finalized performances render.
- **UAT-019.2:** Apply a season filter, export CSV. Verify the file contains only the filtered rows.
- **UAT-019.3:** Copy the share link, open it in a private window. Verify the identical report view loads.
- **UAT-019.4:** Open a report link for an unpublished club. Verify `404 NOT_FOUND` and no file downloads.

---

### US-020: Multi-Discipline Public Meet Logging
- **Issue:** #251
- **Priority:** Medium
- **User Story:** As a field official with a public logging link, I want to log entries for any discipline session in the meet without a full account, so that results flow in from every station.

#### Acceptance Criteria (Given/When/Then)
1. **Given** a valid public logger session token for an `in_progress` meet, **When** I open the public meet logger, **Then** every discipline session renders with its catalogue rules, entrants, entries, and results, and I can log for any registered entrant.
2. **Given** a public sync batch, **When** it is submitted to `POST /api/v1/public/logger/sync/batch`, **Then** each action carries the complete target `(eventId, disciplineSessionId, entrantId)`; legacy actions omit the target, and any mixed batch is rejected before processing.
3. **Given** a public session token, **When** entries are edited, **Then** only entries created under that same session token can be edited (last-write-wins with audit logging), and logging for non-`in_progress` sessions is rejected with `409 EVENT_NOT_IN_PROGRESS`.
4. **Given** an expired or revoked public link, **When** the browser next learns of invalidation on reconnect, **Then** the token-scoped local database is purged and no further offline queueing occurs under that token.

#### User Acceptance Tests (UAT)
- **UAT-020.1:** Open a public meet link for an `in_progress` meet with 200m and long jump sessions. Verify both sessions render and accept entries.
- **UAT-020.2:** Submit a public entry for a `completed` session. Verify `409 EVENT_NOT_IN_PROGRESS`.
- **UAT-020.3:** Go offline on the public logger, queue entries for two sessions, reconnect. Verify both drain to the correct sessions without mixing.
- **UAT-020.4:** Attempt to edit another token's entry. Verify rejection and unchanged data.

---

### US-021: Multi-Device Offline Conflict Reconciliation
- **Issue:** #254
- **Priority:** Medium
- **User Story:** As a coach reviewing a meet logged from multiple devices, I want conflicting offline edits surfaced with their evidence and resolvable with a reason, so that every device converges on the same final result without silently losing observations.

#### Acceptance Criteria (Given/When/Then)
1. **Given** concurrent creates from different devices for the same session, **When** batches sync (migration `0036`, `offlineResolution.ts`), **Then** both observations are kept (append-only) and never discarded as conflicts.
2. **Given** concurrent edits to the same entry, **When** they sync, **Then** stale authenticated edits are rejected with `VERSION_CONFLICT` while public edits resolve last-write-wins — both retaining immutable conflict evidence (device, actor/session, action ID, attempted payload, expected/canonical version, source timestamps).
3. **Given** a session with conflicts, **When** I read `GET /api/v1/events/:eventId/sessions/:sessionId/resolution`, **Then** session-scoped conflicts and audit history are returned; I acknowledge each via `POST …/conflicts/:conflictId/resolve` with a reason, then use the normal official-entry selection.
4. **Given** unresolved offline conflicts, **When** finalization is attempted, **Then** it is blocked until every conflict is resolved, preserving existing result rules as the sole finalization authority.

#### User Acceptance Tests (UAT)
- **UAT-021.1:** Log new entries for the same session from two offline devices, reconnect in either order. Verify both entries exist and the final state is identical regardless of order.
- **UAT-021.2:** Edit the same entry from two devices with stale versions. Verify the stale authenticated edit returns `VERSION_CONFLICT` and conflict evidence is recorded.
- **UAT-021.3:** Attempt to finalize a session with an unresolved conflict. Verify the finalization is blocked; resolve with a reason, then verify finalization succeeds.
- **UAT-021.4:** Re-send an already-acknowledged batch. Verify idempotent duplicate receipts with no new rows.

---

## AI Usage Declaration

This document was generated and refined with the assistance of AI tools:
- **Code Generation & Documentation Synthesis:** `opencode[muse-spark]`
- **In-line Review & Structuring:** `opencode[muse-spark]`
- **Club Accent-Colour Removal:** `OpenCode[openai/gpt-5.6-terra]`
