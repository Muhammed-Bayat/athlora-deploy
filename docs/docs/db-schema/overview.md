---
sidebar_position: 1
---

# Database schema

PostgreSQL 13+. Every table uses UUID primary keys, `created_at`/`updated_at` timestamps, and soft deletes (`deleted_at`) where the app needs "undo" (`timeline_entries`, `results` uses update-in-place with an override trail).

The schema is the shared foundation for Athlora's full athletics-meet scope. The deployed API currently enforces the 100m/seconds contract, but `discipline`, `unit`, attempts, fouls, incidents, and result rows were modelled so subsequent track, relay, jump, throw, and vertical-event contracts can be introduced through coordinated migrations and application changes.

## Core tables

```
users                (id UUID PK, auth0_id UNIQUE, name, email UNIQUE, role)
workspaces           (id UUID PK, name, timezone)
workspace_members    (workspace_id -> workspaces, user_id -> users, role) — PK (workspace_id, user_id)
workspace_invitations (id UUID PK, workspace_id, email, role, token_hash, invited_by, expires_at,
                       accepted_at, accepted_by, revoked_at, revoked_by)
workspace_membership_audit (id UUID PK, workspace_id, user_id, actor_id, invitation_id, action, role)
athletes             (id UUID PK, workspace_id -> workspaces, coach_id -> users, name, dob, gender, notes,
                         lifecycle_status, archived_at, status_changed_at, status_changed_by, created_at, updated_at)
athlete_status_transitions (id UUID PK, workspace_id, athlete_id, from_status, to_status, changed_by, changed_at)
squads               (id UUID PK, workspace_id -> workspaces, name, archived_at, created_at, updated_at)
athlete_squads       (workspace_id, athlete_id -> athletes, squad_id -> squads) — PK (athlete_id, squad_id)
events               (id UUID PK, workspace_id -> workspaces, created_by -> users, type, discipline, title, date, time,
                        location_name, latitude, longitude, timezone, status, fixture_revision)
event_fixture_workspaces (event_id, workspace_id, role ('host'|'guest'), status, accepted_revision, contact_email,
                          joined_by, withdrawn_at, withdrawn_by) — PK (event_id, workspace_id)
fixture_invitations  (id UUID PK, event_id, target_workspace_id, email, revision, token_hash, status, invited_by,
                      expires_at, accepted_at, accepted_by, revoked_at, revoked_by)
fixture_invitation_responses (id UUID PK, invitation_id, revision, workspace_id, response, message, responded_by)
event_participants   (event_id, athlete_id, participant_workspace_id, rsvp_status) — PK (event_id, athlete_id)
event_participant_status_reviews (event_id, athlete_id, transition_id, lifecycle_status, flagged_at,
                                  acknowledged_at, acknowledged_by) — PK (event_id, athlete_id)
timeline_entries     (id UUID PK, event_id, athlete_id, discipline, entry_type, value, unit,
                      is_foul, incident_type, note_text, recorded_by, version, device_id, deleted_at)
results              (event_id, athlete_id, discipline, outcome, final_result, unit, placing,
                       is_pb, is_sb, manual_override, override_reason, overridden_by, override_at)
                       — PK (event_id, athlete_id, discipline)
account_deletions    (auth0_id TEXT PK, status, attempts, next_attempt_at, last_error,
                       requested_at, updated_at, completed_at)
```

### timeline_entries
The append-only live log — the heart of the app.

- `entry_type`: `attempt`, `split`, `penalty`, `note`.
- `value` + `unit`: seconds for time, metres/cm for distance/height. The deployed 100m contract accepts `seconds`; the wider unit model is reserved for later event contracts.
- `is_foul`: represents a field-event foul attempt. It is stored in the schema but the current 100m API always normalizes it to `false`.
- `incident_type`: `false_start`, `dq`, `dnf`, `dns`, `lane_infringement`.
- `note_text`: free-text body for `note` entries.
- `version`: starts at 1, is required as `expectedVersion` for PATCH/DELETE, and bumps once on each successful mutation. A mismatch is rejected before persistence.
- `device_id`: originating device for offline merge (Stage 3).
- `deleted_at`: "undo" is a soft delete, never `DELETE`; normal timeline reads and result derivation exclude tombstones. Repeating the same undo leaves its version and timestamps unchanged.

