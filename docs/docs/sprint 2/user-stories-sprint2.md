---
sidebar_position: 3
---

# Sprint 2 User Stories & Acceptance Criteria

This document defines the user stories, acceptance criteria, and User Acceptance Tests (UATs) for **Athlora** Sprint 2. It builds on the foundation established in Sprint 1 and introduces the results API, transactional recomputation, athlete statistics, cross-club fixtures, notifications, injury tracking, weather integration, and an AI voice assistant.

---

## Summary of User Stories

| ID | Title | Priority | Target Component / Module |
|---|---|---|---|
| **US-001** | Event Results Retrieval via API | High | Results API (`/events/:eventId/results`) |
| **US-002** | Transactional Event-Level Result Recomputation | High | `resultRecomputation.ts`, Event Lifecycle |
| **US-003** | Transactional Per-Athlete Result Recomputation on Timeline Mutations | High | `timeline.ts`, `resultRecomputation.ts` |
| **US-004** | Dashboard Summary API | High | Dashboard API (`/dashboard/summary`), `DashboardPage` |
| **US-005** | Athlete Statistics & Progression API | High | Statistics API (`/athletes/:id/statistics`, `/athletes/:id/progression`) |
| **US-006** | Two-Athlete Performance Comparison | High | Comparison API, `ComparisonPage` |
| **US-007** | Live Weather Integration for Events | Medium | Weather API (`/weather/current`), `EventsPage` |
| **US-008** | Venue Search | Medium | Venue API (`/venues/search`), Event Form |
| **US-009** | Squad Management | Medium | Squads API (`/squads`), Athlete Roster |
| **US-010** | Cross-Club Fixture Invitations | High | Fixtures API (`/fixtures`), `FixturesPage` |
| **US-011** | Fixture Notifications | Medium | Notifications API (`/notifications`), `FixtureNotifications` |
| **US-012** | Event Reminders | Medium | Reminders API (`/reminders`) |
| **US-013** | Athlete Injury Tracking | Medium | Injuries API (`/athletes/:id/injuries`), `FitnessView` |
| **US-014** | Club Management & Onboarding | High | Clubs API (`/clubs`), `ClubOnboarding` |
| **US-015** | Shared Workspaces & Multi-Tenancy | High | Workspaces API (`/workspaces`), `WorkspaceProvider` |
| **US-016** | AI Voice Assistant for Athlete Creation | Medium | AI API (`/ai/gemini-token`), Gemini Live |
| **US-017** | Public Event QR Logger | Medium | Public Logger API (`/public/logger`), `PublicLoggerPage` |
| **US-018** | Public Club Statistics Landing | Low | Public Statistics API (`/public/statistics`), `PublicStatsPage` |
| **US-019** | Event Helper Invitations & Temporary Assistants | Medium | Event Helpers API, Rate-Limited Redemption |
| **US-020** | Real-Time Event Updates via WebSocket | Medium | `realtime/` Socket.IO broadcasting |
| **US-021** | Privacy Policy, Terms & Consent Gate | High | Auth Consent Endpoint, `ConsentGate` |
| **US-022** | Landing Page Redesign | Medium | `LandingPage`, Cinematic 3D Track Hero |
| **US-023** | Coach Console Redesign | Medium | `CoachConsole`, Premium Aurora Theme |
| **US-024** | Season Filters for Results & Comparisons | Medium | Season query params, Filter UI |
| **US-025** | Offline Event Logging with Background Sync | Medium | Offline Queue, `OfflineIndicator`, PWA |

---

## Detailed User Stories

### US-001: Event Results Retrieval via API
- **Priority:** High
- **User Story:** As a coach, I want to retrieve the computed results for a specific event via a dedicated API endpoint, so that I can view each athlete's outcome, final time, placing, PB/SB flags, and any manual overrides in a structured format.

#### Acceptance Criteria (Given/When/Then)
1. **Given** an event with derived results, **When** I request `GET /events/:eventId/results`, **Then** the API returns a list of all result rows for that event, each containing `outcome`, `finalResult`, `unit`, `placing`, `isPb`, `isSb`, and manual override fields.
2. **Given** an event where no timeline entries have been logged, **When** I request results, **Then** an empty list is returned with `count: 0`.
3. **Given** a result with a manual override applied, **When** the result is retrieved, **Then** the `manualOverride`, `overrideReason`, `overriddenBy`, and `overrideAt` fields reflect the override audit trail.

