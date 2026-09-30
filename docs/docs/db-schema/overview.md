---
sidebar_position: 1
---

# Database schema

This is the single AI-ready reference for Athlora's final database schema. It is derived from every SQL migration in `backend/src/db/migrations/` as of migration `0040_remove_club_accent_color.sql`. The migrations remain the executable source of truth; use this page together with them when a tool needs an ERD or schema analysis.

PostgreSQL 13+ is required because the schema uses `gen_random_uuid()`. Types below use PostgreSQL names. `PK` means primary key, `FK` means foreign key, `UQ` means unique constraint or unique index, and `NULL` means nullable.

## Entity relationship diagram

The diagram below reflects the schema documented on this page. Open the [SVG ERD](/img/erd.svg) for a zoomable version.

<img src="/img/erd.svg" alt="Athlora database entity relationship diagram" />

*The diagram shows the Stage-1 core schema; the multi-discipline catalogue tables documented below are authoritative for the sessions, entrants, and catalogue model.*

## Relationship summary

- A `club` maps one-to-one to a `workspace`.
- A `workspace` has one or more `workspace_members`, but a user can belong to only one workspace.
- Athletes, events, squads, injuries, reminders, and notifications are workspace-scoped.
- Events own fixture participation, invitations, participants, live-log entries, results, helpers, public logger links, and offline-sync receipts.
- `timeline_entries` are created by exactly one actor: either an authenticated `users` row or a `public_logger_sessions` row.
- Results are materialized from the timeline and are unique per event, athlete, and discipline.
- A user's dashboard preferences are stored per `(user, workspace)` pair.
- Catalogue-backed meets group entrants into `discipline_sessions` through `session_entrants`, with `session_timeline_entries` and one `session_results` row per (session, entrant).

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
  description TEXT NULL CHECK (length(description) <= 500)
  primary_color TEXT NULL CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$')
  logo_key TEXT NULL
  logo_content_type TEXT NULL
  logo_byte_size INTEGER NULL CHECK (logo_byte_size IS NULL OR logo_byte_size > 0 AND logo_byte_size <= 5242880)
  cover_key TEXT NULL
  cover_content_type TEXT NULL
  cover_byte_size INTEGER NULL CHECK (cover_byte_size IS NULL OR cover_byte_size > 0 AND cover_byte_size <= 5242880)
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

athlete_preferred_disciplines
  athlete_id UUID PK, FK -> athletes.id ON DELETE CASCADE
  discipline_definition_id UUID PK, FK -> discipline_definitions.id ON DELETE RESTRICT
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()

athlete_season_goals
  id UUID PK DEFAULT gen_random_uuid()
  athlete_id UUID FK -> athletes.id ON DELETE CASCADE
  discipline_definition_id UUID FK -> discipline_definitions.id ON DELETE RESTRICT
  target_value NUMERIC NOT NULL CHECK (> 0)
  target_unit TEXT NOT NULL CHECK ('seconds', 'metres', 'cm')
  target_date DATE NULL
  status TEXT NOT NULL CHECK ('active', 'completed')
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

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

### Generic meet entrants

```text
meet_entrants
  id UUID PK DEFAULT gen_random_uuid()
  event_id UUID NOT NULL
  workspace_id UUID NOT NULL
  kind TEXT NOT NULL CHECK ('athlete', 'guest', 'relay')
  athlete_id UUID NULL
  name TEXT NOT NULL CHECK (trimmed length 1..120)
  club_name TEXT NULL CHECK (trimmed length 1..120 when present)
  details TEXT NULL CHECK (trimmed length 1..2000 when present)
  created_by UUID FK -> users.id
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  UQ (id, event_id, workspace_id); UQ partial (event_id, athlete_id) when athlete_id is present
  FK (event_id, workspace_id) -> event_fixture_workspaces(event_id, workspace_id)
  FK (athlete_id, workspace_id) -> athletes(id, workspace_id)
  CHECK: athlete_id is present exactly when kind is 'athlete'
  CHECK: club_name and details are null unless kind is 'guest'
```

### Multi-discipline catalogue, sessions, and meet audit

