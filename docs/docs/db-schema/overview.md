---
sidebar_position: 1
---

# Database schema

This is the single AI-ready reference for Athlora's final database schema. It is derived from every SQL migration in `backend/src/db/migrations/` as of migration `0026_user_preferences.sql`. The migrations remain the executable source of truth; use this page together with them when a tool needs an ERD or schema analysis.

PostgreSQL 13+ is required because the schema uses `gen_random_uuid()`. Types below use PostgreSQL names. `PK` means primary key, `FK` means foreign key, `UQ` means unique constraint or unique index, and `NULL` means nullable.

## Entity relationship diagram

The diagram below reflects the schema documented on this page. Open the [SVG ERD](/img/erd.svg) for a zoomable version.

<img src="/img/erd.svg" alt="Athlora database entity relationship diagram" />

## Relationship summary

- A `club` maps one-to-one to a `workspace`.
- A `workspace` has one or more `workspace_members`, but a user can belong to only one workspace.
- Athletes, events, squads, injuries, reminders, and notifications are workspace-scoped.
- Events own fixture participation, invitations, participants, live-log entries, results, helpers, public logger links, and offline-sync receipts.
- `timeline_entries` are created by exactly one actor: either an authenticated `users` row or a `public_logger_sessions` row.
- Results are materialized from the timeline and are unique per event, athlete, and discipline.
- A user's dashboard preferences are stored per `(user, workspace)` pair.

## Final relational schema

### Identity, workspace, and club tables

```text
users
  id UUID PK DEFAULT gen_random_uuid()
  auth0_id TEXT UQ NOT NULL
  name TEXT NOT NULL
  email TEXT UQ NOT NULL
  role TEXT NOT NULL DEFAULT 'coach' CHECK ('coach', 'assistant')
  consent_accepted_at TIMESTAMPTZ NULL
  consent_version TEXT NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

workspaces
  id UUID PK DEFAULT gen_random_uuid()
  name TEXT NOT NULL
  timezone TEXT NOT NULL DEFAULT 'UTC'
    CHECK (IANA-style region/city value or 'UTC')
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

workspace_members
  workspace_id UUID PK, FK -> workspaces.id ON DELETE CASCADE
  user_id UUID PK, FK -> users.id ON DELETE CASCADE, UQ
  role TEXT NOT NULL DEFAULT 'coach' CHECK ('coach', 'assistant')
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

workspace_invitations
  id UUID PK DEFAULT gen_random_uuid()
  workspace_id UUID FK -> workspaces.id ON DELETE CASCADE
  email TEXT NOT NULL
  role TEXT NOT NULL CHECK ('coach', 'assistant')
  token_hash TEXT UQ NOT NULL
  invited_by UUID FK -> users.id
  expires_at TIMESTAMPTZ NOT NULL
  accepted_at TIMESTAMPTZ NULL
  accepted_by UUID FK -> users.id NULL
  revoked_at TIMESTAMPTZ NULL
  revoked_by UUID FK -> users.id NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()

workspace_membership_audit
  id UUID PK DEFAULT gen_random_uuid()
  workspace_id UUID FK -> workspaces.id ON DELETE CASCADE
  user_id UUID FK -> users.id NULL
  actor_id UUID FK -> users.id NULL
  invitation_id UUID FK -> workspace_invitations.id NULL
  action TEXT NOT NULL CHECK ('invited', 'resent', 'accepted', 'revoked', 'removed', 'role_changed')
  role TEXT NULL CHECK ('coach', 'assistant')
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()

clubs
  id UUID PK DEFAULT gen_random_uuid()
  workspace_id UUID FK -> workspaces.id ON DELETE CASCADE, UQ
  name TEXT NOT NULL
  public_results_enabled BOOLEAN NOT NULL DEFAULT false
  public_schedule_enabled BOOLEAN NOT NULL DEFAULT false
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

club_join_requests
  id UUID PK DEFAULT gen_random_uuid()
  club_id UUID FK -> clubs.id ON DELETE CASCADE
  user_id UUID FK -> users.id ON DELETE CASCADE
  status TEXT NOT NULL DEFAULT 'pending' CHECK ('pending', 'approved', 'rejected', 'withdrawn')
  reviewed_by UUID FK -> users.id NULL
  reviewed_at TIMESTAMPTZ NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  CHECK: reviewed_at is present exactly for approved/rejected requests
  UQ partial: one pending request per (club_id, user_id)

user_preferences
  user_id UUID PK, FK -> users.id ON DELETE CASCADE
  workspace_id UUID PK, FK -> workspaces.id ON DELETE CASCADE
  dashboard_card_order JSONB NOT NULL DEFAULT '[]'
  dashboard_hidden_cards JSONB NOT NULL DEFAULT '[]'
  dashboard_saved_filters JSONB NOT NULL DEFAULT '[]'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

account_deletions
  auth0_id TEXT PK
  status TEXT NOT NULL CHECK ('pending', 'failed', 'completed')
  attempts INTEGER NOT NULL DEFAULT 0
  next_attempt_at TIMESTAMPTZ NULL
  last_error TEXT NULL
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  completed_at TIMESTAMPTZ NULL
```