#### User Acceptance Tests (UAT)
- **UAT-001.1:** Log timeline entries for two athletes in an event, then call `GET /events/:eventId/results`. Verify both result rows are returned with correct `outcome`, `finalResult`, and `placing` values.
- **UAT-001.2:** Request results for an event with no logged entries. Verify the response is an empty list with `meta.count` of `0`.
- **UAT-001.3:** Apply a manual override to an athlete's result, then retrieve results via the endpoint. Verify `manualOverride`, `overrideReason`, `overriddenBy`, and `overrideAt` are populated correctly.

---

### US-002: Transactional Event-Level Result Recomputation
- **Priority:** High
- **User Story:** As a coach, I want event results to be automatically and atomically recomputed whenever I update an event's type, date, time, or status, so that derived placings, PB/SB flags, and outcome values always remain consistent with the current event configuration.

#### Acceptance Criteria (Given/When/Then)
1. **Given** an event with existing results, **When** I update the event type (e.g. from `training` to `competition`) via `PUT /events/:id`, **Then** all results for that event are recomputed within the same transaction — placings are assigned for competition events and cleared for training events.
2. **Given** an event with existing results, **When** I cancel the event (`DELETE /events/:id`), **Then** all result placings are set to `null` and PB/SB flags are recalculated across affected athletes' histories within the same transaction.
3. **Given** an event update that changes the event date, **When** results are recomputed, **Then** PB/SB comparisons use the new event date against the athlete's historical results.

#### User Acceptance Tests (UAT)
- **UAT-002.1:** Create a training event, log timeline entries, then update the event type to `competition`. Verify that placings are assigned to all valid results after the update.
- **UAT-002.2:** Create a competition event with results and placings, then cancel the event. Verify all placings are set to `null` and PB/SB flags are recalculated.
- **UAT-002.3:** Create an event with a future date, log results (setting a PB), then update the event date to a past date. Verify PB/SB flags are recomputed using the new date against historical records.

---

### US-003: Transactional Per-Athlete Result Recomputation on Timeline Mutations
- **Priority:** High
- **User Story:** As a coach, I want each timeline entry creation, correction, or undo to trigger an atomic recomputation of that athlete's result — including re-deriving the outcome, recalculating event-wide placings, and updating PB/SB flags — so that results are always immediately consistent with the latest timeline data.

#### Acceptance Criteria (Given/When/Then)
1. **Given** an `in_progress` competition event, **When** I create a new timeline entry for an athlete (`POST /events/:eventId/entries`), **Then** the athlete's result is recomputed: the outcome and final time are re-derived, placings across all athletes in the event are recalculated, and PB/SB flags are updated — all within a single transaction.
2. **Given** an existing timeline entry, **When** I correct it via `PATCH` with the correct `expectedVersion`, **Then** the athlete's result and event-wide placings are atomically recomputed to reflect the corrected value.
3. **Given** a timeline entry that has been soft-deleted (undone), **When** the undo is processed, **Then** the athlete's result is recomputed excluding the deleted entry, and event-wide placings and PB/SB flags are updated atomically.
4. **Given** a training event, **When** timeline entries are created or modified, **Then** result placings are set to `null` for all athletes in the event (training events do not assign placings).

#### User Acceptance Tests (UAT)
- **UAT-003.1:** In a competition event with two athletes who have existing results, log a new faster attempt for one athlete. Verify that the athlete's result is updated, placings are recalculated for all athletes, and PB/SB flags reflect the new time.
- **UAT-003.2:** Correct a timeline entry to a slower time using `PATCH` with the correct `expectedVersion`. Verify that the result and all athlete placings in the event are updated accordingly.
- **UAT-003.3:** Undo (soft-delete) a timeline entry that was the basis of an athlete's result. Verify the result reverts to the next-best entry (or `no_result`), placings are recalculated, and PB/SB flags are updated.
- **UAT-003.4:** In a training event, create a timeline entry and verify the result is derived but all placings in the event are `null`.

---

### US-004: Dashboard Summary API
- **Priority:** High
- **User Story:** As a coach, I want a live dashboard summary endpoint that returns aggregate season metrics — active athlete count, upcoming events, season PBs, and a roster snapshot — so that the console dashboard displays real data instead of hardcoded fixtures.

#### Acceptance Criteria (Given/When/Then)
1. **Given** I am authenticated, **When** I request `GET /dashboard/summary`, **Then** the API returns `athletesCount`, `activeAthletesCount`, `upcomingEventCount`, `seasonPbs`, `rosterSnapshot`, and `upcomingEvents`.
2. **Given** a season year query parameter `?year=2026`, **When** I request the dashboard summary, **Then** only results and events from that season are included in the aggregates.
3. **Given** a workspace with no athletes or events, **When** I request the dashboard summary, **Then** all counts are `0` and snapshot arrays are empty.

