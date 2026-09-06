---
sidebar_position: 4
---

# Cross-Club Fixtures

Fixtures connect a hosted, scheduled 100m competition to one or more guest clubs (workspaces) without granting those clubs membership in the host workspace. The system supports invitation management, roster isolation, revision-based reacceptance, timeline logging by guest teams, and result correction.

All paths are relative to `/api/v1`. Authentication is required for all routes.

## Concepts

- **Host workspace:** the club that created the event and owns the fixture. Controls event lifecycle, can view all teams' entries/results, and can override any participant's result.
- **Guest workspace:** a club that has accepted an invitation to participate. Can manage their own roster, timeline entries, and results only.
- **Fixture revision:** incremented on material changes (date/time/venue changes, roster additions/removals). Guest teams must reaccept after a revision bump.
- **Withdrawal:** a team may be withdrawn (by the guest before start, or by the host after start) without deleting historical data.

## Host Endpoints

Mounted at `/events/:eventId` (the `fixtureHostRouter`).

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/events/:eventId/fixture-invitations` | Create a pending invitation to a target club |
| `GET` | `/events/:eventId/fixture-invitations` | List invitations with response history |
| `POST` | `/events/:eventId/fixture-invitations/:invitationId/resend` | Revoke and replace a pending/declined invitation |
| `DELETE` | `/events/:eventId/fixture-invitations/:invitationId` | Revoke an unused invitation |
| `GET` | `/events/:eventId/fixture-rosters` | Read participating-team rosters |
| `GET` | `/events/:eventId/fixture-entries` | Read all teams' timeline entries |
| `GET` | `/events/:eventId/fixture-results` | Read all teams' results |
| `PUT` | `/events/:eventId/fixture-results/:athleteId` | Override any participant's result |
| `POST` | `/events/:eventId/fixture-workspaces/:workspaceId/withdrawal` | Record a guest withdrawal after start |

### Create invitation

```
POST /events/:eventId/fixture-invitations
Body: { targetClubId: UUID, expiresInDays?: number (default 7) }
```

Creates a pending invitation. The target club is resolved through the `clubs` table. The host cannot invite itself (`409 FIXTURE_HOST_CANNOT_INVITE_SELF`). Duplicate active invitations for the same club are rejected (`409 FIXTURE_INVITATION_EXISTS`). The event must be `scheduled`.

### Resend invitation

```
POST /events/:eventId/fixture-invitations/:invitationId/resend
```

Revokes the current token and creates a replacement invitation with a new token and 7-day expiry. Only works on `pending`, `declined`, or `change_requested` invitations.

### Revoke invitation

```
DELETE /events/:eventId/fixture-invitations/:invitationId
```

Sets status to `revoked`. Only works on `pending`, `declined`, or `change_requested` invitations.

### Host roster read

```
GET /events/:eventId/fixture-rosters
```

Returns `{ data: FixtureTeamRoster[] }` with each team's participants. Uses the safe participant summary (name, squads, archive status) — never exposes guest private athlete fields.

### Host result override

```
PUT /events/:eventId/fixture-results/:athleteId
Body: { manualOverride: number | null, overrideReason: string | null }
```

The host can override any participant's result, including guest-team athletes. This uses the same override path as the standard results endpoint.

### Host withdrawal

```
POST /events/:eventId/fixture-workspaces/:workspaceId/withdrawal
```

Records a guest withdrawal after the fixture has started. Preserves all participant, timeline, and result history.

## Guest Endpoints

Mounted at `/fixtures` (the `fixtureGuestRouter`).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/fixtures/incoming` | List pending invitations for the caller |
| `POST` | `/fixtures/incoming/:invitationId/respond` | Accept, decline, or request changes |
| `GET` | `/fixtures` | List guest fixtures |
| `GET` | `/fixtures/:eventId` | Get fixture detail |
| `GET` | `/fixtures/:eventId/participants` | List the guest team's participants |
| `POST` | `/fixtures/:eventId/participants` | Add an athlete to the guest roster |
| `PUT` | `/fixtures/:eventId/participants/:athleteId` | Update RSVP status |
| `DELETE` | `/fixtures/:eventId/participants/:athleteId` | Remove from guest roster |
| `POST` | `/fixtures/:eventId/withdrawal` | Withdraw before start |
| `GET` | `/fixtures/:eventId/entries` | List the guest team's timeline entries |
| `POST` | `/fixtures/:eventId/entries` | Create a timeline entry |
| `PATCH` | `/fixtures/:eventId/entries/:entryId` | Edit a timeline entry |
| `DELETE` | `/fixtures/:eventId/entries/:entryId` | Undo a timeline entry |
| `GET` | `/fixtures/:eventId/results` | List the guest team's results |
| `PUT` | `/fixtures/:eventId/results/:athleteId` | Override the guest team's result |