### Athletes, squads, lifecycle, and injuries

```text
athletes
  id UUID PK DEFAULT gen_random_uuid()
  coach_id UUID FK -> users.id
  workspace_id UUID FK -> workspaces.id NOT NULL
  name TEXT NOT NULL
  dob DATE NULL
  gender TEXT NULL
  squad TEXT NULL                         -- legacy compatibility field
  notes TEXT NULL
  archived_at TIMESTAMPTZ NULL
  lifecycle_status TEXT NOT NULL DEFAULT 'active'
    CHECK ('active', 'inactive', 'archived')
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  status_changed_by UUID FK -> users.id NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  UQ (id, workspace_id)                   -- composite target for workspace-safe FKs

squads
  id UUID PK DEFAULT gen_random_uuid()
  workspace_id UUID FK -> workspaces.id ON DELETE CASCADE
  name TEXT NOT NULL CHECK (trim(name) <> '')
  archived_at TIMESTAMPTZ NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  UQ index (workspace_id, lower(name))
  UQ (id, workspace_id)                   -- composite target for workspace-safe FKs

athlete_squads
  athlete_id UUID PK, FK -> athletes.id ON DELETE CASCADE
  squad_id UUID PK, FK -> squads.id ON DELETE RESTRICT
  workspace_id UUID NOT NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  FK (athlete_id, workspace_id) -> athletes(id, workspace_id) ON DELETE CASCADE
  FK (squad_id, workspace_id) -> squads(id, workspace_id) ON DELETE RESTRICT

athlete_status_transitions
  id UUID PK DEFAULT gen_random_uuid()
  workspace_id UUID FK -> workspaces.id ON DELETE CASCADE
  athlete_id UUID NOT NULL
  from_status TEXT NULL CHECK ('active', 'inactive', 'archived')
  to_status TEXT NOT NULL CHECK ('active', 'inactive', 'archived')
  changed_by UUID FK -> users.id ON DELETE SET NULL, NULL
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  FK (athlete_id, workspace_id) -> athletes(id, workspace_id) ON DELETE CASCADE

athlete_injuries
  id UUID PK DEFAULT gen_random_uuid()
  workspace_id UUID FK -> workspaces.id ON DELETE CASCADE
  athlete_id UUID NOT NULL
  body_region TEXT NOT NULL CHECK ('Head & Neck', 'Torso', 'Arm', 'Leg')
  area TEXT NOT NULL
  side TEXT NOT NULL CHECK ('Left', 'Right', 'Both', 'Center')
  severity TEXT NOT NULL CHECK ('Minor', 'Moderate', 'Severe')
  notes TEXT NULL
  occurrence_date DATE NULL
  expected_return_date DATE NULL
  resolved_date TIMESTAMPTZ NULL
  resolution_notes TEXT NULL
  created_by UUID FK -> users.id
  updated_by UUID FK -> users.id NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  deleted_at TIMESTAMPTZ NULL
  deleted_by UUID FK -> users.id NULL
  FK (athlete_id, workspace_id) -> athletes(id, workspace_id) ON DELETE CASCADE
  CHECK: when occurrence_date is present, expected return and resolution cannot precede it
```

