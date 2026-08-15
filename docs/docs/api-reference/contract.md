---
sidebar_position: 1
---

# 100m data/API contract

The authoritative contract every Stage 1 feature workstream implements against. It fixes the MVP discipline to **100m** (track, timed) and the result unit to **seconds** at the API/service boundary, and defines the request/response DTOs for athletes, events, participants, timeline entries, results, statistics, and dashboard data.

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

All application resource routes require `Authorization: Bearer <auth0 JWT>` and a synchronized application-user row.

### 3.1 Authentication context and ownership

`PUT /api/v1/auth/me` verifies the Auth0 token and synchronizes its subject/profile to `users`; it intentionally does not require an existing `users` row. Every protected resource route performs a second step after JWT verification: it resolves the verified Auth0 `sub` by `users.auth0_id` and exposes the application user UUID, Auth0 ID and role to controllers through typed request context.

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

Resource ownership is server-derived: athlete access uses `athletes.coach_id`; event access uses `events.created_by`; timeline entry, participant and result access requires both the parent event and athlete to belong to the current user. `recordedBy` and `overriddenBy` are audit actors, not owners. Client mutation payloads never control `coachId`, `createdBy`, `recordedBy` or `overriddenBy`.

To prevent resource enumeration, a malformed identifier, nonexistent row, wrong parent relationship and cross-coach row all return the same `404 NOT_FOUND` response with message `Resource not found` and empty details.

## 4. DTOs

Field names are camelCase on the wire. Calendar dates are real Gregorian `YYYY-MM-DD` values. Local event clock times accept `HH:mm` or `HH:mm:ss` and are serialized as `HH:mm:ss` without timezone conversion. `createdAt`/`updatedAt` (and `archivedAt`, `overrideAt`) are `timestamptz` ISO 8601 strings.

### 4.1 User

```
id, auth0Id, name, email, role ('coach'|'assistant'|'viewer'), createdAt, updatedAt
```

### 4.2 Athlete

```
id, coachId, name, dob (ISO date|null), gender (string|null), squad (string|null),
notes (string|null), archivedAt (ISO|null), createdAt, updatedAt
```

**Archival rule:** an athlete is archived when `archivedAt` is non-null. Archiving is reversible (set back to null); it is not deletion. Archived athletes are excluded from roster and dashboard summaries by default.

Athlete create/full-replacement request DTO: `name` (required), `dob`, `gender`, `squad`, `notes` — all optional except `name`. `PUT` is a full replacement, so omitted nullable fields become `null`. `archivedAt` is set via a dedicated archive/unarchive action, not through the generic update.

### 4.3 Event

```
id, createdBy, type ('competition'|'training'), discipline ('100m'|null), title, date (ISO date),
time (ISO|null), locationName (string|null), latitude (number|null), longitude (number|null),
status, createdAt, updatedAt
```

`discipline` is nullable to represent multi-discipline meets.

**Event states** (`status`, CHECK-constrained):

| State | Meaning |
|---|---|
| `scheduled` | Planned, not started (default) |
| `in_progress` | Live event; timeline logging is open |
| `completed` | Logging closed; results finalised |
| `cancelled` | Called off; results/entries for it are not scored |

**Cancellation rule:** cancelling an event keeps its timeline entries and results rows but marks them non-scoring; the dashboard and statistics ignore cancelled events. `cancelled` is not a delete.

Event create/full-replacement request DTO: `type` (required), `discipline`, `title` (required), `date` (required), `time`, `locationName`, `latitude`, `longitude`, `status` (create defaults to `scheduled`; full replacement requires it). `PUT` is a full replacement, so omitted nullable fields become `null`. Coordinates must be finite numbers in the inclusive latitude range `-90..90` and longitude range `-180..180`.

### 4.4 Event participant

```
eventId, athleteId, rsvpStatus ('pending'|'yes'|'no')
```

Composite key `(eventId, athleteId)`. `rsvp_status` is CHECK-constrained. Used for fixtures and participation (Stage 2 wiring).

### 4.5 Timeline entry (the live log)

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
- `version` starts at 1 and bumps on every edit (Stage 3 merge conflict detection); `deviceId` is set when the entry originated offline.