```text
discipline_definitions                         -- immutable catalogue rows (0028 + 0029/0030/0031/0034 seeds)
  id UUID PK DEFAULT gen_random_uuid()
  code TEXT NOT NULL CHECK (matches ^[a-z0-9][a-z0-9_]*$)
  version INTEGER NOT NULL CHECK (> 0)
  kind TEXT NOT NULL CHECK ('track', 'field', 'relay', 'vertical')
  unit TEXT NOT NULL CHECK ('seconds', 'metres', 'cm')
  direction TEXT NOT NULL CHECK ('lower', 'higher')
  default_rules JSONB NOT NULL CHECK (object; aggregation 'timed' | 'best' | 'vertical'; entrantType 'individual' | 'relay')
  precision INTEGER NOT NULL CHECK (0..6)
  presentation JSONB NOT NULL CHECK (object with a label)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  source TEXT NOT NULL                          -- seeding migration name
  UQ (code, version)
  CHECK: unit 'seconds' pairs with direction 'lower'; 'metres'/'cm' pair with 'higher'
  trigger: UPDATE and DELETE raise an exception (insert a new version instead)

discipline_sessions
  id UUID PK DEFAULT gen_random_uuid()
  event_id UUID NOT NULL
  workspace_id UUID NOT NULL
  discipline_definition_id UUID FK -> discipline_definitions.id ON DELETE RESTRICT
  label TEXT NOT NULL CHECK (trimmed length 1..120)
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK ('scheduled', 'in_progress', 'completed', 'cancelled')
  version INTEGER NOT NULL DEFAULT 1 CHECK (> 0)
  vertical_config JSONB NULL CHECK (object when present)
  result_state TEXT NOT NULL DEFAULT 'provisional' CHECK ('provisional', 'final', 'reopened')
  created_by UUID FK -> users.id
  updated_by UUID FK -> users.id
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  UQ (id, event_id)                            -- target for session composite FKs
  FK (event_id, workspace_id) -> events(id, workspace_id) ON DELETE RESTRICT
  CHECK: result_state 'final' requires status 'completed'
  index: (event_id, created_at, id)

session_entrants
  id UUID PK DEFAULT gen_random_uuid()
  event_id UUID NOT NULL
  session_id UUID NOT NULL
  entrant_id UUID NOT NULL
  workspace_id UUID NOT NULL
  withdrawn_at TIMESTAMPTZ NULL
  withdrawn_by UUID FK -> users.id NULL
  created_by UUID FK -> users.id
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  UQ (session_id, entrant_id); UQ (event_id, session_id, entrant_id); UQ (event_id, session_id, entrant_id, workspace_id)
  FK (session_id, event_id) -> discipline_sessions(id, event_id) ON DELETE RESTRICT
  FK (entrant_id, event_id, workspace_id) -> meet_entrants(id, event_id, workspace_id) ON DELETE RESTRICT
  CHECK: withdrawn_at is present exactly when withdrawn_by is present

relay_members
  id UUID PK DEFAULT gen_random_uuid()
  event_id UUID NOT NULL
  workspace_id UUID NOT NULL
  relay_id UUID NOT NULL                       -- a meet_entrants row with kind 'relay'
  relay_kind TEXT NOT NULL DEFAULT 'relay' CHECK (= 'relay')
  member_id UUID NOT NULL                      -- a meet_entrants row with kind 'athlete' or 'guest'
  member_kind TEXT NOT NULL CHECK ('athlete', 'guest')
  leg INTEGER NOT NULL CHECK (> 0)
  created_by UUID FK -> users.id
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  UQ (relay_id, leg); UQ (relay_id, member_id)
  FK (relay_id, event_id, workspace_id, relay_kind) -> meet_entrants(id, event_id, workspace_id, kind) ON DELETE RESTRICT
  FK (member_id, event_id, workspace_id, member_kind) -> meet_entrants(id, event_id, workspace_id, kind) ON DELETE RESTRICT

session_timeline_entries
  id UUID PK DEFAULT gen_random_uuid()
  event_id UUID NOT NULL
  session_id UUID NOT NULL
  entrant_id UUID NOT NULL
  workspace_id UUID NOT NULL
  entry_type TEXT NOT NULL CHECK ('attempt', 'split', 'penalty', 'note')
  value NUMERIC NULL CHECK (> 0 and finite)
  unit TEXT NULL CHECK ('seconds', 'metres', 'cm')
  is_foul BOOLEAN NOT NULL DEFAULT false
  incident_type TEXT NULL CHECK ('false_start', 'dq', 'dnf', 'dns', 'lane_infringement')
  vertical_state TEXT NULL CHECK ('clearance', 'failure', 'pass', 'void')
  attempt_order INTEGER NULL CHECK (> 0)
  note_text TEXT NULL CHECK (length <= 2000)
  recorded_by UUID FK -> users.id NULL
  recorded_workspace_id UUID FK -> workspaces.id NULL
  public_logger_session_id UUID NULL
  version INTEGER NOT NULL DEFAULT 1 CHECK (> 0)
  device_id TEXT NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  deleted_at TIMESTAMPTZ NULL
  FK (event_id, session_id, entrant_id, workspace_id) -> session_entrants(event_id, session_id, entrant_id, workspace_id) ON DELETE RESTRICT
  FK (public_logger_session_id, event_id) -> public_logger_sessions(id, event_id) ON DELETE RESTRICT
  UQ (id, event_id, session_id, entrant_id, workspace_id)  -- target for selected-entry FK
  UQ partial (session_id, entrant_id, attempt_order) when attempt_order IS NOT NULL
  CHECK: exactly one actor is present: recorded_by XOR public_logger_session_id
  CHECK: value is present exactly when unit is present
  CHECK: an 'attempt' entry carries a value, a foul, or an incident
  CHECK: vertical_state implies a metre 'attempt' with attempt_order, no foul, no incident
  index: (session_id, entrant_id, created_at, id)

session_results
  id UUID PK DEFAULT gen_random_uuid()
  event_id UUID NOT NULL
  session_id UUID NOT NULL
  entrant_id UUID NOT NULL
  workspace_id UUID NOT NULL
  outcome TEXT NOT NULL CHECK ('no_result', 'valid', 'dq', 'dnf', 'dns')
  final_result NUMERIC NULL CHECK (> 0 and finite)
  unit TEXT NOT NULL CHECK ('seconds', 'metres', 'cm')
  manual_override NUMERIC NULL CHECK (> 0 and finite)
  override_reason TEXT NULL
  overridden_by UUID FK -> users.id NULL
  override_at TIMESTAMPTZ NULL
  selected_entry_id UUID FK -> session_timeline_entries.id ON DELETE RESTRICT
  final_place INTEGER NULL CHECK (> 0)
  version INTEGER NOT NULL DEFAULT 1 CHECK (> 0)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  UQ (session_id, entrant_id)
  FK (event_id, session_id, entrant_id, workspace_id) -> session_entrants(event_id, session_id, entrant_id, workspace_id) ON DELETE RESTRICT
  FK (selected_entry_id, event_id, session_id, entrant_id, workspace_id) -> session_timeline_entries(id, event_id, session_id, entrant_id, workspace_id)
  CHECK: outcome 'valid' is present exactly when final_result is present
  CHECK: override fields are present all-or-none (reason, actor, timestamp with value)
  index: (workspace_id, entrant_id, session_id)

meet_domain_audit
  id UUID PK DEFAULT gen_random_uuid()
  event_id UUID NOT NULL
  workspace_id UUID NOT NULL
  entity_id UUID NOT NULL
  entity_type TEXT NOT NULL
  action TEXT NOT NULL
  actor_id UUID FK -> users.id NULL
  public_logger_session_id UUID NULL
  before_state JSONB NULL
  after_state JSONB NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  FK (event_id, workspace_id) -> event_fixture_workspaces(event_id, workspace_id) ON DELETE RESTRICT
  FK (public_logger_session_id, event_id) -> public_logger_sessions(id, event_id) ON DELETE RESTRICT
  CHECK: exactly one actor is present: actor_id XOR public_logger_session_id
  index: (event_id, entity_id, created_at)
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
  recorded_workspace_id UUID FK -> workspaces.id NULL
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
  discipline_session_id UUID NULL
  entrant_id UUID NULL
  server_version INTEGER NULL
  error_code TEXT NULL
  client_timestamp TIMESTAMPTZ NULL
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  CHECK: discipline_session_id is present exactly when entrant_id is present
  FK (event_id, discipline_session_id, entrant_id) -> session_entrants(event_id, session_id, entrant_id)

public_sync_action_receipts
  action_id UUID PK
  session_id UUID FK -> public_logger_sessions.id ON DELETE CASCADE
  event_id UUID FK -> events.id ON DELETE CASCADE
  device_id TEXT NOT NULL
  action_type TEXT NOT NULL
  status TEXT NOT NULL CHECK ('accepted', 'rejected', 'duplicate')
  entry_id UUID NULL
  discipline_session_id UUID NULL
  entrant_id UUID NULL
  server_version INTEGER NULL
  error_code TEXT NULL
  client_timestamp TIMESTAMPTZ NULL
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  CHECK: discipline_session_id is present exactly when entrant_id is present
  FK (event_id, discipline_session_id, entrant_id) -> session_entrants(event_id, session_id, entrant_id)

public_sync_conflict_log
  id UUID PK DEFAULT gen_random_uuid()
  action_id UUID NOT NULL
  session_id UUID FK -> public_logger_sessions.id ON DELETE CASCADE
  event_id UUID FK -> events.id ON DELETE CASCADE
  entry_id UUID NOT NULL
  discipline_session_id UUID NULL
  entrant_id UUID NULL
  overwritten_version INTEGER NOT NULL
  overwritten_value NUMERIC NULL
  overwritten_incident TEXT NULL
  overwritten_note TEXT NULL
  winning_action_id UUID NOT NULL
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
  CHECK: discipline_session_id is present exactly when entrant_id is present
  FK (event_id, discipline_session_id, entrant_id) -> session_entrants(event_id, session_id, entrant_id)

offline_sync_conflicts
  id UUID PK DEFAULT gen_random_uuid()
  event_id UUID FK -> events.id ON DELETE CASCADE
  discipline_session_id UUID NULL
  entrant_id UUID NULL
  entry_id UUID NULL
  actor_id UUID FK -> users.id NULL
  public_logger_session_id UUID FK -> public_logger_sessions.id NULL
  device_id TEXT NOT NULL
  action_id UUID NOT NULL
  action_type TEXT NOT NULL
  expected_version INTEGER NULL
  actual_version INTEGER NULL
  attempted_payload JSONB NOT NULL
  canonical_state JSONB NULL
  client_timestamp TIMESTAMPTZ NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  resolved_at TIMESTAMPTZ NULL
  resolved_by UUID FK -> users.id NULL
  resolution_reason TEXT NULL
  CHECK: exactly one actor is present: actor_id XOR public_logger_session_id
  CHECK: discipline_session_id is present exactly when entrant_id is present
  index: (event_id, discipline_session_id, created_at)
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

Migrations apply in lexicographic filename order (`backend/src/db/migrate.ts`), and `0019_*` and `0022_*` each have two files, so the rows below follow that apply order rather than numeric order.

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
| `0019_offline_logger_designation.sql` | Offline helper logger designation |
| `0019_targeted_fixture_invitations_and_single_membership.sql` | Targeted invitations and one-workspace-per-user constraint |
| `0020_sync_idempotency.sql` | Authenticated offline-sync receipts |
| `0021_user_consent.sql` | User consent fields |
| `0022_notification_star_delete.sql` | Notification star and soft-delete state |
| `0022_public_logger_offline_sync.sql` | Public logger sync receipts and conflict log |
| `0023_event_lifecycle_notifications.sql` | Additional notification kinds |
| `0024_public_club_statistics.sql` | Club public-results setting |
| `0025_club_public_schedule_publication.sql` | Independent club public-schedule setting |
| `0026_user_preferences.sql` | Per-user dashboard card order, hidden cards, and saved filter presets |
| `0027_club_branding.sql` | Club description, primary colour, logo, and cover media keys |
| `0028_multi_discipline_meet_foundation.sql` - `0031_vertical_events_catalogue.sql` | Immutable discipline catalogue and multi-discipline meet/session foundation; `events.discipline = NULL` identifies generic meets |
| `0032_athlete_disciplines_and_season_goals.sql` | Athlete catalogue preferences and measurable private season goals |
| `0033_guest_entrant_details.sql` | Nullable club name and private details for generic-meet entrants |
| `0034_relay_catalogue_and_official_entry.sql` | Seeded `4x400m` relay catalogue row and `session_results.selected_entry_id` for coach-selected official attempts |
| `0035_official_results_finalization.sql` | Session result finalization: `session_results.final_place`, `discipline_sessions.result_state`, and the exact-target FK from `selected_entry_id` |
| `0036_offline_reconciliation.sql` | `offline_sync_conflicts` review table and `client_timestamp` on both sync receipt tables |
| `0037_backfill_legacy_100m_athlete_disciplines.sql` | Backfills `athlete_preferred_disciplines` from athletes with legacy 100m results, timeline entries, or 100m events |
| `0038_recording_attribution.sql` | `recorded_workspace_id` on `timeline_entries` and `session_timeline_entries`, with backfill to the recording workspace |
| `0039_host_fixture_revision_sync.sql` | Repairs host fixture-workspace `accepted_revision` rows left behind when a fixture revision advanced |
| `0040_remove_club_accent_color.sql` | Removes the obsolete club accent colour column |

## Schema maintenance

Migrations are checksum-tracked by `backend/src/db/migrate.ts`. Never modify a migration after it has been applied. Add a new migration for every schema change, then update this reference in the same change so the ERD source remains current.

## AI declaration

This document was reconciled with the committed SQL migrations using OpenCode[gpt-5.6-terra] and updated for migration `0026_user_preferences.sql` with the assistance of opencode[mimo-v2.6-flash-free]. Migration `0027_club_branding.sql` was documented with the assistance of opencode[mimo-v2.6-flash-free]. Migrations `0028`-`0033`, including athlete discipline preferences, season goals, generic meet usage, and guest entrant details, were documented with the assistance of OpenCode[gpt-5.6-terra]. Migration `0034_relay_catalogue_and_official_entry.sql` (relay catalogue seed and official-entry selection) was documented with the assistance of opencode[mimo-v2.6-flash-free]. Migrations `0035`-`0039`, the multi-discipline catalogue and session tables, and the offline reconciliation additions were reconciled with the committed SQL and updated with the assistance of opencode[mimo-v2.6-flash-free]. The club accent-colour removal and migration `0040_remove_club_accent_color.sql` were documented with OpenCode[openai/gpt-5.6-terra].