### Invitation response

```
POST /fixtures/incoming/:invitationId/respond
Body: { response: 'accepted' | 'declined' | 'change_requested', message?: string }
```

Accepting creates the guest workspace relationship and sets the accepted revision. Declining or requesting changes records the response with an optional message. The invitation must be `pending` or `change_requested` and not expired.

### Guest roster management

Guest roster routes enforce that the fixture is `scheduled`, the guest team is `accepted`, and the accepted revision matches the current fixture revision. Roster changes are locked after the fixture starts or after a material revision change.

### Guest timeline logging

Guest teams can create, edit, and undo timeline entries for their own athletes only. The same version-conflict, lifecycle, and result-recomputation rules apply as the standard timeline API.

### Guest withdrawal

```
POST /fixtures/:eventId/withdrawal
```

Available only while the fixture is `scheduled`. After start, only the host can record a withdrawal.

## Invitation State Machine

```
pending → accepted
pending → declined
pending → change_requested
pending → revoked
change_requested → accepted
change_requested → declined
change_requested → revoked
```

Expiry makes a `pending` or `change_requested` invitation unavailable.

## Fixture Revision

`events.fixture_revision` starts at 1 and is incremented when:
- A material date/time/venue change is made
- A guest team is accepted (first acceptance or after withdrawal)
- A guest team is withdrawn

After a revision bump, all non-withdrawn guest teams are marked `reacceptance_required` and new invitation tokens are created. The host cannot start the fixture until all teams have accepted the current revision.

## Notification System

Fixture lifecycle events generate in-app notifications:

| Kind | Recipients | Trigger |
|---|---|---|
| `fixture_invited` | Coaches in the target workspace (or email-matched users) | Invitation created |
| `fixture_responded` | Host workspace coaches | Guest responds to invitation |
| `fixture_reacceptance_required` | Guest workspace coaches | Material revision change |
| `fixture_started` | Accepted guest workspace coaches | Event moved to `in_progress` |

Notifications are deduplicated via `dedupe_key` and support unread counts and mark-as-read.

### Notification Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/notifications` | List all notifications for the caller |
| `GET` | `/notifications/unread-count` | Get count of unread notifications |
| `POST` | `/notifications/:notificationId/read` | Mark a notification as read |

## Database Tables

- `event_fixture_workspaces` — workspace participation (host/guest, status, accepted revision)
- `fixture_invitations` — email-bound or workspace-bound invitations with hashed tokens
- `fixture_invitation_responses` — immutable response records with actor attribution
- `fixture_notifications` — in-app notification delivery and read tracking

## Authorization Rules

- **Host authority:** only the host can start, complete, cancel, or materially edit a fixture event
- **Guest isolation:** guest teams can only manage their own roster, entries, and results
- **Result correction:** the host can override any participant's result; guests can only override their own
- **Roster locking:** roster changes require `scheduled` status, `accepted` team status, and matching revision
- **Post-start withdrawal:** only the host can record a withdrawal after the fixture begins

## AI declaration

This document was created with the assistance of opencode[mimo-v2.5-free].