#### User Acceptance Tests (UAT)
- **UAT-004.1:** Create three athletes and two upcoming events, then call `GET /dashboard/summary`. Verify `athletesCount` is `3` and `upcomingEventCount` is `2`.
- **UAT-004.2:** Archive one athlete and call `GET /dashboard/summary`. Verify `activeAthletesCount` is `2` while `athletesCount` remains `3`.
- **UAT-004.3:** Call `GET /dashboard/summary?year=2026` and verify only season-relevant PBs and events are counted.

---

### US-005: Athlete Statistics & Progression API
- **Priority:** High
- **User Story:** As a coach, I want to view per-athlete performance statistics (PB, SB, results count, latest result) and a time-series progression of their 100m results, so that I can track individual athlete development over the season.

#### Acceptance Criteria (Given/When/Then)
1. **Given** an athlete with multiple competition results, **When** I request `GET /athletes/:id/statistics`, **Then** the response contains `pb`, `sb`, `resultsCount`, `latestResult`, `latestOutcome`, and `unit` for the 100m discipline.
2. **Given** an athlete with results across multiple events, **When** I request `GET /athletes/:id/progression`, **Then** the response returns a time-series array of results ordered by event date, each containing `date`, `value`, `outcome`, and `eventTitle`.
3. **Given** a season year query parameter, **When** I request statistics or progression, **Then** only results from that season are included.

#### User Acceptance Tests (UAT)
- **UAT-005.1:** Create an athlete, log two competition attempts (`10.50s`, `10.30s`), then call `GET /athletes/:id/statistics`. Verify `pb` is `10.30`, `resultsCount` is `2`, and `latestResult` is `10.30`.
- **UAT-005.2:** Call `GET /athletes/:id/progression` and verify the results array is ordered by event date ascending.
- **UAT-005.3:** Call `GET /athletes/:id/statistics?year=2025` for an athlete whose PB was set in 2026. Verify the response reflects only 2025 season data.

---

### US-006: Two-Athlete Performance Comparison
- **Priority:** High
- **User Story:** As a coach, I want to compare two athletes side by side — their PBs, SBs, recent form, and head-to-head results in shared events — so that I can make informed selection decisions.

#### Acceptance Criteria (Given/When/Then)
1. **Given** two athletes with competition results, **When** I request `GET /athletes/comparison?athlete1Id=X&athlete2Id=Y`, **Then** the response contains both athletes' PB, SB, recent results, and any head-to-head outcomes from events they both participated in.
2. **Given** a `scope=cross-club` parameter, **When** I request the comparison, **Then** athletes from different workspaces are compared using their globally-derived results.
3. **Given** a `year` parameter, **When** I request the comparison, **Then** only results from that season are included.

#### User Acceptance Tests (UAT)
- **UAT-006.1:** Create two athletes in the same event with different times (`10.20s` vs `10.45s`), then compare them. Verify the faster athlete's PB is shown as `10.20` and the head-to-head result reflects the event outcome.
- **UAT-006.2:** Compare two athletes where one has no results. Verify the comparison returns `null` or empty stats for the athlete with no data without erroring.
- **UAT-006.3:** Compare two athletes with `year=2026` and verify only season results are included in PB/SB fields.

---

### US-007: Live Weather Integration for Events
- **Priority:** Medium
- **User Story:** As a coach, I want to check the current weather conditions at an event's location (latitude/longitude) so that I can make informed decisions about outdoor training and competition scheduling.

#### Acceptance Criteria (Given/When/Then)
1. **Given** valid latitude and longitude coordinates, **When** I request `GET /weather/current?latitude=-26.2&longitude=28.0`, **Then** the API returns current temperature, weather condition, humidity, and wind data.
2. **Given** invalid coordinates (e.g. latitude `95.0`), **When** I request the weather endpoint, **Then** the API rejects the request with `400 VALIDATION_ERROR`.
3. **Given** the weather service is unavailable, **When** I request weather data, **Then** the API returns a structured error without crashing.

#### User Acceptance Tests (UAT)
- **UAT-007.1:** Request weather for Johannesburg coordinates (`-26.2, 28.0`). Verify a valid response with temperature and condition fields is returned.
- **UAT-007.2:** Request weather with latitude `91.0`. Verify validation error `400 VALIDATION_ERROR`.
- **UAT-007.3:** Request weather for coordinates `0.0, 0.0`. Verify the API responds without a 500 error (graceful handling of ocean coordinates).

---

### US-008: Venue Search
- **Priority:** Medium
- **User Story:** As a coach, I want to search for venues by name or location when creating or editing an event, so that I can quickly find and select a location without manually entering coordinates.