### Events, fixtures, participants, and RSVP audit

```text
events
  id UUID PK DEFAULT gen_random_uuid()
  created_by UUID FK -> users.id
  workspace_id UUID FK -> workspaces.id NOT NULL
  type TEXT NOT NULL CHECK ('competition', 'training')
  discipline TEXT NULL
  title TEXT NOT NULL
  date DATE NOT NULL
  time TIME NULL
  location_name TEXT NULL
  latitude NUMERIC(9,6) NULL
  longitude NUMERIC(9,6) NULL
  timezone TEXT NULL
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK ('scheduled', 'in_progress', 'completed', 'cancelled')
  fixture_revision INTEGER NOT NULL DEFAULT 1 CHECK (> 0)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

event_fixture_workspaces
  event_id UUID PK, FK -> events.id ON DELETE CASCADE
  workspace_id UUID PK, FK -> workspaces.id ON DELETE RESTRICT
  role TEXT NOT NULL CHECK ('host', 'guest')
  status TEXT NOT NULL DEFAULT 'accepted'
    CHECK ('accepted', 'reacceptance_required', 'withdrawn')
  accepted_revision INTEGER NOT NULL DEFAULT 1 CHECK (> 0)
  contact_email TEXT NULL
  joined_by UUID FK -> users.id ON DELETE SET NULL, NULL
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
  withdrawn_at TIMESTAMPTZ NULL
  withdrawn_by UUID FK -> users.id ON DELETE SET NULL, NULL
  CHECK: hosts have no contact email; guests require one
  UQ partial: one host per event

fixture_invitations
  id UUID PK DEFAULT gen_random_uuid()
  event_id UUID FK -> events.id ON DELETE CASCADE
  target_workspace_id UUID FK -> workspaces.id ON DELETE RESTRICT, NULL
  email TEXT NULL                          -- legacy email invitations; targeted invitations need no email
  revision INTEGER NOT NULL CHECK (> 0)
  token_hash TEXT UQ NOT NULL
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK ('pending', 'accepted', 'declined', 'change_requested', 'revoked')
  invited_by UUID FK -> users.id ON DELETE RESTRICT
  expires_at TIMESTAMPTZ NOT NULL
  accepted_at TIMESTAMPTZ NULL
  accepted_by UUID FK -> users.id ON DELETE SET NULL, NULL
  revoked_at TIMESTAMPTZ NULL
  revoked_by UUID FK -> users.id ON DELETE SET NULL, NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  CHECK: accepted_at exists exactly when status is accepted
  CHECK: revoked_at exists exactly when status is revoked

fixture_invitation_responses
  id UUID PK DEFAULT gen_random_uuid()
  invitation_id UUID FK -> fixture_invitations.id ON DELETE CASCADE
  revision INTEGER NOT NULL CHECK (> 0)
  workspace_id UUID FK -> workspaces.id ON DELETE RESTRICT, NULL
  response TEXT NOT NULL CHECK ('accepted', 'declined', 'change_requested')
  message TEXT NULL
  responded_by UUID FK -> users.id ON DELETE RESTRICT
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  CHECK: message exists exactly when response is change_requested

event_participants
  event_id UUID PK, FK -> events.id
  athlete_id UUID PK, FK -> athletes.id
  participant_workspace_id UUID NOT NULL
  rsvp_status TEXT NOT NULL DEFAULT 'pending' CHECK ('pending', 'yes', 'no', 'maybe')
  rsvp_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  rsvp_updated_by UUID FK -> users.id NULL
  FK (athlete_id, participant_workspace_id) -> athletes(id, workspace_id) ON DELETE RESTRICT
  FK (event_id, participant_workspace_id) -> event_fixture_workspaces(event_id, workspace_id) ON DELETE RESTRICT

event_participant_rsvp_audit
  id UUID PK DEFAULT gen_random_uuid()
  event_id UUID NOT NULL                  -- intentionally no declared FK
  athlete_id UUID NOT NULL                -- intentionally no declared FK
  previous_status TEXT NOT NULL
  next_status TEXT NOT NULL
  changed_by UUID FK -> users.id
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  batch_id UUID NULL

event_participant_status_reviews
  event_id UUID PK, FK -> events.id ON DELETE CASCADE
  athlete_id UUID PK, FK -> athletes.id ON DELETE CASCADE
  transition_id UUID FK -> athlete_status_transitions.id ON DELETE CASCADE
  lifecycle_status TEXT NOT NULL CHECK ('active', 'inactive', 'archived')
  flagged_at TIMESTAMPTZ NOT NULL DEFAULT now()
  acknowledged_at TIMESTAMPTZ NULL
  acknowledged_by UUID FK -> users.id ON DELETE SET NULL, NULL
```

