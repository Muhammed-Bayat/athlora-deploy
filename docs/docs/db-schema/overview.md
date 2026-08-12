---
sidebar_position: 1
---

# Database schema

PostgreSQL 13+. Every table uses UUID primary keys, `created_at`/`updated_at` timestamps, and soft deletes (`deleted_at`) where the app needs "undo" (`timeline_entries`, `results` uses update-in-place with an override trail).

## Core tables

```
users                (id UUID PK, auth0_id UNIQUE, name, email UNIQUE, role)
athletes             (id UUID PK, coach_id -> users, name, dob, gender, squad, notes)
events               (id UUID PK, created_by -> users, type, discipline, title, date, time,
                      location_name, latitude, longitude, status)
event_participants   (event_id, athlete_id, rsvp_status)   — PK (event_id, athlete_id) — Stage 2
timeline_entries     (id UUID PK, event_id, athlete_id, discipline, entry_type, value, unit,
                      is_foul, incident_type, recorded_by, version, device_id, deleted_at)
results              (event_id, athlete_id, discipline, final_result, unit, placing,
                      is_pb, is_sb, manual_override, override_reason, overridden_by)
                      — PK (event_id, athlete_id, discipline)
```

### timeline_entries
The append-only live log — the heart of the app.

- `entry_type`: `attempt`, `split`, `penalty`, `note`.
- `value` + `unit`: seconds for time, metres/cm for distance/height.
- `is_foul`: field-event foul attempts.
- `incident_type`: `false_start`, `dq`, `dnf`, `dns`, `lane_infringement`.
- `version`: bumped on every edit — used for merge-conflict detection (Stage 3).
- `device_id`: originating device for offline merge (Stage 3).
- `deleted_at`: "undo" is a soft delete, never `DELETE`.

### results
Derived/materialized from `timeline_entries`. Recalculated after every entry change.

- `final_result`: computed value (best valid field attempt, finishing time).
- `is_pb` / `is_sb`: derived flags, not manually logged.
- `manual_override`, `override_reason`, `overridden_by`: coach corrections with an audit trail.

## Migration conventions

Migrations live in `backend/src/db/migrations`, one file per change, sequentially numbered. Never edit a migration after it has been merged — write a new one.

## Current migration

`0001_init.sql` — the full authoritative schema. Table and column names are fixed by the build spec (Section 5) and shared with the frontend types and API contracts. Never rename them without flagging to the team and updating the spec first.

Status: committed in the repo; **not yet applied** to a live database. Until a database is provisioned, apply it with:

```bash
psql "$DATABASE_URL" -f backend/src/db/migrations/0001_init.sql
```

## ERD

An ERD will be drafted from the dev plan's data model and reviewed as a team before further migrations are written.

## AI declaration

This document was generated with the assistance of opencode[deepseek-v4-flash-free].