#### Acceptance Criteria (Given/When/Then)
1. **Given** a search query string, **When** I request `GET /venues?q=Ellis Park`, **Then** the API returns a list of matching venues with `name`, `latitude`, `longitude`, and `address` fields.
2. **Given** an empty search query, **When** I request the venue endpoint, **Then** the API returns an empty list with `count: 0`.
3. **Given** a search that returns many results, **When** the response is returned, **Then** results are limited to a reasonable number (e.g. top 10 matches).

#### User Acceptance Tests (UAT)
- **UAT-008.1:** Search for `Ellis Park` and verify at least one venue result is returned with name, latitude, and longitude.
- **UAT-008.2:** Search with an empty query string. Verify the response is `{ data: [], meta: { count: 0 } }`.
- **UAT-008.3:** Search for `xyznonexistent123`. Verify the response is an empty list without error.

---

### US-009: Squad Management
- **Priority:** Medium
- **User Story:** As a coach, I want to create, rename, archive, and restore squads (training groups) so that I can organise my athletes into meaningful groups beyond a free-text squad field.

#### Acceptance Criteria (Given/When/Then)
1. **Given** I am authenticated, **When** I create a squad via `POST /squads` with a `name`, **Then** the squad is returned with a generated `id` and the provided `name`.
2. **Given** existing squads, **When** I request `GET /squads`, **Then** all active squads are returned. If `includeArchived=true`, archived squads are also included.
3. **Given** an active squad, **When** I archive it via `DELETE /squads/:id`, **Then** the squad is marked as archived and excluded from the default list.
4. **Given** an archived squad, **When** I restore it via `POST /squads/:id/unarchive`, **Then** the squad returns to active status.

#### User Acceptance Tests (UAT)
- **UAT-009.1:** Create a squad named `Sprints`. Verify HTTP `201` and the squad appears in `GET /squads`.
- **UAT-009.2:** Create two squads, archive one, then request `GET /squads`. Verify only the active squad is returned.
- **UAT-009.3:** Request `GET /squads?includeArchived=true`. Verify both squads (active and archived) are returned.
- **UAT-009.4:** Archive a squad, then restore it via `POST /squads/:id/unarchive`. Verify it appears in the default squad list again.

---

### US-010: Cross-Club Fixture Invitations
- **Priority:** High
- **User Story:** As a coach, I want to invite athletes from other clubs to participate in my events (fixtures), manage their RSVPs, and track cross-club participation, so that inter-club competitions are coordinated within the platform.

#### Acceptance Criteria (Given/When/Then)
1. **Given** I have an upcoming event, **When** I create a fixture invitation via `POST /fixtures`, **Then** an invitation record is created with status `pending` and a unique invitation token.
2. **Given** a pending fixture invitation, **When** the invited club accepts via `POST /fixtures/invitations/:token/accept`, **Then** their athletes are added as participants and the invitation status updates to `accepted`.
3. **Given** a fixture invitation, **When** the invited club declines, **Then** the invitation status updates to `declined` and no participants are added.
4. **Given** a fixture I have sent, **When** I revoke it, **Then** the invitation is cancelled and any accepted participants are removed.

#### User Acceptance Tests (UAT)
- **UAT-010.1:** Create a fixture invitation for an event. Verify HTTP `201` and the invitation appears in `GET /fixtures` with status `pending`.
- **UAT-010.2:** Accept a fixture invitation using the invitation token. Verify the invitation status changes to `accepted` and participating athletes appear in the event's participant list.
- **UAT-010.3:** Decline a fixture invitation. Verify status changes to `declined` and no athletes are added to the event.
- **UAT-010.4:** Revoke an accepted fixture invitation. Verify the invitation is cancelled and athletes are removed from the event.

---

### US-011: Fixture Notifications
- **Priority:** Medium
- **User Story:** As a coach, I want to receive notifications when fixture invitations are sent, accepted, declined, or revoked, and to manage these notifications (mark read, star, delete), so that I stay informed about cross-club event activity.

#### Acceptance Criteria (Given/When/Then)
1. **Given** a fixture invitation activity (sent, accepted, declined, revoked), **When** the event occurs, **Then** a notification record is created for the affected workspace members.
2. **Given** I have unread notifications, **When** I request `GET /notifications`, **Then** all notifications are returned ordered by creation time, with an `unread` flag.
3. **Given** an unread notification, **When** I mark it as read via `PATCH /notifications/:id/read`, **Then** the `unread` flag becomes `false`.
4. **Given** a notification, **When** I star or unstar it via `PATCH /notifications/:id/star`, **Then** the `starred` flag toggles.
5. **Given** a notification, **When** I delete it via `DELETE /notifications/:id`, **Then** the notification is removed from the list.