### Live logging, results, helpers, and offline synchronization

```text
event_helper_invitations
  id UUID PK DEFAULT gen_random_uuid()
  event_id UUID FK -> events.id ON DELETE CASCADE
  secret_hash TEXT NOT NULL
  human_code TEXT UQ NOT NULL
  max_cap INTEGER NOT NULL DEFAULT 10 CHECK (1..50)
  status TEXT NOT NULL DEFAULT 'active' CHECK ('active', 'closed', 'revoked')
  created_by TEXT NOT NULL                 -- Auth0 subject, not a users FK
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

event_helper_grants
  id UUID PK DEFAULT gen_random_uuid()
  invitation_id UUID FK -> event_helper_invitations.id ON DELETE CASCADE
  event_id UUID FK -> events.id ON DELETE CASCADE
  auth0_sub TEXT NOT NULL
  status TEXT NOT NULL DEFAULT 'active' CHECK ('active', 'revoked')
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  is_offline_logger BOOLEAN NOT NULL DEFAULT false
  offline_queue_device_id TEXT NULL
  UQ (event_id, auth0_sub)
  UQ partial: one active offline logger per event

event_helper_audit_logs
  id UUID PK DEFAULT gen_random_uuid()
  event_id UUID FK -> events.id ON DELETE CASCADE
  invitation_id UUID FK -> event_helper_invitations.id ON DELETE SET NULL, NULL
  action TEXT NOT NULL
  actor_sub TEXT NOT NULL
  details JSONB NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()

public_logger_links
  id UUID PK DEFAULT gen_random_uuid()
  event_id UUID FK -> events.id ON DELETE CASCADE
  token_hash TEXT UQ NOT NULL
  status TEXT NOT NULL DEFAULT 'active' CHECK ('active', 'revoked')
  created_by UUID FK -> users.id
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  revoked_at TIMESTAMPTZ NULL

public_logger_sessions
  id UUID PK DEFAULT gen_random_uuid()
  link_id UUID FK -> public_logger_links.id ON DELETE CASCADE
  event_id UUID FK -> events.id ON DELETE CASCADE
  token_hash TEXT UQ NOT NULL
  logger_name TEXT NOT NULL
  logger_club TEXT NOT NULL
  expires_at TIMESTAMPTZ NOT NULL
  offline_device_id TEXT NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  UQ (id, event_id)                        -- target for timeline composite FK

timeline_entries
  id UUID PK DEFAULT gen_random_uuid()
  event_id UUID FK -> events.id
  athlete_id UUID FK -> athletes.id
  discipline TEXT NOT NULL
  entry_type TEXT NOT NULL CHECK ('attempt', 'split', 'penalty', 'note')
  value NUMERIC NULL CHECK (value >= 0 when present)
  unit TEXT NULL CHECK ('seconds', 'metres', 'cm')
  is_foul BOOLEAN NOT NULL DEFAULT false
  incident_type TEXT NULL CHECK ('false_start', 'dq', 'dnf', 'dns', 'lane_infringement')
  recorded_by UUID FK -> users.id NULL
  public_logger_session_id UUID NULL
  note_text TEXT NULL
  version INTEGER NOT NULL DEFAULT 1
  device_id TEXT NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  deleted_at TIMESTAMPTZ NULL
  FK (public_logger_session_id, event_id) -> public_logger_sessions(id, event_id)
  CHECK: exactly one actor is present: recorded_by XOR public_logger_session_id

results
  event_id UUID PK, FK -> events.id
  athlete_id UUID PK, FK -> athletes.id
  discipline TEXT PK
  outcome TEXT NOT NULL DEFAULT 'no_result' CHECK ('no_result', 'valid', 'dq', 'dnf', 'dns')
  final_result NUMERIC NULL CHECK (>= 0 when present)
  unit TEXT NULL
  placing INTEGER NULL CHECK (> 0 when present)
  is_pb BOOLEAN NOT NULL DEFAULT false
  is_sb BOOLEAN NOT NULL DEFAULT false
  manual_override NUMERIC NULL CHECK (>= 0 when present)
  override_reason TEXT NULL
  overridden_by UUID FK -> users.id NULL
  override_at TIMESTAMPTZ NULL
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  CHECK: dq/dnf/dns have no final_result
  CHECK: valid has final_result
  CHECK: no_result has no final_result

sync_action_receipts
  action_id UUID PK
  event_id UUID FK -> events.id ON DELETE CASCADE
  actor_id UUID FK -> users.id
  device_id TEXT NOT NULL
  action_type TEXT NOT NULL
  status TEXT NOT NULL CHECK ('accepted', 'rejected', 'duplicate')
  entry_id UUID NULL
  server_version INTEGER NULL
  error_code TEXT NULL
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()

public_sync_action_receipts
  action_id UUID PK
  session_id UUID FK -> public_logger_sessions.id ON DELETE CASCADE
  event_id UUID FK -> events.id ON DELETE CASCADE
  device_id TEXT NOT NULL
  action_type TEXT NOT NULL
  status TEXT NOT NULL CHECK ('accepted', 'rejected', 'duplicate')
  entry_id UUID NULL
  server_version INTEGER NULL
  error_code TEXT NULL
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()

public_sync_conflict_log
  id UUID PK DEFAULT gen_random_uuid()
  action_id UUID NOT NULL
  session_id UUID FK -> public_logger_sessions.id ON DELETE CASCADE
  event_id UUID FK -> events.id ON DELETE CASCADE
  entry_id UUID NOT NULL
  overwritten_version INTEGER NOT NULL
  overwritten_value NUMERIC NULL
  overwritten_incident TEXT NULL
  overwritten_note TEXT NULL
  winning_action_id UUID NOT NULL
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

### Notifications and reminders

```text
fixture_notifications
  id UUID PK DEFAULT gen_random_uuid()
  recipient_user_id UUID FK -> users.id ON DELETE CASCADE
  workspace_id UUID FK -> workspaces.id ON DELETE CASCADE
  event_id UUID FK -> events.id ON DELETE CASCADE
  invitation_id UUID FK -> fixture_invitations.id ON DELETE SET NULL, NULL
  kind TEXT NOT NULL CHECK (
    'fixture_invited', 'fixture_responded', 'fixture_reacceptance_required',
    'fixture_started', 'event_coming_up', 'live_logger_started', 'event_ended'
  )
  payload JSONB NOT NULL DEFAULT '{}'
  dedupe_key TEXT NOT NULL
  read_at TIMESTAMPTZ NULL
  starred_at TIMESTAMPTZ NULL
  deleted_at TIMESTAMPTZ NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  UQ (recipient_user_id, workspace_id, dedupe_key)

