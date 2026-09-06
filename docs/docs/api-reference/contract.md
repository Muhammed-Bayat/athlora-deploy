---
sidebar_position: 1
---

# 100m data/API contract

The authoritative contract for the currently implemented 100m vertical slice. It fixes the current discipline to **100m** (track, timed) and the result unit to **seconds** at the API/service boundary, and defines the request/response DTOs for athletes, events, participants, timeline entries, results, statistics, and dashboard data.

All paths in this document are relative to `/api/v1`.

Athlora's product scope is a full athletics meet, not only 100m. Additional track, relay, race-walk, jump, throw, and vertical-event contracts will extend this document with their own units, validation, entry shapes, derivation, placing, and PB/SB rules. Until those contracts are implemented, this page remains exact for the shipped 100m API.

The database schema stays permissive (`discipline` is free-form `TEXT`; the `unit` column allows `seconds`/`metres`/`cm`) so later disciplines are added by new migrations without changing this contract. The discipline/unit fixation happens in the TypeScript domain types and the pure result-derivation service — never by a database CHECK on the discipline value.

## 1. Contract constants

Defined once in `backend/src/types/domain.ts` and mirrored in `frontend/src/types/index.ts`:

| Constant | Value | Meaning |
|---|---|---|
| `DISCIPLINE_100M` | `'100m'` | Canonical MVP discipline; `type Discipline = '100m'` |
| `RESULT_UNIT_SECONDS` | `'seconds'` | Canonical MVP unit; `type ResultUnit = 'seconds'` |
| `DISCIPLINE_KIND` | `{ '100m': 'track' }` | Discipline → result rules branch (`track` | `field`) |

`timeline_entries.discipline` and `results.discipline` are typed `Discipline` (`'100m'`); `unit` is `ResultUnit | null` (`'seconds' | null`).

## 2. Result outcomes

`results.outcome` is `NOT NULL` with `DEFAULT 'no_result'` and CHECK-constrained. The schema can always distinguish no result, a valid finish, DQ, DNF, and DNS:

| `outcome` | Meaning | `final_result` |
|---|---|---|
| `no_result` | No valid finish — no attempts logged, all attempts foul, or DNS applied | `NULL` |
| `valid` | A legal finishing time was recorded | non-`NULL` (seconds) |
| `dq` | Disqualified (incident `dq`) | must be `NULL` (voided) |
| `dnf` | Did not finish (incident `dnf`) | must be `NULL` (voided) |
| `dns` | Did not start (incident `dns`) | must be `NULL` (voided) |

The `results_voided_has_no_value_check`, `results_valid_has_value_check` and `results_no_result_has_no_value_check` constraints pin these value shapes at the database: voided outcomes must carry no `final_result`, valid finishes must carry one, and `no_result` must not. The pure functions in `backend/src/services/resultDerivation.ts` produce `{ value, incident, outcome }`; `outcome` is derived as: a void incident (`dq`/`dnf`/`dns`) → that outcome; otherwise a non-null value → `valid`; otherwise `no_result`.

## 3. Request/response envelopes

Success responses wrap payloads in `data`; lists add `meta.count`; errors use the standard error shape:

```json
{ "data": { ... } }
{ "data": [ ... ], "meta": { "count": 12 } }
{ "error": { "code": "VALIDATION_ERROR", "message": "Human-readable message", "details": {} } }
```