#### User Acceptance Tests (UAT)
- **UAT-011.1:** Send a fixture invitation to another club. Verify a notification is created for the recipient workspace.
- **UAT-011.2:** Mark a notification as read. Verify `GET /notifications` returns it with `unread: false`.
- **UAT-011.3:** Star a notification, then unstar it. Verify the `starred` flag toggles correctly.
- **UAT-011.4:** Delete a notification and verify it no longer appears in `GET /notifications`.

---

### US-012: Event Reminders
- **Priority:** Medium
- **User Story:** As a coach, I want to set reminders for upcoming events and receive a notification when the reminder fires, so that I never miss an important competition or training session.

#### Acceptance Criteria (Given/When/Then)
1. **Given** I have set event reminders, **When** I request `GET /reminders`, **Then** all reminders are returned with `unread` status.
2. **Given** an unread reminder, **When** I mark it as read via `PATCH /reminders/:id/read`, **Then** the `unread` flag becomes `false`.
3. **Given** I have multiple unread reminders, **When** I check the unread count via `GET /reminders/unread-count`, **Then** the correct count of unread reminders is returned.

#### User Acceptance Tests (UAT)
- **UAT-012.1:** Request `GET /reminders` and verify the response contains a list of reminders with `unread` flags.
- **UAT-012.2:** Mark a reminder as read. Verify the unread count decreases by one via `GET /reminders/unread-count`.
- **UAT-012.3:** With no reminders set, request `GET /reminders/unread-count`. Verify the count is `0`.

---

### US-013: Athlete Injury Tracking
- **Priority:** Medium
- **User Story:** As a coach, I want to record, update, resolve, and reopen injury records for my athletes, so that I can track injury history, recovery status, and make informed training decisions.

#### Acceptance Criteria (Given/When/Then)
1. **Given** an active athlete, **When** I create an injury record via `POST /athletes/:id/injuries` with body part, type, and severity, **Then** the injury is stored with status `active`.
2. **Given** an active injury, **When** I resolve it via `PATCH /athletes/:id/injuries/:injuryId/resolve`, **Then** the injury status changes to `resolved` and a `resolvedAt` timestamp is set.
3. **Given** a resolved injury, **When** I reopen it via `PATCH /athletes/:id/injuries/:injuryId/reopen`, **Then** the status returns to `active` and `resolvedAt` is cleared.
4. **Given** an athlete with injuries, **When** I request `GET /athletes/:id/injuries`, **Then** all injuries for that athlete are returned, filterable by status.

#### User Acceptance Tests (UAT)
- **UAT-013.1:** Create a hamstring strain injury for an athlete. Verify HTTP `201` and the injury appears in `GET /athletes/:id/injuries` with status `active`.
- **UAT-013.2:** Resolve the injury. Verify status changes to `resolved` and `resolvedAt` is populated.
- **UAT-013.3:** Reopen a resolved injury. Verify status returns to `active` and `resolvedAt` is `null`.
- **UAT-013.4:** Request injuries with `?status=active`. Verify only active injuries are returned.

---

### US-014: Club Management & Onboarding
- **Priority:** High
- **User Story:** As a new coach, I want to create a club or join an existing one during onboarding, so that my athletes and events are organised under a club workspace from the start.

#### Acceptance Criteria (Given/When/Then)
1. **Given** a newly registered user with no club membership, **When** they complete authentication, **Then** the `ClubOnboarding` flow is displayed, offering options to create a new club or search/join an existing one.
2. **Given** I choose to create a club, **When** I submit a club name via `POST /clubs`, **Then** a new club workspace is created and I am added as its owner.
3. **Given** I choose to join an existing club, **When** I submit a join request via `POST /clubs/:id/join`, **Then** a `pending` join request is created for the club owner to review.
4. **Given** a pending join request, **When** the club owner approves it via `PATCH /clubs/:id/join-requests/:requestId`, **Then** the requesting user gains membership to the club workspace.

#### User Acceptance Tests (UAT)
- **UAT-014.1:** Register a new user with no memberships. Verify the onboarding flow is presented.
- **UAT-014.2:** Create a club named `Thunderbolts`. Verify HTTP `201` and the user is added as owner.
- **UAT-014.3:** Search for an existing club by name. Verify matching clubs are returned.
- **UAT-014.4:** Submit a join request to a club. Verify the request appears in the club owner's pending requests list.

---

### US-015: Shared Workspaces & Multi-Tenancy
- **Priority:** High
- **User Story:** As a coach who belongs to multiple clubs, I want to switch between workspaces (clubs) from the console, so that I can manage athletes, events, and fixtures for each club independently.