event_reminders
  id UUID PK DEFAULT gen_random_uuid()
  user_id UUID FK -> users.id
  workspace_id UUID FK -> workspaces.id
  event_id UUID FK -> events.id
  event_version INTEGER NOT NULL DEFAULT 1
  threshold TEXT NOT NULL CHECK ('seven_days', 'one_day')
  scheduled_for TIMESTAMPTZ NOT NULL
  read_at TIMESTAMPTZ NULL
  invalidated_at TIMESTAMPTZ NULL
  invalidated_reason TEXT NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  UQ (user_id, event_id, event_version, threshold)

event_reminder_mutes
  user_id UUID PK, FK -> users.id
  workspace_id UUID PK, FK -> workspaces.id
  event_id UUID PK, FK -> events.id
  muted_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

## Important indexes and database automation

- Roster lookup: `athletes(workspace_id, lifecycle_status, lower(name))`.
- Event lookup: `events(created_by, status, date, time, created_at, id)` and `(status, date)`.
- Active event feed: `timeline_entries(event_id, created_at DESC, id DESC)` where `deleted_at IS NULL`.
- Result statistics: `results(athlete_id, discipline, event_id)`.
- RSVP audit: `event_participant_rsvp_audit(event_id, athlete_id, changed_at DESC)`.
- Unread reminders and notifications use partial indexes excluding read/invalidated or deleted rows.
- A database trigger creates one host `event_fixture_workspaces` record whenever an `events` row is inserted.

