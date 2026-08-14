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

All application resource routes require `Authorization: Bearer <auth0 JWT>`.

## 4. DTOs

Field names are camelCase on the wire. Every date/time is an ISO string. `createdAt`/`updatedAt` (and `archivedAt`, `overrideAt`) are `timestamptz` ISO 8601 strings.

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

Athlete create/update request DTO: `name` (required), `dob`, `gender`, `squad`, `notes` — all optional except `name`. `archivedAt` is set via a dedicated archive/unarchive action, not through the generic update.

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

Event create/update request DTO: `type` (required), `discipline`, `title` (required), `date` (required), `time`, `locationName`, `latitude`, `longitude`, `status` (create defaults to `scheduled`).

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
- `value` is in seconds for the 100m contract; must be non-negative when present (CHECK-constrained).
- `noteText` stores the free-text body of `note` entries (and is null otherwise).
- `isFoul` applies to field-event attempts only; it is always `false` for 100m.
- `deletedAt` is the soft-delete tombstone — undo is `deleted_at = now()`, never `DELETE`.
- `version` starts at 1 and bumps on every edit (Stage 3 merge conflict detection); `deviceId` is set when the entry originated offline.

Create request DTO: `athleteId`, `discipline` (defaults `'100m'`), `entryType`, `value`, `unit` (defaults `'seconds'` for timed entries), `isFoul`, `incidentType`, `noteText`, `deviceId` (optional). `recordedBy` is taken from the authenticated user. Edit/undo: `PATCH /events/:eventId/entries/:entryId` and `DELETE /events/:eventId/entries/:entryId` (soft delete).

### 4.6 Result

```
eventId, athleteId, discipline ('100m'), outcome, finalResult (number|null, seconds),
unit ('seconds'|null), placing (number|null), isPb, isSb, manualOverride (number|null),
overrideReason (string|null), overriddenBy (string|null), overrideAt (ISO|null), updatedAt
```

- `outcome` is derived, never typed in by hand (see §2).
- `isPb`/`isSb` are derived flags, not manually logged.
- Override fields record a coach correction: `manualOverride` (non-negative seconds), `overrideReason`, `overriddenBy` (user id), `overrideAt` (timestamp). An override is stored alongside the derived `finalResult`, never replacing it.

**PB/SB rules:** `isPb` is true when the athlete's result is better (lower time) than every previously recorded result for the same discipline; `isSb` is true when it beats the best result recorded in the current season. Only `outcome = 'valid'` results count toward PB/SB; voided outcomes do not. A manual override is what the statistic is computed from when present.

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
- The finishing time is the largest valid `attempt` value recorded for the athlete (the final time, later than any splits); splits are informational and are not aggregated into the result.
- Any `dq`/`dnf`/`dns` incident voids the result (`outcome` dq/dnf/dns, `final_result = NULL`).
- `false_start` and `lane_infringement` are penalty incidents; a `dq` entry must be recorded to void the result.
- No valid attempt → `outcome = 'no_result'`, `final_result = NULL`.

## 6. Implementation status

- Migration `0002_contract_100m.sql` applies the column additions, constraints and indexes described above; applied to fresh and existing databases via the checksum-tracked runner.
- `backend/src/types/domain.ts` and `frontend/src/types/index.ts` carry the aligned DTOs above.
- `backend/src/services/resultDerivation.ts` derives `{ value, incident, outcome }` per the §2 mapping.
- Feature endpoints (athletes/events/timeline/results/statistics/dashboard CRUD) implement against this contract in Stage 1.

## AI declaration

This document was generated with the assistance of opencode[deepseek-v4-flash-free].