#### Acceptance Criteria (Given/When/Then)
1. **Given** I am a member of multiple workspaces, **When** I request `GET /workspaces`, **Then** all accessible workspaces are returned with their `id`, `name`, and role.
2. **Given** multiple workspaces, **When** I set the `X-Workspace-Id` header on subsequent requests, **Then** all data queries are scoped to that workspace's athletes, events, and results.
3. **Given** I am a member of a workspace, **When** I leave it via `DELETE /workspaces/:id/leave`, **Then** my membership is removed and I can no longer access that workspace's data.
4. **Given** a workspace owner, **When** I invite a user via `POST /workspaces/:id/invitations`, **Then** an invitation token is generated and the invitee can accept to gain membership.

#### User Acceptance Tests (UAT)
- **UAT-015.1:** Create two clubs. Request `GET /workspaces` and verify both workspaces are listed.
- **UAT-015.2:** Set `X-Workspace-Id` to workspace A, create an athlete, then switch to workspace B. Verify the athlete does not appear in workspace B's roster.
- **UAT-015.3:** Leave a workspace and verify `GET /workspaces` no longer includes it.
- **UAT-015.4:** Invite a user to a workspace. Verify they can accept the invitation and gain access.

---

### US-016: AI Voice Assistant for Athlete Creation
- **Priority:** Medium
- **User Story:** As a coach, I want to use a voice assistant to create athletes by speaking their details, so that I can quickly populate my roster hands-free during training sessions.

#### Acceptance Criteria (Given/When/Then)
1. **Given** I am authenticated, **When** I request `POST /ai/gemini-token`, **Then** a short-lived Gemini Live token is returned for establishing a voice session.
2. **Given** an active Gemini voice session, **When** I speak an athlete's name and details, **Then** the assistant processes the speech and creates the athlete record via the athletes API.
3. **Given** the `GEMINI_API_KEY` is not configured, **When** I request a token, **Then** the API returns a structured error indicating the service is unavailable.

#### User Acceptance Tests (UAT)
- **UAT-016.1:** Request a Gemini token. Verify a valid token string is returned in `data.token`.
- **UAT-016.2:** Request a Gemini token when `GEMINI_API_KEY` is unset. Verify an error response is returned without a 500 crash.
- **UAT-016.3:** Create an athlete via voice assistant. Verify the athlete appears in `GET /athletes` with the spoken name and details.

---

### US-017: Public Event QR Logger
- **Priority:** Medium
- **User Story:** As a coach, I want to generate a public QR code link for an event so that athletes can scan it and log their own race entries without needing full authentication.

#### Acceptance Criteria (Given/When/Then)
1. **Given** an `in_progress` event, **When** I generate a public logger link via the event helpers API, **Then** a unique public URL is returned that allows timeline entry submission for that event.
2. **Given** a public logger URL, **When** an athlete submits a timeline entry via `POST /public/logger`, **Then** the entry is stored against the event with the correct athlete and timing data.
3. **Given** a public logger URL for a non-`in_progress` event, **When** a submission is attempted, **Then** the request is rejected with `409 EVENT_NOT_IN_PROGRESS`.

#### User Acceptance Tests (UAT)
- **UAT-017.1:** Generate a public logger link for an `in_progress` event. Verify a valid public URL is returned.
- **UAT-017.2:** Submit a timeline entry via the public logger. Verify the entry appears in `GET /events/:eventId/entries`.
- **UAT-017.3:** Attempt to submit via the public logger for a `completed` event. Verify HTTP `409 EVENT_NOT_IN_PROGRESS`.

---

### US-018: Public Club Statistics Landing
- **Priority:** Low
- **User Story:** As a visitor, I want to view a public page showing a club's performance index and statistics, so that I can assess the club's competitiveness without needing an account.

#### Acceptance Criteria (Given/When/Then)
1. **Given** a published club, **When** I visit its public statistics page, **Then** I see aggregate performance metrics (total athletes, total PBs, recent results) without authentication.
2. **Given** a club that has not enabled publication, **When** I visit its statistics URL, **Then** a `404 NOT_FOUND` response is returned.
3. **Given** the public statistics page, **When** rendered, **Then** the page displays an athlete card gallery and a static track visualisation.

#### User Acceptance Tests (UAT)
- **UAT-018.1:** Enable club publication, then visit the public statistics URL. Verify athlete performance data is displayed.
- **UAT-018.2:** Visit the public statistics URL for a non-published club. Verify `404 NOT_FOUND`.
- **UAT-018.3:** Verify the public page renders without requiring authentication (no login prompt).