## Migration inventory

| Migration | Final schema change |
|---|---|
| `0001_init.sql` | Base identity, athlete, event, participant, timeline, and result tables |
| `0002_contract_100m.sql` | 100m constraints, outcome fields, archive and note columns |
| `0003_aggregate_indexes.sql` | Statistics and dashboard lookup indexes |
| `0004_account_lifecycle.sql` | Account-deletion tombstone |
| `0005_workspace_tenancy.sql` | Workspaces and workspace-scoped athletes/events |
| `0006_workspace_roles_and_invitations.sql` | Coach/assistant roles, invitations, membership audit |
| `0007_workspace_squads.sql` | Squads and normalized athlete memberships |
| `0008_athlete_lifecycle.sql` | Athlete states, transition audit, participant reviews |
| `0009_intermediate_fixtures.sql` | Fixture workspaces, invitations, responses, participant workspace ownership |
| `0010_fixture_workspace_status_index.sql` | Non-unique fixture status index |
| `0011_athlete_injuries.sql` | Injury records |
| `0012_audited_rsvps.sql` | RSVP `maybe` state, attribution, and audit table |
| `0013_in_app_event_reminders.sql` | Event reminders and reminder mutes |
| `0014_event_helper_invitations.sql` | Event helper invitations, grants, and audit logs |
| `0015_optional_injury_dates.sql` | Nullable injury occurrence date |
| `0016_public_logger_links.sql` | Public logger links/sessions and timeline actor XOR relationship |
| `0017_clubs.sql` | Clubs and club join requests |
| `0018_fixture_notifications.sql` | In-app fixture notifications |
| `0019_targeted_fixture_invitations_and_single_membership.sql` | Targeted invitations and one-workspace-per-user constraint |
| `0019_offline_logger_designation.sql` | Offline helper logger designation |
| `0020_sync_idempotency.sql` | Authenticated offline-sync receipts |
| `0021_user_consent.sql` | User consent fields |
| `0022_notification_star_delete.sql` | Notification star and soft-delete state |
| `0022_public_logger_offline_sync.sql` | Public logger sync receipts and conflict log |
| `0023_event_lifecycle_notifications.sql` | Additional notification kinds |
| `0024_public_club_statistics.sql` | Club public-results setting |
| `0025_club_public_schedule_publication.sql` | Independent club public-schedule setting |
| `0026_user_preferences.sql` | Per-user dashboard card order, hidden cards, and saved filter presets |

## Schema maintenance

Migrations are checksum-tracked by `backend/src/db/migrate.ts`. Never modify a migration after it has been applied. Add a new migration for every schema change, then update this reference in the same change so the ERD source remains current.

## AI declaration

This document was reconciled with the committed SQL migrations using OpenCode[gpt-5.6-terra] and updated for migration `0026_user_preferences.sql` with the assistance of opencode[mimo-v2.6-flash-free].