Mutation payload validation failures return HTTP `400` with code `VALIDATION_ERROR`, message `Request validation failed`, and an ordered issue list:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "issues": [
        { "path": "date", "code": "invalid_format", "message": "Expected a real date in YYYY-MM-DD format" }
      ]
    }
  }
}
```

Mutation payloads use strict field allow-lists. Unknown fields and server-controlled identifiers, ownership/audit fields, derived fields, and timestamps are rejected rather than ignored. Malformed JSON uses the same envelope. Malformed resource identifiers in URL paths retain the ownership contract's non-enumerating `404 NOT_FOUND` response.

Unless explicitly noted, application resource routes require `Authorization: Bearer <auth0 JWT>` and a synchronized application-user row. Resource requests may include `X-Workspace-Id: <UUID>` to select one of the caller's memberships; omitted headers select the earliest membership. An inaccessible workspace returns `403 WORKSPACE_ACCESS_DENIED`.

### 3.1 Authentication context and ownership

`PUT /api/v1/auth/me` verifies the Auth0 token and synchronizes its subject/profile to `users`; it intentionally does not require an existing `users` row. A new account creates a Club or requests membership through the Club onboarding routes before it receives an active workspace membership. Resource routes perform a second step after JWT verification: they resolve the verified Auth0 `sub` by `users.auth0_id`, validate the selected membership, and expose the application user UUID, audit role, active workspace UUID and workspace role to controllers through typed request context.

A valid Auth0 identity that has not completed synchronization receives:

```json
{
  "error": {
    "code": "AUTH_USER_NOT_SYNCHRONIZED",
    "message": "Authenticated user is not synchronized",
    "details": { "syncEndpoint": "/api/v1/auth/me" }
  }
}
```

The status is `403`. Missing and invalid tokens retain the standard `401 UNAUTHORIZED` responses.

**Authentication and account endpoints:**

| Method & path | Authentication | Purpose |
|---|---|---|
| `PUT /auth/me` | Verified Auth0 JWT | Fetches the Auth0 profile and creates or updates the local application user; returns `{ data: User }`. It is the only application-user endpoint that does not require a pre-existing local user. |
| `POST /auth/me/password-ticket` | Verified JWT + synchronized user | Creates an Auth0-hosted password-change ticket; returns `201` with `{ data: { url } }`. |
| `DELETE /auth/me` | Verified JWT | Starts permanent deletion of the verified Auth0 identity and removes its memberships; shared workspace data and attribution remain. Returns `202` with `{ data: { status: 'pending' } }`. A durable deletion tombstone blocks later synchronization and resource access. |
| `GET /workspaces` | Verified JWT + synchronized user | Lists accessible workspaces and returns `meta.activeWorkspaceId`. |
| `GET /workspaces/:workspaceId/members` | Coach membership | Lists workspace members. |
| `PATCH /workspaces/:workspaceId/members/:userId` | Coach membership | Changes a member between `coach` and `assistant`; cannot demote the final coach. |
| `DELETE /workspaces/:workspaceId/members/:userId` | Coach membership | Removes a member; cannot remove the final coach. |
| `GET /workspaces/:workspaceId/invitations` | Coach membership | Lists active, unexpired invitations. |
| `POST /workspaces/:workspaceId/invitations` | Coach membership | Creates an expiring email-bound coach or assistant invitation. |
| `POST /workspaces/:workspaceId/invitations/:invitationId/resend` | Coach membership | Revokes the active token and issues a replacement invitation. |
| `DELETE /workspaces/:workspaceId/invitations/:invitationId` | Coach membership | Revokes an unused invitation. |
| `POST /workspaces/invitations/:token/accept` | Verified JWT | Accepts one active invitation only when the synchronized account email matches. |
| `GET /clubs?q=` | Verified JWT + synchronized local user | Searches all Clubs by name; no existing membership is required. |
| `POST /clubs` | Verified JWT + synchronized local user | Creates a named Club, its backing workspace, and a coach membership. |
| `POST /clubs/:clubId/join-requests` | Verified JWT + synchronized local user | Creates a pending request to join a Club. |
| `GET /clubs/join-requests/me` | Verified JWT + synchronized local user | Lists the caller's requests. |
| `POST /clubs/join-requests/:id/withdraw` | Verified JWT + synchronized local user | Withdraws the caller's pending request. |
| `GET /clubs/:clubId/join-requests` | Active Club coach | Lists pending requests for the selected Club. |
| `POST /clubs/:clubId/join-requests/:id/approve` | Active Club coach | Approves with a role of coach or assistant. |
| `POST /clubs/:clubId/join-requests/:id/reject` | Active Club coach | Rejects a pending request. |
| `GET /auth/login`, `/auth/callback`, `/auth/logout` | Public | Legacy scaffolding only; each returns `501 NOT_IMPLEMENTED`. The SPA uses Auth0 Universal Login instead. |

Workspace membership is server-derived and is the authorization boundary: athletes and events carry `workspace_id`, and dependent rows require event and athlete workspace equality. `coachId`, `createdBy`, `recordedBy` and `overriddenBy` remain attribution actors, not ownership controls. A workspace has a default IANA timezone; events can store an optional timezone override. Client mutation payloads never control workspace or attribution fields.

Clubs are the user-facing organization layer. Each Club maps one-to-one to a backing workspace, retaining resource isolation while allowing signed-in users to discover Clubs and request coach-approved membership.

Workspace roles are only `coach` and `assistant`. Both roles have operational access to athletes, events, squads, injuries, timeline entries, result corrections, public logger links, and fixture logging/invitation workflows. Coaches exclusively administer Club membership and invitations, review Club join requests, change any event participant roster, and withdraw a fixture team. Timeline edits and undo remain scoped to the active workspace and event, but are not restricted to the original recorder. Every restricted action is checked by backend middleware as well as omitted from the console. Invitation tokens are stored only as hashes, expire, can be revoked or replaced through resend, bind to the accepted Auth0 account email, and become unusable after first acceptance. Membership invitation, resend, acceptance, revocation, role changes, and removals are recorded in `workspace_membership_audit`.

To prevent resource enumeration, a malformed identifier, nonexistent row, wrong parent relationship and cross-coach row all return the same `404 NOT_FOUND` response with message `Resource not found` and empty details.

### 3.2 Fixture access

A fixture connects one hosted, scheduled 100m competition to one or more guest workspaces without granting those workspaces membership in the host workspace. Fixture invitations are email-bound, token-hashed, copy/share links. They are not email delivery records. Only coaches may create invitations, respond, manage a fixture roster, or record/correct their team's results.

| Method & path | Actor | Purpose |
|---|---|---|
| `POST /events/:eventId/fixture-invitations` | Host coach | Create a pending invitation; body `{ email, expiresInDays? }` |
| `GET /events/:eventId/fixture-invitations` | Host workspace | Read invitation state and response history summary |
| `POST /events/:eventId/fixture-invitations/:invitationId/resend` | Host coach | Revoke and replace a pending/declined/change-request invitation |
| `DELETE /events/:eventId/fixture-invitations/:invitationId` | Host coach | Revoke an unused invitation |
| `GET /events/:eventId/fixture-rosters` | Host workspace | Read participating-team rosters using the fixture-safe athlete summary |
| `POST /events/:eventId/fixture-workspaces/:workspaceId/withdrawal` | Host coach | Record a guest withdrawal after start while preserving history |
| `GET /events/:eventId/fixture-entries` | Host workspace | Read all fixture timeline entries (host read-only) |
| `GET /events/:eventId/fixture-results` | Host workspace | Read all fixture results (host read-only) |
| `PUT /events/:eventId/fixture-results/:athleteId` | Host coach | Override a fixture result from the host side |
| `GET /fixtures/incoming` | Invited guest workspace | List incoming fixture invitations |
| `POST /fixtures/incoming/:invitationId/respond` | Invited coach | Accept, decline, or request a change; body `{ response, message? }` |
| `GET /fixtures` / `GET /fixtures/:eventId` | Accepted guest workspace | List/read fixture-safe details |
| `GET|POST|PUT|DELETE /fixtures/:eventId/participants` | Accepted guest coach | Read/manage only the active guest workspace's roster and RSVP state |
| `POST /fixtures/:eventId/withdrawal` | Guest coach | Withdraw before start |
| `GET|POST|PATCH|DELETE /fixtures/:eventId/entries` | Accepted guest coach | Read/write only the guest team's timeline entries |
| `GET /fixtures/:eventId/results` | Accepted guest workspace | Read only the guest team's results |
| `PUT /fixtures/:eventId/results/:athleteId` | Accepted guest coach | Correct only the guest team's result |

The invitation state machine is `pending -> accepted|declined|change_requested|revoked`; expiry makes a pending/change-request invitation unavailable. Every response is retained with its acting user, workspace and fixture revision. A guest acceptance creates the participating workspace relationship. A team may be `accepted`, `reacceptance_required`, or `withdrawn`.

Changing a fixture's date, time, venue (including coordinates), or accepted participating-team set increments `fixtureRevision`, retains selected rosters, replaces outstanding reacceptance links, and marks guest teams `reacceptance_required`. The host cannot move a fixture out of `scheduled` until all non-withdrawn guests have accepted the current revision. Material changes and roster changes are unavailable after the fixture begins. Before start, a guest coach may withdraw its team; after start, only the host records a withdrawal. Neither withdrawal deletes participant, timeline, or result history.

Guest responses and fixture reads reveal only the fixture metadata, participating-team display names, and the caller's own athlete summaries/results. They never expose another workspace's roster, athlete notes, date of birth, injury/private profile data, or unrelated workspace resources. Host fixture-roster reads use the same safe participant summary and never expose guest private athlete fields.

### 3.3 Injury tracking

Athletes carry persistent injury records with body-region mapping. Each injury has a body region, area, side, severity, and optional onset/resolution dates. Injuries are soft-deleted and can be resolved or reopened.

| Method & path | Purpose |
|---|---|
| `GET /athletes/:id/injuries` | List injuries for an athlete; optional `status` query filter |
| `POST /athletes/:id/injuries` | Create an injury record |
| `PUT /athletes/:id/injuries/:injuryId` | Update an injury record |
| `POST /athletes/:id/injuries/:injuryId/resolve` | Resolve (close) an injury |
| `POST /athletes/:id/injuries/:injuryId/reopen` | Reopen a resolved injury |
| `DELETE /athletes/:id/injuries/:injuryId` | Soft-delete an injury record |

Injury create/update DTO: `bodyRegion` (required), `area`, `side`, `severity`, `onsetDate`, `resolutionDate`, `notes`. Severity is one of `minor`, `moderate`, `severe`. Side is one of `left`, `right`, `bilateral`.

### 3.4 Two-athlete comparison

| Method & path | Purpose |
|---|---|
| `GET /athletes/comparison?athlete1Id=&athlete2Id=` | Compare two athletes side by side |

Returns both athletes' PB, latest result, valid result count, average time, consistency (standard deviation), and improvement metrics. Used by the Comparison page for head-to-head analysis.

### 3.5 Public logger links

Coaches create shareable, token-authenticated links that let external guests log results for an event without an Auth0 account. Tokens are verified server-side; the public guest never authenticates through Auth0.

**Owner endpoints (authenticated):**

| Method & path | Purpose |
|---|---|
| `POST /events/:eventId/public-loggers` | Create a shareable public logger link; body `{ label? }` |
| `GET /events/:eventId/public-loggers` | List all public logger links for the event |
| `DELETE /events/:eventId/public-loggers/:linkId` | Revoke a public logger link |

**Public endpoints (token-based, no Auth0):**

| Method & path | Purpose |
|---|---|
| `POST /public/logger/sessions` | Start a public logging session; body `{ token, name, club? }` |
| `POST /public/logger/sessions/event/:eventId` | Start session by event ID (token in body) |
| `GET /public/logger/events/:eventId` | Get a read-only event snapshot (participants, timeline, standings) |
| `POST /public/logger/events/:eventId/entries` | Create a timeline entry through the public logger |

The public endpoints accept a bearer token derived from the public logger link. Session state is tracked server-side and returned to the guest on reconnection.

### 3.6 Event helpers and offline designation

Event helpers are external users granted read or read/write access to a specific event without workspace membership. Helpers are invited by coaches, redeem invitations with a secret or human-readable code, and receive event-scoped grants.

**Invitation and grant endpoints (authenticated):**

| Method & path | Purpose |
|---|---|
| `POST /events/:eventId/helpers/invitations` | Create a helper invitation; body `{ email, role, expiresInDays? }` |
| `GET /events/:eventId/helpers/invitations` | List helper invitations for the event |
| `POST /events/:eventId/helpers/invitations/:invitationId/rotate` | Rotate (replace) an invitation token |
| `PATCH /events/:eventId/helpers/invitations/:invitationId` | Update an invitation's status |
| `DELETE /events/:eventId/helpers/grants/:grantId` | Revoke a helper grant |

**Redemption endpoint (public, rate-limited):**

| Method & path | Purpose |
|---|---|
| `POST /events/helpers/redeem` | Redeem an invitation; body `{ code }` |

**Offline designation endpoints (authenticated):**

| Method & path | Purpose |
|---|---|
| `POST /events/:eventId/helpers/grants/:grantId/designate-offline-logger` | Designate a grant as the offline logger |
| `DELETE /events/:eventId/helpers/grants/:grantId/designate-offline-logger` | Revoke offline logger designation |
| `POST /events/:eventId/helpers/transfer-offline-logger` | Transfer offline logger designation between grants |

Only one grant per event may be designated as the offline logger. The designated logger may queue actions in IndexedDB when offline and drain them through `POST /sync/batch` on reconnect.

### 3.7 Notifications

Fixture-related notifications (invitations, reacceptance, responses) are delivered to coaches through an in-app notification system.

| Method & path | Purpose |
|---|---|
| `GET /notifications` | List fixture notifications for the user |
| `GET /notifications/unread-count` | Get the count of unread notifications |
| `POST /notifications/:notificationId/read` | Mark a notification as read |

Notifications include `fixture_started`, `fixture_invited`, `fixture_reacceptance_required`, and invitation-response kinds. The notification bell in the console topbar polls unread count and renders a dropdown.

### 3.8 AI integration

The Gemini voice assistant provides real-time, voice-driven athlete management. The frontend captures microphone audio, streams it to Google Gemini through a WebSocket, and receives audio responses and tool-call results (e.g. creating an athlete).

| Method & path | Purpose |
|---|---|
| `POST /ai/gemini-token` | Create a short-lived Gemini API access token |

The token is exchanged by the frontend SDK (`@google/genai`) to establish a `BidiGenerateContentConstrained` WebSocket session. The backend does not relay audio; the browser streams directly to Gemini's endpoint. Tool calls are intercepted by the frontend and sent to the existing Athlora API.

### 3.9 Athlete progression

| Method & path | Purpose |
|---|---|
| `GET /athletes/:id/progression` | Cursor-paginated all-time 100m progression with running PB |

Query parameters: `cursor` (pagination token), `limit` (page size, default 50, max 200), `type` (`competition` or `training` filter). Returns chronological entries with effective result/outcome (incorporating manual overrides), a running PB indicator, and a summary of all-time PB and total result counts.

### 3.10 Offline sync

| Method & path | Purpose |
|---|---|
| `POST /sync/batch` | Process a batch of offline queue actions |

The batch endpoint accepts an array of actions (`create_entry`, `edit_entry`, `undo_entry`) with per-action expected versions and client timestamps. Each action is processed idempotently; duplicate action IDs are detected and returned as `duplicate`. Rejected actions include the rejection code. A `recomputedResults` flag indicates whether the server recomputed results after the batch. The server stores a receipt per action for conflict resolution on subsequent drains.

## 4. DTOs

Field names are camelCase on the wire. Calendar dates are real Gregorian `YYYY-MM-DD` values. Local event clock times accept `HH:mm` or `HH:mm:ss` and are serialized as `HH:mm:ss` without timezone conversion. `createdAt`/`updatedAt` (and `archivedAt`, `overrideAt`) are `timestamptz` ISO 8601 strings.

### 4.1 User

```
id, auth0Id, name, email, role ('coach'|'assistant'), createdAt, updatedAt
```

### 4.2 Athlete

```
id, coachId, name, dob (ISO date|null), gender (string|null), squads (Squad[]),
notes (string|null), status ('active'|'inactive'|'archived'), archivedAt (ISO|null),
statusChangedAt (ISO), statusChangedBy (UUID|null), createdAt, updatedAt
```

**Lifecycle rule:** active athletes can be newly assigned to events. Inactive athletes remain visible and editable but cannot be newly assigned. Archived athletes are hidden by default, read-only until restored, and cannot be newly assigned. Archiving is reversible and preserves event participation, timeline entries, results, squads, and injuries. `statusChangedAt` and `statusChangedBy` identify the current transition; the database retains the full transition audit.

**Endpoints:**

| Method & path | Purpose |
|---|---|
| `GET /athletes` | List the coach's roster (active by default) |
| `POST /athletes` | Create an athlete; returns `201` with `{ data: athlete }` |
| `GET /athletes/:id` | Fetch one owned athlete |
| `PUT /athletes/:id` | Full replacement of mutable fields |
| `DELETE /athletes/:id` | Archive (sets `archivedAt`); returns `{ data: athlete }` |
| `POST /athletes/:id/unarchive` | Restore (clears `archivedAt`); returns `{ data: athlete }` |
| `POST /athletes/:id/status` | Transition status; body `{ status }`; returns `{ data: athlete }` |
| `GET /athletes/injury-summaries` | List active-injury summaries for roster athletes in the active workspace |

`GET /athletes` accepts strict query parameters (unknown parameters are rejected with `400`):

| Parameter | Behavior |
|---|---|
| `includeArchived` | `'true'` or `'false'` (default `'false'`). When `false`, archived athletes are excluded. |
| `status` | Exact lifecycle state (`'active'`, `'inactive'`, or `'archived'`) |
| `name` | Case-insensitive substring match on `name` |
| `squadId` | Canonical UUID; returns athletes with that membership without multiplying roster rows |

Roster results are ordered by `LOWER(name)` ASC, then `createdAt`, then `id`, so the ordering is stable. Repeating an athlete status request for its current state is a successful no-op. Every real transition is workspace-authorized, actor-attributed, and flags existing event assignments for coach review.

Athlete create/full-replacement request DTO: `name` (required), `dob`, `gender`, `squadIds` (an optional, duplicate-free UUID array), `notes` — all optional except `name`. `PUT` replaces the membership set and nullable fields; it never touches `archivedAt`. Every squad ID must belong to the active workspace. `archivedAt` is set via the dedicated archive/unarchive actions, not through the generic update. `coachId` is always server-derived from the authenticated user and is rejected from request bodies.

`GET /athletes/injury-summaries` avoids per-card injury requests. It returns only athletes with active records; absent athletes are healthy. Each row contains `athleteId`, `activeInjuryCount`, `highestSeverity`, and an `activeInjuries` array of `{ bodyRegion, area, side, severity }`. Resolved and soft-deleted injuries are excluded.

### 4.3 Squad

```
id, name, archivedAt (ISO|null), createdAt, updatedAt
```

Squads are scoped to the active workspace and their names are case-insensitively unique within it. They are archived and restored rather than hard-deleted; archived squads remain on existing athletes but are excluded from new selection by default.

| Method & path | Purpose |
|---|---|
| `GET /squads` | List active workspace squads; `includeArchived=true` includes archived squads |
| `POST /squads` | Create a squad (coach only) |
| `PUT /squads/:id` | Rename a squad (coach only) |
| `DELETE /squads/:id` | Archive a squad (coach only) |
| `POST /squads/:id/unarchive` | Restore a squad (coach only) |

### 4.4 Event

```
id, createdBy, type ('competition'|'training'), discipline ('100m'), title, date (ISO date),
time (HH:mm:ss|null), locationName (string|null), latitude (number|null), longitude (number|null),
status, createdAt, updatedAt
```

The currently deployed discipline is fixed to **100m** at the API/service boundary: create/full-replacement accepts only `'100m'` or `null` and normalizes both to `'100m'` server-side; any other value is rejected with `400`. The database stays permissive (TEXT) so future disciplines are added through explicit migrations and contracts rather than by loosening this one.

**Event states** (`status`, CHECK-constrained):

| State | Meaning |
|---|---|
| `scheduled` | Planned, not started (default) |
| `in_progress` | Live event; timeline logging is open |
| `completed` | Logging closed; results finalised |
| `cancelled` | Called off; results/entries for it are not scored |

**Status transitions** are forward-only and enforced server-side on every full replacement:

| From → To | Allowed |
|---|---|
| `scheduled` | `scheduled`, `in_progress`, `completed`, `cancelled` |
| `in_progress` | `in_progress`, `completed`, `cancelled` |
| `completed` | `completed`, `cancelled` |
| `cancelled` | `cancelled` (terminal) |

Any other move returns `409 INVALID_EVENT_TRANSITION` with `details: { from, to }`. In particular, `cancelled` is terminal — a cancelled event can never start again — and `completed` events cannot revert to `in_progress` or `scheduled`. There is no single-active-event constraint: a coach may run any number of `in_progress` events concurrently.

**Cancellation rule:** cancelling an event keeps its timeline entries and results rows but marks them non-scoring; the dashboard and statistics ignore cancelled events. `cancelled` is not a delete — `DELETE /events/:id` only sets `status = 'cancelled'`.

**Endpoints:**

| Method & path | Purpose |
|---|---|
| `GET /events` | List the coach's events with optional filters |
| `POST /events` | Create an event; returns `201` with `{ data: event }` |
| `GET /events/:id` | Fetch one owned event |
| `GET /events/:id/weather` | Fetch the owned event's Open-Meteo daily forecast |
| `PUT /events/:id` | Full replacement of mutable fields + status transition |
| `DELETE /events/:id` | Cancel (sets `status = 'cancelled'`); returns `{ data: event }` |

`GET /events` accepts strict query parameters (unknown parameters are rejected with `400`):

| Parameter | Behavior |
|---|---|
| `type` | Exact match on `type` (`'competition'` or `'training'`) |
| `status` | Exact match on `status` |
| `dateFrom` | Inclusive lower bound on `date` (Gregorian `YYYY-MM-DD`) |
| `dateTo` | Inclusive upper bound on `date`; `dateFrom` must not be after `dateTo` |

Event results are ordered by `date` ASC, then `time` ASC (nulls last), then `createdAt`, then `id`, so the ordering is stable.

Event create/full-replacement request DTO: `type` (required), `discipline`, `title` (required), `date` (required), `time`, `locationName`, `latitude`, `longitude`, `status` (create defaults to `scheduled`; full replacement requires it). `PUT` is a full replacement, so omitted nullable fields become `null`, and the replacement `status` drives the transition check. Coordinates must be finite numbers in the inclusive latitude range `-90..90` and longitude range `-180..180`. `createdBy` is always server-derived from the authenticated user and is rejected from request bodies.

Event weather is proxied server-side from Open-Meteo without an API key. The provider receives the stored coordinates and returns its venue-local 16-day daily series; Athlora selects the stored event date and exposes only this stable DTO:

```
date, timezone, weatherCode, temperatureMinC, temperatureMaxC,
precipitationProbabilityMaxPercent (number|null), windSpeedMaxKmh (number|null)
```

The response is `{ data: forecast }`. Temperatures are Celsius, precipitation probability is percent, wind is km/h, and `weatherCode` is a validated WMO code. Both coordinates are required. Missing coordinates return `422 WEATHER_LOCATION_UNAVAILABLE`; a date outside the provider's local forecast series returns `422 WEATHER_DATE_UNAVAILABLE` with `details: { dateFrom, dateTo }`; a selected day whose required condition/temperature values are not yet available returns `404 WEATHER_FORECAST_NOT_FOUND`. Provider timeout, outage, or malformed data return safe `504 WEATHER_SERVICE_TIMEOUT`, `502 WEATHER_SERVICE_UNAVAILABLE`, or `502 WEATHER_SERVICE_INVALID_RESPONSE` errors without exposing provider internals. Authentication and generic non-enumerating event ownership checks run before any provider request.

**Logging guard:** timeline creation, edits, and the first undo reject writes against an event that is not `in_progress` with `409 EVENT_NOT_IN_PROGRESS` (`details: { status }`). An exact retry of an undo that already succeeded remains a `204` no-op even if the event has since closed; it does not write again.

### 4.4 Current weather (console readout)

| Method & path | Purpose |
|---|---|
| `GET /weather/current?latitude=&longitude=` | Fetch live current conditions from Open-Meteo for the console readout |

Current weather is proxied server-side from Open-Meteo without an API key. The provider receives the requested coordinates (never stored) and returns a single local current-condition snapshot; Athlora exposes only this stable DTO.

```
timezone, temperatureC, apparentTemperatureC, humidityPercent, isDay,
precipitationMm, weatherCode, windSpeedKmh
```

The response is `{ data: weather }`. Temperatures are Celsius, humidity is percent, precipitation is mm, wind is km/h, and `weatherCode` is a validated WMO code. Both query parameters are required, must be decimal numbers, and must fall within latitude `-90..90` and longitude `-180..180`; unknown parameters are rejected with `400 VALIDATION_ERROR`. Provider timeout, outage, or malformed data return the same safe `504 WEATHER_SERVICE_TIMEOUT`, `502 WEATHER_SERVICE_UNAVAILABLE`, or `502 WEATHER_SERVICE_INVALID_RESPONSE` errors as event weather. Authentication runs before any provider request.

### 4.5 Venue search

| Method & path | Purpose |
|---|---|
| `GET /venues/search?q=` | Search OpenStreetMap venues after an explicit client action |

The authenticated route accepts exactly one query field: a trimmed non-blank `q` of at most 200 characters. Unknown, missing, blank, repeated/non-string, or overlong fields return `400 VALIDATION_ERROR` before the provider boundary. It returns a stable, reduced list envelope with at most five results:

```
{ data: [{ displayName, latitude, longitude }], meta: { count } }
```

The browser never contacts Nominatim directly. `src/services/venues.ts` uses native server-side `fetch`, `NOMINATIM_BASE_URL` (default `https://nominatim.openstreetmap.org`), an identifiable `NOMINATIM_USER_AGENT`, a five-second timeout, a process-local five-minute query cache, and a process-local minimum one-second provider interval. It sends only the submitted query; the provider response is parsed strictly and reduced to the DTO above. Timeout, outage/rate-limit, and malformed payloads map to `504 VENUE_SERVICE_TIMEOUT`, `502 VENUE_SERVICE_UNAVAILABLE`, and `502 VENUE_SERVICE_INVALID_RESPONSE` without exposing provider data. This small cache/throttle is suitable for a first release, not shared across API instances.