---

### US-019: Event Helper Invitations & Temporary Assistants
- **Priority:** Medium
- **User Story:** As a coach, I want to invite temporary helpers to assist with live event logging via a time-limited invitation link, so that assistants can contribute without needing a permanent account.

#### Acceptance Criteria (Given/When/Then)
1. **Given** an event I own, **When** I create an event helper invitation via `POST /events/:id/helpers`, **Then** a time-limited invitation token is generated.
2. **Given** a valid helper invitation token, **When** a user redeems it via `POST /events/:id/helpers/redeem`, **Then** they gain temporary logging access to the event.
3. **Given** a helper invitation, **When** I revoke it, **Then** the token is invalidated and any granted access is removed.
4. **Given** rate limiting, **When** more than 10 redemption attempts are made from the same IP within one minute, **Then** the request is rejected with `429 Too Many Requests`.

#### User Acceptance Tests (UAT)
- **UAT-019.1:** Create a helper invitation for an event. Verify a token is returned.
- **UAT-019.2:** Redeem the helper invitation. Verify the helper gains access to the event's timeline entries.
- **UAT-019.3:** Revoke a helper invitation and attempt to redeem it. Verify the redemption is rejected.
- **UAT-019.4:** Attempt 11 rapid redemption requests from the same IP. Verify the 11th request returns HTTP `429`.

---

### US-020: Real-Time Event Updates via WebSocket
- **Priority:** Medium
- **User Story:** As a coach or assistant, I want live event updates (timeline entries, result changes, status transitions) to be broadcast to all connected clients in real time, so that everyone sees the latest data without manually refreshing.

#### Acceptance Criteria (Given/When/Then)
1. **Given** a client connected to an event's real-time room, **When** another client creates or updates a timeline entry, **Then** the change is broadcast to all subscribers within one second.
2. **Given** a client connected to an event's room, **When** the event status changes (e.g. to `completed`), **Then** all subscribers receive a status update notification.
3. **Given** an unauthorized client, **When** they attempt to join a real-time room, **Then** the connection is rejected.

#### User Acceptance Tests (UAT)
- **UAT-020.1:** Open two browser tabs on the same event. Log an entry in one tab and verify it appears in the other tab without a page refresh.
- **UAT-020.2:** Complete an event in one tab. Verify the other tab receives the status change and adjusts its UI accordingly (e.g. disables logging controls).
- **UAT-020.3:** Attempt a WebSocket connection without a valid JWT. Verify the connection is refused.

---

### US-021: Privacy Policy, Terms & Consent Gate
- **Priority:** High
- **User Story:** As a new user, I want to review and accept the privacy policy and terms of service before using the application, so that the platform complies with legal requirements.

#### Acceptance Criteria (Given/When/Then)
1. **Given** a newly authenticated user who has not yet consented, **When** they attempt to access any protected route, **Then** the `ConsentGate` component is displayed blocking access until consent is given.
2. **Given** the consent gate, **When** I check the consent checkbox and submit, **Then** `POST /auth/consent` records my acceptance with the current consent version and timestamp.
3. **Given** a user who has already consented, **When** they log in again, **Then** the consent gate is bypassed and they proceed directly to the console.

#### User Acceptance Tests (UAT)
- **UAT-021.1:** Register a new user. Verify the consent gate appears before any console content is visible.
- **UAT-021.2:** Accept the consent form. Verify the consent gate disappears and the console is accessible.
- **UAT-021.3:** Log in again as a user who has already consented. Verify the consent gate does not reappear.
- **UAT-021.4:** Attempt to submit the consent form without checking the checkbox. Verify the submit button is disabled or the submission is rejected.

---

### US-022: Landing Page Redesign
- **Priority:** Medium
- **User Story:** As a prospective user, I want a visually compelling landing page with a cinematic 3D track hero, feature showcase, and interactive product preview, so that I understand the product's value before signing up.

#### Acceptance Criteria (Given/When/Then)
1. **Given** an unauthenticated visitor, **When** they load the landing page, **Then** a cinematic 3D track hero animation with a humanoid runner is displayed.
2. **Given** the landing page, **When** the feature grid is rendered, **Then** six feature cards are shown (Roster & PBs, Meets & training camps, Squad PB trend, Live squad status, Athlete profiles & notes, Season-wide dashboard).
3. **Given** the landing page, **When** the interactive preview is rendered, **Then** three tabs (Athletes, Events, Trend) display mock data with full keyboard navigation.
4. **Given** the landing page, **When** the FAQ accordion is rendered, **Then** questions expand and collapse with `aria-expanded` attributes and keyboard support.

