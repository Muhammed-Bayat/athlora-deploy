---
sidebar_position: 5
---

# Public Logger Links

Public logger links allow meet officials or external contributors to record finish times and incidents for an event without needing an Athlora account. The coach creates a shareable link; the official opens it, identifies themselves, and submits timeline entries through a token-authenticated session.

All paths are relative to `/api/v1`.

## Owner Endpoints (Authenticated)

Mounted at `/events/:eventId/public-loggers`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/events/:eventId/public-loggers` | Create a new public logger link |
| `GET` | `/events/:eventId/public-loggers` | List all links for the event |
| `DELETE` | `/events/:eventId/public-loggers/:linkId` | Revoke a link |

### Create link

```
POST /events/:eventId/public-loggers
```

Returns `{ data: { link: PublicLoggerLink, token: string } }`. The `token` is shown once and must be shared with the official. Links can only be created for `scheduled` or `in_progress` events.

**Response:**

```json
{
  "data": {
    "link": {
      "id": "uuid",
      "eventId": "uuid",
      "status": "active",
      "createdAt": "2026-01-01T00:00:00Z",
      "revokedAt": null
    },
    "token": "base64url-token"
  }
}
```

### List links

```
GET /events/:eventId/public-loggers
```

Returns all links (active and revoked) for the event, ordered by creation date.

### Revoke link

```
DELETE /events/:eventId/public-loggers/:linkId
```

Sets the link status to `revoked`. Existing sessions remain valid until they expire.

## Public Endpoints (Unauthenticated)

Mounted at `/public/logger`. These routes do not require a JWT — they use session tokens instead.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/public/logger/sessions` | Start a session using a link token |
| `POST` | `/public/logger/sessions/event/:eventId` | Start a session by event ID |
| `GET` | `/public/logger/events/:eventId` | Get event snapshot (participants + timeline) |
| `POST` | `/public/logger/events/:eventId/entries` | Submit a timeline entry |

### Start session

```
POST /public/logger/sessions
Body: { linkToken: string, name: string, club: string }
```

The official provides the shareable link token, their name, and their club. Returns a session token and an event snapshot with participants and current timeline.

**Response:**

```json
{
  "data": {
    "sessionToken": "base64url-session-token",
    "snapshot": {
      "event": { "id": "uuid", "title": "Spring Invitational", "status": "in_progress" },
      "participants": [
        { "athleteId": "uuid", "name": "Usain Bolt" }
      ],
      "timeline": [...]
    }
  }
}
```

The session token is passed as `X-Public-Logger-Session` header on subsequent requests. Sessions expire after a configurable TTL (default 2 hours, min 15 minutes, max 240 minutes via `PUBLIC_LOGGER_SESSION_TTL_MINUTES`).

### Get snapshot

```
GET /public/logger/events/:eventId
Header: X-Public-Logger-Session: <session-token>
```

Returns the current event snapshot: event metadata, participant list, and active timeline entries. Entries omit `recordedBy`, `publicLoggerSessionId`, `deviceId`, `updatedAt`, and `deletedAt`.

### Submit entry

```
POST /public/logger/events/:eventId/entries
Header: X-Public-Logger-Session: <session-token>
Body: { athleteId, entryType, value?, unit?, incidentType? }
```

Creates a timeline entry attributed to the public logger session. The event must be `in_progress`. The athlete must be a participant of the event. After insertion, event results are automatically recomputed.

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `athleteId` | UUID | Yes | The athlete this entry is for |
| `entryType` | `attempt` \| `split` \| `penalty` \| `note` | Yes | Entry type |
| `value` | number | No | Time in seconds (for `attempt`) |
| `unit` | `seconds` | No | Unit (normalized to `seconds`) |
| `incidentType` | `false_start` \| `dq` \| `dnf` \| `dns` \| `lane_infringement` | No | Incident type |

**Response:** the created timeline entry (without attribution fields).

## Security

- Link tokens are stored as SHA-256 hashes — the raw token is shown only once
- Session tokens are also stored as SHA-256 hashes
- Sessions are scoped to a single event and expire after the TTL
- The event must be `in_progress` for entry submission
- Only participants of the event can receive entries
- The public logger cannot view coach notes, athlete dates of birth, or other private data

## Database Tables

- `public_logger_links` — shareable link records (token hash, status, event association)
- `public_logger_sessions` — active sessions (token hash, logger identity, expiry)
- `timeline_entries.public_logger_session_id` — links entries back to the session that created them

## AI declaration

This document was created with the assistance of opencode[mimo-v2.5-free].