Venue search is an optional convenience, not event persistence: choosing a result fills the existing `locationName`, `latitude`, and `longitude` event fields. Users can manually type or adjust all three fields, including the coordinate "pin" position. Saved complete coordinates drive the existing weather request and read-only detail map. Event detail always exposes location/coordinates and an external OpenStreetMap link; the iframe preview is supplementary and may fail without hiding that fallback. Search results and map previews visibly attribute OpenStreetMap contributors. Respect the [Nominatim public usage policy](https://operations.osmfoundation.org/policies/nominatim/): configure a monitored contact in the User-Agent, do not implement keystroke autocomplete, keep traffic low, and replace this public endpoint with a suitable provider if usage grows. Tests must stub the Athlora endpoint/provider boundary and must never call public OSM services.

### 4.6 Event participant

```
eventId, athleteId, rsvpStatus ('pending'|'yes'|'no'), statusReviewRequired,
athlete { id, name, squad, archivedAt, status }
```

Composite key `(eventId, athleteId)`. `rsvp_status` is CHECK-constrained. Participant responses include the athlete summary needed by event detail and live logging while keeping the assignment key explicit.

| Method & path | Purpose |
|---|---|
| `GET /events/:eventId/participants` | List assigned athletes in stable name order |
| `POST /events/:eventId/participants` | Assign an active owned athlete; body `{ athleteId }`, returns `201` |
| `PUT /events/:eventId/participants/:athleteId` | Idempotently replace RSVP status; body `{ rsvpStatus }` |
| `DELETE /events/:eventId/participants/:athleteId` | Remove the assignment; returns `204` |
| `POST /events/:eventId/participants/:athleteId/status-review/acknowledge` | Acknowledge that athlete's lifecycle review item; returns `204` |

Assignment defaults `rsvpStatus` to `pending`. A duplicate POST returns `409 PARTICIPANT_ALREADY_ASSIGNED`; archived and inactive athletes cannot be newly assigned and return `409 ATHLETE_ARCHIVED` and `409 ATHLETE_INACTIVE` respectively. A real lifecycle transition does not remove existing assignments; it creates a per-event, per-athlete review item. Coaches acknowledge review items independently, so a later change for one athlete cannot clear another athlete's alert. Removing an assignment deletes only the composite-key row: existing timeline entries and results remain intact. Malformed, missing, wrong-parent and cross-coach event/athlete/participant identifiers use the standard non-enumerating `404 NOT_FOUND` response.

### 4.7 Timeline entry (the live log)

```
id, eventId, athleteId, discipline ('100m'), entryType, value (number|null, seconds),
unit ('seconds'|null), isFoul, incidentType (string|null), noteText (string|null),
recordedBy, version, deviceId (string|null), createdAt, updatedAt, deletedAt (ISO|null)
```

- `entryType`: `attempt` | `split` | `penalty` | `note` (CHECK-constrained).
- `incidentType`: `false_start` | `dq` | `dnf` | `dns` | `lane_infringement` | null (CHECK-constrained).
- `value` is in seconds for the 100m contract; the API requires a positive finite number when present. The database retains its broader non-negative defensive constraint.
- `noteText` stores the free-text body of `note` entries (and is null otherwise).
- `isFoul` applies to field-event attempts only; it is always `false` for 100m.
- `deletedAt` is the soft-delete tombstone — undo is `deleted_at = now()`, never `DELETE`.
- `version` starts at 1 and is the required optimistic-concurrency precondition for edits and undo. A successful mutation bumps it once; an exact repeated undo does not. `deviceId` records the originating device and is not editable.

| Method & path | Purpose |
|---|---|
| `GET /events/:eventId/entries` | List active entries in stable `createdAt`, `id` order; tombstones are excluded |
| `POST /events/:eventId/entries` | Create a normalized entry; returns `201` |
| `PATCH /events/:eventId/entries/:entryId` | Correct observation content using the expected version |
| `DELETE /events/:eventId/entries/:entryId` | Create a versioned tombstone using the expected version; returns `204` |

Create request DTO: `athleteId`, `discipline` (optional, only exact `'100m'` accepted), `entryType`, `value`, `unit` (optional, only exact `'seconds'` accepted when a value is present), `isFoul`, `incidentType`, `noteText`, `deviceId` (optional). Discipline and unit are normalized to server constants rather than trusted as client-controlled values. `recordedBy` is taken from the authenticated user. A note requires non-blank `noteText` and cannot carry a value, unit, or incident. `isFoul` is always false for 100m.

Edit uses a sparse `PATCH` body containing required positive-integer `expectedVersion` plus at least one of `entryType`, `value`, `incidentType`, or `noteText`. Omitted content fields remain unchanged, explicit `null` clears nullable fields, and the merged entry state is revalidated. Audit and identity fields, including `deviceId`, are rejected. DELETE accepts only `{ expectedVersion }` and sets `deletedAt`; it never physically deletes a timeline row. A repeated DELETE with the same pre-delete version returns `204` without another version/timestamp bump or result recomputation.

A stale active edit or undo returns `409 TIMELINE_ENTRY_VERSION_CONFLICT` with `details: { expectedVersion, actualVersion }`. Version comparison, ownership, event/entry parent matching, lifecycle enforcement, persistence, and result recomputation occur under the same transaction lock, so a stale request cannot overwrite newer state. Missing, deleted-for-PATCH, wrong-parent, and cross-coach resources retain the generic `404 NOT_FOUND` response.

### 4.8 Result

```
eventId, athleteId, discipline ('100m'), outcome, finalResult (number|null, seconds),
unit ('seconds'|null), placing (number|null), isPb, isSb, manualOverride (number|null),
overrideReason (string|null), overriddenBy (string|null), overrideAt (ISO|null), updatedAt
```

- `outcome` is derived, never typed in by hand (see §2).
- `isPb`/`isSb` are derived flags, not manually logged.
- Override fields record a coach correction: `manualOverride` (positive finite seconds), `overrideReason`, `overriddenBy` (user id), `overrideAt` (timestamp). An override request supplies a non-blank reason with the value, or paired nulls to clear it. An override is stored alongside the derived `finalResult`, never replacing it.

| Method & path | Purpose |
|---|---|
| `GET /events/:eventId/results` | List the owned event's current 100m result rows in `{ data, meta: { count } }`. |
| `PUT /events/:eventId/results/:athleteId` | Set or clear that athlete's manual override. The body is `{ manualOverride, overrideReason }`; both fields are required, a positive override requires a non-blank reason, and clearing requires both values to be `null`. Returns `{ data: Result }`. |

Every override mutation locks the event/result set and recomputes the whole event so placements and PB/SB flags for other athletes remain authoritative.

**PB/SB rules:** `isPb` is true when the athlete's effective result is better (lower time) than every previously recorded effective result for the same discipline; `isSb` is true when it beats the best effective result recorded in the current season. A derived `valid` result or a `no_result` promoted by a manual override can count; voided outcomes do not. A manual override is what the statistic is computed from when present, while the response's `outcome` and `finalResult` remain the raw derived values for auditability.

**Placings:** `placing` is derived per event from effective results — derived valid results and `no_result` entries promoted by an override rank in ascending time (fastest places 1st), athletes with identical times share a place, and voided outcomes or uncorrected `no_result` entries carry `placing = null`.

### 4.9 Statistics

`GET /api/v1/athletes/:athleteId/statistics` returns one owner-scoped 100m summary and its purpose-built history in `{ data }`:

```
{
  athleteId, discipline ('100m'), unit ('seconds'), pb (number|null), sb (number|null),
  resultsCount, latestResult (number|null), latestOutcome, updatedAt,
  athlete: { id, name, squad, archivedAt },
  resultCounts: { allTime, currentYear, competitionAllTime, trainingAllTime },
  latest: AthleteResultHistoryEntry|null,
  recentResults: {
    competitions: AthleteResultHistoryEntry[],
    training: AthleteResultHistoryEntry[]
  }
}
```

- `pb` is the all-time fastest effective result; `sb` and `resultsCount` use the calendar year containing the server's UTC as-of date. The half-open year window is January 1 through January 1 of the next year.
- Counts include only effective `valid` results from non-cancelled events. A positive override can promote `no_result`; DQ/DNF/DNS remain void even when an override exists. Competition and training both contribute.
- `latestResult`/`latestOutcome` describe the most recent non-cancelled row. `latest` provides that row's event, athlete, raw `Result`, effective value/outcome and `countsTowardsStatistics` flag.
- Each recent collection returns at most ten rows. History includes cancelled rows with `countsTowardsStatistics: false` so preserved records remain visible, while aggregates exclude them.
- Direct access to an owned archived athlete remains available and preserves `archivedAt`; archival does not delete history.
- Ordering is event date descending, local time descending with nulls last, event creation descending, then event ID descending.
- An athlete without history receives null PB/SB/latest values, `latestOutcome: 'no_result'`, zero counts and empty competition/training arrays. Missing and cross-coach athletes use the standard non-enumerating `404`.

`AthleteResultHistoryEntry` has this stable shape:

```
{
  athlete: { id, name, squad, archivedAt },
  event: { id, title, type, discipline, date, time, locationName, status },
  result: Result,
  effectiveResult, effectiveOutcome, countsTowardsStatistics
}
```

### 4.10 Dashboard data

`GET /api/v1/dashboard/summary` returns one `{ data }` object with the same keys in summary and live modes:

```
{
  state ('summary'|'live'), asOfDate,
  athletesCount, activeAthletesCount, inactiveAthletesCount, archivedAthletesCount, statusReviewCount,
  upcomingEventCount, seasonPbs,
  activeEvent: DashboardActiveEvent|null,
  rosterSnapshot: RosterSnapshotEntry[],      // { athleteId, name, squad, discipline, pb }
  upcomingEvents: DashboardUpcomingEvent[],
  recentResults: AthleteResultHistoryEntry[],
  recentPbs: AthleteResultHistoryEntry[]
}
```

- `athletesCount` counts all owned athletes; `activeAthletesCount`, `inactiveAthletesCount`, and `archivedAthletesCount` make the lifecycle distribution explicit. `rosterSnapshot` includes active athletes only. `statusReviewCount` is the number of unacknowledged per-assignment lifecycle review items. Historical recent result/PB rows retain archived athlete identity.
- `upcomingEvents` are owned 100m `scheduled` events with `date >= asOfDate`; cancelled, completed, active and legacy non-100m events are not upcoming. Ordering is date/time/creation/ID ascending and `upcomingEventCount` mirrors the array length.
- `seasonPbs` counts non-cancelled `isPb` rows in the current calendar year. `recentResults` returns ten non-cancelled rows and `recentPbs` returns five non-cancelled PB rows, both in deterministic reverse event order.
- One active event is selected from owned 100m `in_progress` events by date ascending, time ascending with nulls last, creation ascending, then ID ascending. This is a presentation rule; multiple events may remain in progress.
- A live `activeEvent` contains the event identity, ten latest active timeline entries with athlete identity, and progress over its current participant set: participant count, distinct participants with active entries, resolved participant result count, active participant entry count, and rounded completion percentage. Effective valid/DQ/DNF/DNS outcomes are resolved; `no_result` is unresolved.
- No active event produces `state: 'summary'` and `activeEvent: null`. All collections remain present as empty arrays and all absent counts are zero, so clients never branch on missing keys.
- Dashboard subqueries execute in one read-only repeatable-read transaction and every athlete/event join is scoped to the authenticated application user.

## 5. 100m timing rules

- Track (timed) recording produces time values in **seconds**.
- The finishing time is read by `deriveTrackTime(entries, eventType)`: for **competition** events it is the **latest** valid `attempt` in the timeline (the final time, recorded after any splits); for **training** events it is the **fastest** (lowest) valid positive attempt. Splits are informational and are not aggregated into the result.
- Only active `attempt` entries count — soft-deleted entries and zero/negative/non-finite values are ignored.
- Any `dq`/`dnf`/`dns` incident voids the result (`outcome` dq/dnf/dns, `final_result = NULL`).
- `false_start` and `lane_infringement` are penalty incidents and do not void the result; a `dq` entry must be recorded to void it.
- No valid attempt → `outcome = 'no_result'`, `final_result = NULL`.

## 6. Implementation status

- Migrations `0002_contract_100m.sql` and `0003_aggregate_indexes.sql` apply the contract state and athlete/event/timeline aggregate lookup indexes through the checksum-tracked runner.
- `backend/src/types/domain.ts` and `frontend/src/types/index.ts` carry the aligned DTOs above.
- `backend/src/services/resultDerivation.ts` implements the §2 outcome mapping, the §5 competition/training timing rules, `deriveEffectiveResult` (manual override), `calculatePlacings` and `checkPbSb`.
- `backend/src/validation` provides strict shared payload parsers, `backend/src/db/row-mappers.ts` owns snake-case PostgreSQL serialization and deliberate numeric conversion, and `backend/src/db/transaction.ts` provides atomic mutation/recomputation transactions.
- `backend/src/services/athletes.ts` implements the §4.2 roster CRUD, lifecycle transitions/audit, and filtering behavior; the API route tests (`backend/src/routes/athletes.test.ts`) and service tests (`backend/src/services/athletes.test.ts`) cover idempotent actor-attributed transitions and assignment review flags, with a `TEST_DATABASE_URL`-gated integration suite (`backend/src/services/athletes.integration.test.ts`) proving archival preserves timeline entries and results.
- `frontend/src/features/athletes/AthletesPage.tsx` and `frontend/src/api/athletes.ts` implement the §4.2 coach workflow against those DTOs: list active/inactive/archived athletes, filter by name/squad/status, create, fully replace mutable fields, transition status, archive and restore. RTL and API-wrapper tests cover async states, strict payloads, validation, persistence feedback and keyboard interaction.
- `backend/src/services/events.ts` implements the §4.3 event CRUD, filters, status transitions, cancellation, and the in-progress logging guard; the API route tests (`backend/src/routes/events.test.ts`) and service tests (`backend/src/services/events.test.ts`) cover it, with a `TEST_DATABASE_URL`-gated integration suite (`backend/src/services/events.integration.test.ts`) proving the lifecycle, cancellation history, and cross-coach isolation.
- `frontend/src/features/events/EventsPage.tsx` and `frontend/src/api/events.ts` implement the §4.3 coach workflow: API-backed list/calendar views, local date/type/status filtering, strict create/full-replacement edit payloads, event detail, and confirmed start/complete/cancel transitions. RTL and API-wrapper tests cover asynchronous states, filters, payloads, validation, detail and lifecycle failures.
- `backend/src/services/participants.ts` implements the §4.5 assignment list/create/update/remove/review-acknowledgment behavior, active-athlete guard, duplicate conflict and history-preserving removal. Route/service tests cover the API and a `TEST_DATABASE_URL`-gated integration suite proves persistence, archival, idempotent updates, ownership isolation and preservation of timeline/results history.
- `frontend/src/features/events/EventsPage.tsx` and `frontend/src/api/participants.ts` implement the §4.5 coach workflow in event detail: assigned and active-roster loading, active-athlete assignment, RSVP replacement, per-athlete lifecycle review acknowledgment, inactive/archived historical participants, and confirmed relationship removal with preserved-history messaging. API-wrapper and RTL tests cover exact requests, independent retry states, mutation failures, async ordering and keyboard focus.
- `backend/src/services/timeline.ts` implements the §4.6 active-entry list and create/sparse-edit/soft-delete workflow with transactional ownership/lifecycle checks, optimistic version conflicts, retry-safe undo, and atomic §4.7 result, placing and PB/SB recomputation. Event replacement/cancellation invokes the same locked recomputation when type, chronology or scoring status changes. Route/service tests cover validation, envelopes, finish/incident/note edits, stale versions, tombstone exclusion, repeated undo and effective overrides; a `TEST_DATABASE_URL`-gated integration suite covers persistence, parent/coach isolation, competition/training timing, ranking and best flags.
- `frontend/src/api/timeline.ts` and `LiveLoggingPage` expose the active list, normalized create, version-aware entry-type-valid correction, accessible confirmed undo, finish/incident logging and live standings. Finish/correction inputs use hundredth precision and decimal mobile semantics so displayed 100m times do not hide ranking-significant digits. The logger verifies fresh event status before exposing controls, distinguishes exact stale-version and event-closed conflicts, serializes writes through authoritative standings refresh, and isolates secondary standings/history failures from core logging.
- Result read/override is live; override writes retain raw derivation and invoke canonical whole-event recomputation. The typed frontend wrapper and shared event-result view present effective competition/training outcomes in event detail and Live Logging, preserve backend tied placings/PB/SB, join active non-void penalties from the timeline, and show partial/historical rows. The correction workflow keeps raw derivation visible, requires a corrected time plus reason, exposes actor/time/reason, confirms paired-null clearing, and re-lists the whole event after mutation.
- `backend/src/services/statistics.ts` and `dashboard.ts` implement §§4.8-4.9 with owner-scoped effective-result SQL and repeatable-read snapshots. Route/service/mapper tests plus a `TEST_DATABASE_URL`-gated PostgreSQL suite cover empty/populated data, calendar boundaries, overrides, incidents, archives, cancellations, live selection and ownership. The athlete detail UI consumes the mirrored statistics/history contract with independent profile/statistics states and shared profile editing. The coach dashboard consumes the mirrored aggregate directly for deterministic summary/live modes, onboarding, active-event progress/latest entries, historical results/PBs and targeted console navigation.
- `backend/src/services/weather.ts` implements both §4.3 event-day forecasts and §4.4 current conditions against Open-Meteo, with service and route tests covering the stable DTOs, strict coordinates, provider outages, timeouts and malformed payloads. `frontend/src/api/weather.ts` and the console topbar consume the §4.4 readout contract with a geolocation → timezone-city fallback.

## AI declaration

This document was created with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol], and updated with the assistance of OpenCode[gpt-5.6-terra].