Create request DTO: `athleteId`, `discipline` (optional, only exact `'100m'` accepted), `entryType`, `value`, `unit` (optional, only exact `'seconds'` accepted when a value is present), `isFoul`, `incidentType`, `noteText`, `deviceId` (optional). Discipline and unit are normalized to server constants rather than trusted as client-controlled values. `recordedBy` is taken from the authenticated user. A note requires non-blank `noteText` and cannot carry a value, unit, or incident. `isFoul` is always false for 100m. Edit uses a sparse, non-empty `PATCH`; omitted fields remain unchanged, explicit `null` clears nullable fields, and the merged entry state is revalidated. Undo uses `DELETE /events/:eventId/entries/:entryId` as a soft delete.

### 4.6 Result

```
eventId, athleteId, discipline ('100m'), outcome, finalResult (number|null, seconds),
unit ('seconds'|null), placing (number|null), isPb, isSb, manualOverride (number|null),
overrideReason (string|null), overriddenBy (string|null), overrideAt (ISO|null), updatedAt
```

- `outcome` is derived, never typed in by hand (see §2).
- `isPb`/`isSb` are derived flags, not manually logged.
- Override fields record a coach correction: `manualOverride` (positive finite seconds), `overrideReason`, `overriddenBy` (user id), `overrideAt` (timestamp). An override request supplies a non-blank reason with the value, or paired nulls to clear it. An override is stored alongside the derived `finalResult`, never replacing it.

**PB/SB rules:** `isPb` is true when the athlete's result is better (lower time) than every previously recorded result for the same discipline; `isSb` is true when it beats the best result recorded in the current season. Only `outcome = 'valid'` results count toward PB/SB; voided outcomes do not. A manual override is what the statistic is computed from when present.

**Placings:** `placing` is derived per event — valid results rank in ascending time (fastest places 1st), athletes with identical times share a place, and voided outcomes or `no_result` entries carry `placing = null`.

### 4.7 Statistics

```
athleteId, discipline ('100m'), unit ('seconds'), pb (number|null), sb (number|null),
resultsCount, latestResult (number|null), latestOutcome, updatedAt
```

- `pb`/`sb` follow the PB/SB rules above.
- `resultsCount` counts scoring (non-voided) results for the athlete in the current season.
- `latestResult`/`latestOutcome` describe the athlete's most recent result by event date.

### 4.8 Dashboard data

```
{
  athletesCount, activeAthletesCount, upcomingEventCount, seasonPbs,
  rosterSnapshot: RosterSnapshotEntry[],      // { athleteId, name, squad, discipline, pb }
  upcomingEvents: DashboardUpcomingEvent[]    // { eventId, title, type, date, status, athleteCount }
}
```

- `activeAthletesCount` counts non-archived athletes.
- `upcomingEvents` are non-cancelled events with `date >= today`, ordered ascending; `upcomingEventCount` mirrors its length.
- `seasonPbs` counts results flagged `isPb` this season across the squad.
- `rosterSnapshot` excludes archived athletes.

## 5. 100m timing rules

- Track (timed) recording produces time values in **seconds**.
- The finishing time is read by `deriveTrackTime(entries, eventType)`: for **competition** events it is the **latest** valid `attempt` in the timeline (the final time, recorded after any splits); for **training** events it is the **fastest** (lowest) valid positive attempt. Splits are informational and are not aggregated into the result.
- Only active `attempt` entries count — soft-deleted entries and zero/negative/non-finite values are ignored.
- Any `dq`/`dnf`/`dns` incident voids the result (`outcome` dq/dnf/dns, `final_result = NULL`).
- `false_start` and `lane_infringement` are penalty incidents and do not void the result; a `dq` entry must be recorded to void it.
- No valid attempt → `outcome = 'no_result'`, `final_result = NULL`.

## 6. Implementation status

- Migration `0002_contract_100m.sql` applies the column additions, constraints and indexes described above; applied to fresh and existing databases via the checksum-tracked runner.
- `backend/src/types/domain.ts` and `frontend/src/types/index.ts` carry the aligned DTOs above.
- `backend/src/services/resultDerivation.ts` implements the §2 outcome mapping, the §5 competition/training timing rules, `deriveEffectiveResult` (manual override), `calculatePlacings` and `checkPbSb`.
- `backend/src/validation` provides strict shared payload parsers, `backend/src/db/row-mappers.ts` owns snake-case PostgreSQL serialization and deliberate numeric conversion, and `backend/src/db/transaction.ts` provides atomic mutation/recomputation transactions.
- Feature endpoints (athletes/events/timeline/results/statistics/dashboard CRUD) implement against this contract in Stage 1.

## AI declaration

This document was generated with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol].