#### User Acceptance Tests (UAT)
- **UAT-022.1:** Load the landing page while logged out. Verify the hero section with 3D track animation renders.
- **UAT-022.2:** Click each of the six feature cards. Verify they are visible and properly styled.
- **UAT-022.3:** Switch between Athletes, Events, and Trend tabs using keyboard arrow keys. Verify the correct tab panel is displayed.
- **UAT-022.4:** Expand and collapse FAQ items. Verify `aria-expanded` toggles correctly.

---

### US-023: Coach Console Redesign
- **Priority:** Medium
- **User Story:** As a coach, I want a premium dark-themed console with aurora-inspired styling, animated weather effects, a live clock, and an improved sidebar navigation, so that my daily coaching dashboard feels modern and polished.

#### Acceptance Criteria (Given/When/Then)
1. **Given** I am on the console, **When** the page loads, **Then** a dark-themed sidebar with aurora gradient accents and navigation items (Dashboard, Athletes, Compare, Events, Live Logger, Account) is displayed.
2. **Given** weather effects are enabled, **When** I am on the console, **Then** animated weather particles (rain, snow, storm) are rendered based on the current weather preset or live location data.
3. **Given** the console, **When** the live clock is rendered, **Then** it updates every second showing the current time in 24-hour format and the full date.
4. **Given** the console, **When** I toggle weather effects off via the weather controls, **Then** all weather animation ceases and the preference is persisted in `localStorage`.

#### User Acceptance Tests (UAT)
- **UAT-023.1:** Load the console. Verify the dark sidebar with aurora accents and all six navigation items are visible.
- **UAT-023.2:** Enable weather effects and verify animated particles appear on screen.
- **UAT-023.3:** Verify the live clock updates every second without page refresh.
- **UAT-023.4:** Toggle weather effects off, reload the page. Verify weather effects remain off (preference persisted).

---

### US-024: Season Filters for Results & Comparisons
- **Priority:** Medium
- **User Story:** As a coach, I want to filter results, statistics, and comparisons by season year, so that I can focus on the current or a specific season's performance data.

#### Acceptance Criteria (Given/When/Then)
1. **Given** results from multiple seasons, **When** I request `GET /dashboard/summary?year=2026`, **Then** only results and events from 2026 are included in the aggregates.
2. **Given** an athlete with multi-season results, **When** I request `GET /athletes/:id/statistics?year=2025`, **Then** PB and SB are computed only from 2025 results.
3. **Given** a comparison request, **When** I include `year=2026`, **Then** only 2026 season data is compared between athletes.

#### User Acceptance Tests (UAT)
- **UAT-024.1:** Create events in 2025 and 2026 with results. Request `GET /dashboard/summary?year=2026`. Verify only 2026 events are counted.
- **UAT-024.2:** Request athlete statistics with `?year=2025`. Verify the PB reflects only 2025 season data.
- **UAT-024.3:** Compare two athletes with `?year=2026`. Verify the comparison data excludes 2025 results.

---

### US-025: Offline Event Logging with Background Sync
- **Priority:** Medium
- **User Story:** As a coach at a venue with poor connectivity, I want to log timeline entries offline and have them automatically sync to the server when connectivity is restored, so that no race data is lost.

#### Acceptance Criteria (Given/When/Then)
1. **Given** the device is offline, **When** I submit a timeline entry, **Then** the entry is queued locally and a visual indicator (`OfflineIndicator`) shows the pending sync count.
2. **Given** queued offline entries, **When** connectivity is restored, **Then** entries are replayed to the server via individual API endpoints in order.
3. **Given** a queued entry that fails to sync (e.g. validation error), **When** the replay is attempted, **Then** the failed entry is flagged and the remaining entries continue syncing.
4. **Given** the offline queue, **When** all entries have synced successfully, **Then** the queue is cleared and the offline indicator disappears.

#### User Acceptance Tests (UAT)
- **UAT-025.1:** Disable network, log a timeline entry. Verify the entry is queued and the offline indicator shows `1` pending entry.
- **UAT-025.2:** Restore network connectivity. Verify the queued entry is synced to the server and appears in `GET /events/:eventId/entries`.
- **UAT-025.3:** Queue multiple entries offline, then restore connectivity. Verify all entries sync in order and the queue clears.
- **UAT-025.4:** Queue an entry for a completed event offline. Verify the failed entry is flagged and subsequent entries still sync.

---

## AI Usage Declaration

This document was generated and refined with the assistance of AI tools:
- **Code Generation & Documentation Synthesis:** `opencode[mimo-v2.5-free]`
- **In-line Review & Structuring:** `opencode[mimo-v2.5-free]`
