---
sidebar_position: 6
---

# Event Helpers

Event helpers are temporary, invitation-based grants that allow authenticated users to assist with live logging for a specific event. Unlike workspace members, helpers do not receive workspace membership — they get a time-limited, event-scoped grant that can be revoked at any time.

All paths are relative to `/api/v1`. Management routes require authentication.

## Concepts

- **Invitation:** a secret-based credential created by the event owner. Each invitation has a maximum capacity (`maxCap`) and can be rotated (replacing the secret).
- **Grant:** an individual redemption of an invitation. Each grant is tied to one Auth0 subject and one event.
- **Human code:** a 6-character alphanumeric code (e.g., `A3B7K9`) that can be typed instead of the full secret. Generated automatically alongside the secret.
- **Audit log:** every management action (create, rotate, revoke, redeem) is recorded with actor attribution.

## Management Endpoints

All management routes require `verifyAuth0Token`, `resolveApplicationUser`, `requireOperationalAccess()`, and `requireEventOwnership('eventId')`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/events/:eventId/helpers/invitations` | Create an invitation |
| `GET` | `/events/:eventId/helpers/invitations` | List invitations and grants |
| `POST` | `/events/:eventId/helpers/invitations/:invitationId/rotate` | Replace secret and human code |
| `PATCH` | `/events/:eventId/helpers/invitations/:invitationId` | Update invitation status |
| `DELETE` | `/events/:eventId/helpers/grants/:grantId` | Revoke a grant |

### Create invitation

```
POST /events/:eventId/helpers/invitations
Body: { maxCap?: number (default 10, max 50) }
```

Returns the invitation, the raw secret (shown once), and the human code. The event must not be `completed` or `cancelled`.

**Response:**

```json
{
  "data": {
    "invitation": {
      "id": "uuid",
      "eventId": "uuid",
      "humanCode": "A3B7K9",
      "maxCap": 10,
      "status": "active",
      "createdAt": "2026-01-01T00:00:00Z"
    },
    "rawSecret": "64-char-hex-secret",
    "humanCode": "A3B7K9"
  }
}
```

### Rotate invitation

```
POST /events/:eventId/helpers/invitations/:invitationId/rotate
```

Generates a new secret and human code for an active invitation. The old secret immediately stops working. Useful if the secret was compromised.

### Update invitation status

```
PATCH /events/:eventId/helpers/invitations/:invitationId
Body: { status: 'active' | 'closed' | 'revoked' }
```

- `active` — re-enables a closed/revoked invitation
- `closed` — stops new redemptions but preserves existing grants
- `revoked` — permanently disables the invitation

### Revoke grant

```
DELETE /events/:eventId/helpers/grants/:grantId
```

Revokes an individual helper's access. The helper's existing timeline entries and results are preserved.

### List invitations

```
GET /events/:eventId/helpers/invitations
```

Returns all invitations for the event, ordered by creation date.

## Redemption Endpoint

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/events/helpers/redeem` | Auth0 JWT (rate limited) | Redeem an invitation |

```
POST /events/helpers/redeem
Body: { secret?: string } or { humanCode?: string }
```

Provide either the raw secret or the human code. The helper must have a valid Auth0 JWT. The redemption:

1. Looks up the invitation by secret hash or human code
2. Checks the event is not `completed` or `cancelled` (or within the 2-hour read-only window)
3. Checks if the user already has a grant (returns existing grant if so)
4. Acquires a PostgreSQL advisory lock to prevent race conditions
5. Enforces the invitation's `maxCap` on distinct active grants
6. Creates the grant and records an audit entry

**Error cases:**

- `401` — invalid or inactive invitation code/secret
- `409` — capacity reached, grant already revoked, or event access expired

## Offline Logger Designation

One helper per event can be designated as the offline logger. This helper's device queues actions locally and syncs them via the batch sync endpoint.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/events/:eventId/helpers/grants/:grantId/designate-offline-logger` | Designate as offline logger |
| `DELETE` | `/events/:eventId/helpers/grants/:grantId/designate-offline-logger` | Revoke designation |
| `POST` | `/events/:eventId/helpers/transfer-offline-logger` | Transfer designation to another grant |

**Designate:**

```
POST /events/:eventId/helpers/grants/:grantId/designate-offline-logger
Body: { deviceId: string }
```

Revokes any existing offline logger designation for the event, then designates the specified grant. Only active grants can be designated.

**Transfer:**

```
POST /events/:eventId/helpers/transfer-offline-logger
Body: { fromGrantId: string, toGrantId: string }
```

Transfers the offline logger designation from one grant to another. Both grants must be active.

## Realtime Subscription

Helpers with active grants can subscribe to Socket.IO event rooms. Subscription authorization checks for:
- Current workspace membership, OR
- Accepted fixture participation, OR
- Active event helper grant

Grant revocation immediately removes the helper from the event room. After event completion or cancellation, helpers retain read-only room access for 2 hours.

## Database Tables

- `event_helper_invitations` — invitation records (secret hash, human code, capacity, status)
- `event_helper_grants` — individual grants (Auth0 sub, event, status, offline logger flag)
- `event_helper_audit_logs` — immutable audit trail for all management and redemption actions

## Dependencies

- `randomBytes` (Node.js crypto) — secret and human code generation
- `createHash` (Node.js crypto) — SHA-256 token hashing
- PostgreSQL advisory locks — prevents race conditions during redemption

## AI declaration

This document was created with the assistance of opencode[mimo-v2.5-free].