### squads and athlete_squads

`squads` is the workspace-owned catalogue of managed squad names. Names are case-insensitively unique inside a workspace and squads are archived rather than deleted. `athlete_squads` allows each athlete to belong to zero or more squads, prevents duplicate membership, and carries the workspace key so both foreign keys must resolve within the same workspace.

Migration `0007_workspace_squads.sql` backfills each distinct trimmed nonblank legacy `athletes.squad` value into a squad in that athlete's workspace and creates the matching membership. The old text column remains only for compatibility with pre-migration deployments; application reads and writes use the normalized tables.

### event_participants
The assignment set for an event. The composite primary key prevents duplicate event/athlete rows and `rsvp_status` defaults to `pending`.

- New assignments require an active athlete owned by the event's coach.
- Existing assignments remain visible if the athlete is later archived, preserving historical participation.
- RSVP status replacement is idempotent.
- Removing an assignment deletes only this join row; timeline entries and results reference the event and athlete directly and remain intact.
- Participant reads aggregate squad names with the athlete name and archive state, so multi-squad membership never duplicates a participant row.
- `participant_workspace_id` has composite foreign keys to both `(athlete_id, workspace_id)` and `(event_id, workspace_id)` fixture membership. An athlete therefore cannot be assigned to an event unless their workspace is explicitly participating in it.

### fixtures

Every event receives one `host` row in `event_fixture_workspaces`, including historical and newly-created single-workspace events. A guest row is created only after the email-bound invitation has been accepted by a coach in that guest workspace. The invitation token is stored only as a SHA-256 hash; invitation responses are immutable actor-attributed records.

`events.fixture_revision` starts at `1`. A material date/time/venue change or accepted-team change advances it and marks guest teams as requiring reacceptance without removing their roster rows. A participant workspace may be withdrawn, but its participant, timeline, and result rows remain to preserve history.

### athlete lifecycle

`athletes.lifecycle_status` is constrained to `active`, `inactive`, or `archived`. The current transition is recorded on the athlete row for efficient reads; `athlete_status_transitions` preserves every real change with its actor and timestamp. Legacy rows are backfilled as active or archived without fabricating an actor.

Any real transition upserts a pending `event_participant_status_reviews` row for each existing assignment. The `(event_id, athlete_id)` key makes a review item independent per athlete and a later transition resets only that athlete's acknowledgement. Historical participant, timeline, result, squad, and injury data remains untouched.

### results
Derived/materialized from `timeline_entries`. Recalculated after every entry change.

- `outcome`: `no_result` | `valid` | `dq` | `dnf` | `dns` — distinguishes no result, a valid finish, and voided outcomes.
- `final_result`: computed result value. The deployed contract writes a 100m finishing time; the schema and future derivation contracts also support best valid field attempts. It must be `NULL` for voided outcomes.
- `is_pb` / `is_sb`: derived flags, not manually logged.
- `manual_override`, `override_reason`, `overridden_by`, `override_at`: coach corrections with an audit trail (who corrected, when, and why).

## Ownership boundaries

Protected requests resolve the verified Auth0 subject to an active `workspace_members` row before resource access. `athletes.workspace_id` and `events.workspace_id` are the authorization boundary; dependent resources require their event and athlete to share that workspace. `coach_id`, `created_by`, `recorded_by` and `overridden_by` are audit actors, not ownership fields.

Ownership checks use owner-scoped queries and deliberately return the same generic `NOT_FOUND` response when an identifier is malformed, missing, attached to the wrong parent or belongs to another coach. This avoids revealing another coach's resource IDs. Fixture access is a separate, narrow allow-list: guest workspace queries must match an accepted `event_fixture_workspaces` row plus an `event_participants.participant_workspace_id` row for the requested athlete. No generic ownership query is relaxed for fixtures.

## Constraints and indexes

Migration `0002_contract_100m.sql` adds CHECK constraints and lookup indexes so invalid state cannot be written:

- `events`: `status` in `scheduled`/`in_progress`/`completed`/`cancelled`; `type` in `competition`/`training`; indexes on `(created_by)` and `(status, date)`.
- `event_participants`: `rsvp_status` in `pending`/`yes`/`no`; index on `(athlete_id)`.
- `timeline_entries`: `entry_type`, `incident_type` and `unit` domain checks; `value >= 0` when present; index on `(event_id, athlete_id, discipline)`.
- `results`: `outcome` domain check; `final_result >= 0`, `manual_override >= 0`, `placing > 0`; and outcome/value shape rules — voided outcomes (`dq`/`dnf`/`dns`) must not carry a `final_result`, `valid` finishes must, and `no_result` must not.

Migration `0003_aggregate_indexes.sql` adds the read-path indexes used by statistics and dashboard queries: `results(athlete_id, discipline, event_id)`, the full owner/status/event ordering on `events`, and a partial active-entry index on `timeline_entries(event_id, created_at DESC, id DESC) WHERE deleted_at IS NULL`.

Migration `0004_account_lifecycle.sql` adds a durable account-deletion tombstone keyed by Auth0 subject. Its `pending`/`failed`/`completed` state blocks stale-token synchronization and resource access and schedules idempotent cleanup retries through `next_attempt_at`.

Migration `0005_workspace_tenancy.sql` creates workspaces and membership roles, backfills one UTC workspace per legacy user without changing domain IDs, adds `workspace_id` to athletes/events, and adds optional event timezone overrides. Account departure deletes memberships but retains the local audit user and shared workspace history.

Migration `0006_workspace_roles_and_invitations.sql` converts legacy viewer roles to assistants, limits workspace roles to coach/assistant, and adds durable invitations plus membership audit events. Invitation tokens are persisted only as SHA-256 hashes.

Migration `0007_workspace_squads.sql` adds normalized workspace squads and multi-squad athlete memberships, including the legacy text migration and indexes used by roster filters.

Migration `0008_athlete_lifecycle.sql` adds authoritative athlete states, current actor/timestamp metadata, transition audit rows, and per-assignment coach-review records.

Migration `0009_intermediate_fixtures.sql` adds fixture workspace membership, hashed/versioned invitations and response history, material-change revisions, and composite participant foreign keys that enforce fixture-team roster ownership.

Migration `0010_fixture_workspace_status_index.sql` makes the fixture workspace status index non-unique so the host and any number of guest workspaces can independently share valid statuses such as `accepted`.

The current API contract is fixed to 100m only at the API/service boundary (see the API contract). That is the first delivered discipline, not the product limit: `discipline` remains free-form `TEXT` so the full athletics event set can be added with explicit migrations and contracts.

The event status **lifecycle** (forward-only transitions, `cancelled` terminal, logging open only while `in_progress`) is enforced by `backend/src/services/events.ts` rather than the schema: the CHECK constraint only pins the value set, so the state machine can evolve without a migration.

## Migration conventions

Migrations live in `backend/src/db/migrations`, one file per change, sequentially numbered. Never edit a migration after it has been merged — write a new one. From `backend`, run `npm run db:migrate`; applied names and checksums are recorded in `schema_migrations`.

## Current migration

`0001_init.sql` is the authoritative base schema; `0002_contract_100m.sql` adds the current 100m contract state; `0003_aggregate_indexes.sql` adds query indexes; `0004_account_lifecycle.sql` adds durable deletion state; `0005_workspace_tenancy.sql` adds shared workspace tenancy; `0006_workspace_roles_and_invitations.sql` adds workspace roles and invitations; `0007_workspace_squads.sql` normalizes athlete squads; `0008_athlete_lifecycle.sql` adds lifecycle state and transition review records; `0009_intermediate_fixtures.sql` adds cross-workspace fixture authorization; and `0010_fixture_workspace_status_index.sql` permits independent status tracking for multiple participating workspaces. Table and column names are fixed by the build spec (Section 5) and shared with the frontend types and API contracts. Never rename them without flagging to the team and updating the spec first.

Pending migrations are checksum-tracked and applied by the normal migration command or production startup:

```bash
cd backend
npm run db:migrate
```

## ERD

An ERD will be drafted from the dev plan's data model and reviewed as a team before further migrations are written.

## AI declaration

This document was created with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol], and updated with the assistance of OpenCode[gpt-5.6-terra] and opencode[gpt-5.6-sol].
