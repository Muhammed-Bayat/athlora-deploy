---
sidebar_position: 1
---

# Database schema

PostgreSQL 13+. Every table uses UUID primary keys, `created_at`/`updated_at` timestamps, and soft deletes (`deleted_at`) where the app needs "undo" (`timeline_entries`, `results` uses update-in-place with an override trail).

## Core tables

```
users                (id UUID PK, auth0_id UNIQUE, name, email UNIQUE, role)
athletes             (id UUID PK, coach_id -> users, name, dob, gender, squad, notes,
                      archived_at, created_at, updated_at)
events               (id UUID PK, created_by -> users, type, discipline, title, date, time,
                      location_name, latitude, longitude, status)
event_participants   (event_id, athlete_id, rsvp_status)   — PK (event_id, athlete_id)
timeline_entries     (id UUID PK, event_id, athlete_id, discipline, entry_type, value, unit,
                      is_foul, incident_type, note_text, recorded_by, version, device_id, deleted_at)
results              (event_id, athlete_id, discipline, outcome, final_result, unit, placing,
                      is_pb, is_sb, manual_override, override_reason, overridden_by, override_at)
                      — PK (event_id, athlete_id, discipline)
```

### timeline_entries
The append-only live log — the heart of the app.

- `entry_type`: `attempt`, `split`, `penalty`, `note`.
- `value` + `unit`: seconds for time, metres/cm for distance/height. For the 100m contract the unit is `seconds`.
- `is_foul`: field-event foul attempts.
- `incident_type`: `false_start`, `dq`, `dnf`, `dns`, `lane_infringement`.
- `note_text`: free-text body for `note` entries.
- `version`: bumped on every edit — used for merge-conflict detection (Stage 3).
- `device_id`: originating device for offline merge (Stage 3).
- `deleted_at`: "undo" is a soft delete, never `DELETE`.

### event_participants
The assignment set for an event. The composite primary key prevents duplicate event/athlete rows and `rsvp_status` defaults to `pending`.

- New assignments require an active athlete owned by the event's coach.
- Existing assignments remain visible if the athlete is later archived, preserving historical participation.
- RSVP status replacement is idempotent.
- Removing an assignment deletes only this join row; timeline entries and results reference the event and athlete directly and remain intact.
- Participant reads join the athlete name, squad and archive state for event detail and live-logger selection.

### results
Derived/materialized from `timeline_entries`. Recalculated after every entry change.

- `outcome`: `no_result` | `valid` | `dq` | `dnf` | `dns` — distinguishes no result, a valid finish, and voided outcomes.
- `final_result`: computed value (best valid field attempt, finishing time). Must be `NULL` for voided outcomes.
- `is_pb` / `is_sb`: derived flags, not manually logged.
- `manual_override`, `override_reason`, `overridden_by`, `override_at`: coach corrections with an audit trail (who corrected, when, and why).

## Ownership boundaries

Protected requests resolve the verified Auth0 subject to `users.id` before resource access. Direct ownership is `athletes.coach_id` for athletes and `events.created_by` for events. Timeline entries, participants and results are authorized through both parent relationships: the event must have been created by the current user and the athlete must belong to that user. `recorded_by` and `overridden_by` are audit actors, not ownership fields.

Ownership checks use owner-scoped queries and deliberately return the same generic `NOT_FOUND` response when an identifier is malformed, missing, attached to the wrong parent or belongs to another coach. This avoids revealing another coach's resource IDs. The policy is centralized in `backend/src/services/ownership.ts` so the Stage 2 sharing model can replace it consistently when assistants and cross-coach fixtures are introduced.

## Constraints and indexes

Migration `0002_contract_100m.sql` adds CHECK constraints and lookup indexes so invalid state cannot be written:

- `events`: `status` in `scheduled`/`in_progress`/`completed`/`cancelled`; `type` in `competition`/`training`; indexes on `(created_by)` and `(status, date)`.
- `event_participants`: `rsvp_status` in `pending`/`yes`/`no`; index on `(athlete_id)`.
- `timeline_entries`: `entry_type`, `incident_type` and `unit` domain checks; `value >= 0` when present; index on `(event_id, athlete_id, discipline)`.
- `results`: `outcome` domain check; `final_result >= 0`, `manual_override >= 0`, `placing > 0`; and outcome/value shape rules — voided outcomes (`dq`/`dnf`/`dns`) must not carry a `final_result`, `valid` finishes must, and `no_result` must not.

The MVP discipline is fixed to 100m only at the API/service boundary (see the API contract) — the database `discipline` column stays free-form `TEXT` so future disciplines can be added by new migrations.

The event status **lifecycle** (forward-only transitions, `cancelled` terminal, logging open only while `in_progress`) is enforced by `backend/src/services/events.ts` rather than the schema: the CHECK constraint only pins the value set, so the state machine can evolve without a migration.

## Migration conventions

Migrations live in `backend/src/db/migrations`, one file per change, sequentially numbered. Never edit a migration after it has been merged — write a new one. From `backend`, run `npm run db:migrate`; applied names and checksums are recorded in `schema_migrations`.

## Current migration

`0001_init.sql` — the full authoritative base schema, followed by `0002_contract_100m.sql` which adds the MVP contract state (athlete archival, result outcomes, override audit timestamp, note storage, domain constraints and indexes). Table and column names are fixed by the build spec (Section 5) and shared with the frontend types and API contracts. Never rename them without flagging to the team and updating the spec first.

Status: applied to the Neon development database and tracked in `schema_migrations`. New databases and pending migrations are handled with:

```bash
cd backend
npm run db:migrate
```

## ERD

An ERD will be drafted from the dev plan's data model and reviewed as a team before further migrations are written.

## AI declaration

This document was generated with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol].
