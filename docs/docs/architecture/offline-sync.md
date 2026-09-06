---
sidebar_position: 3
---

# Offline-First Architecture

Athlora supports offline-first live logging through a Progressive Web App (PWA) with a service worker, IndexedDB action queue via Dexie, and an idempotent batch sync endpoint. Coaches can log finishes and incidents even without network connectivity; actions queue locally and drain deterministically on reconnect.

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Frontend (Browser)                                  │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Service      │  │ Dexie/       │  │ Sync       │ │
│  │ Worker       │  │ IndexedDB    │  │ Engine     │ │
│  │ (app shell   │  │ (action      │  │ (drains    │ │
│  │  + API cache)│  │  queue)      │  │  queue)    │ │
│  └─────────────┘  └──────┬───────┘  └─────┬──────┘ │
│                           │                │         │
│  ┌────────────────────────┘                │         │
│  │  Live Logger                            │         │
│  │  (enqueues when offline,                │         │
│  │   sends directly when online)           │         │
│  └─────────────────────────────────────────┘         │
└───────────────────────┬─────────────────────────────┘
                        │ POST /api/v1/sync/batch
                        ▼
┌─────────────────────────────────────────────────────┐
│  Backend API                                        │
│  - Idempotent action processing                     │
│  - Optimistic version conflict detection            │
│  - Result recomputation after batch                 │
│  - Action receipts (accepted/rejected/duplicate)    │
└─────────────────────────────────────────────────────┘
```

## Dexie Schema

The offline database is named `athlora-${userId}` (per-user isolation) with version 1:

### offlineActions

Primary key: `id`. Indexes: `[status+eventId+createdAt]`, `eventId`, `status`.

```typescript
interface OfflineAction {
  id: string;                    // UUID (client-generated)
  actionType: 'create_entry' | 'edit_entry' | 'undo_entry';
  eventId: string;
  entryId?: string;              // for edit/undo
  payload: Record<string, unknown>;
  expectedVersion?: number;      // for edit/undo
  status: 'pending' | 'synced' | 'failed';
  deviceId: string;
  createdAt: number;             // Date.now()
  syncedAt?: number;
  serverReceipt?: Record<string, unknown>;
  error?: string;
}
```

### cachedEvents

Primary key: `id`. Index: `[workspaceId+id]`. Caches event data for offline display.

### cachedParticipants

Primary key: `eventId`. Caches participant lists per event.

### cachedTimeline

Primary key: `eventId`. Caches timeline entries per event.

## Action Queue (`actionQueue.ts`)

| Function | Description |
|---|---|
| `enqueueAction(input, userId)` | Adds an action to the queue with a UUID, returns the action ID |
| `getPendingActions(eventId, userId)` | Returns pending actions for an event in creation order |
| `getAllPendingActions(userId)` | Returns all pending actions across events |
| `markSynced(actionId, receipt, userId)` | Marks an action as synced with the server receipt |
| `markFailed(actionId, error, userId)` | Marks an action as failed with the error message |
| `resetFailed(actionId, userId)` | Resets a failed action back to pending for retry |
| `getQueueStatus(eventId, userId)` | Returns `{ pending, synced, failed }` counts |

## Sync Engine (`syncEngine.ts`)

The `drainQueue(eventId, userId)` function:

1. Fetches all pending actions for the event (in creation order)
2. Builds a `SyncBatchRequest` with `deviceId`, `eventId`, and the action array
3. Sends `POST /api/v1/sync/batch`
4. Processes receipts: marks each action as synced (accepted/duplicate) or failed (rejected)
5. Returns `{ accepted, rejected, duplicates, failed }`

## Batch Sync Endpoint

```
POST /api/v1/sync/batch
Body: {
  deviceId: string,
  eventId: string,
  actions: SyncActionInput[]
}
```

### SyncActionInput

| Field | Type | Description |
|---|---|---|
| `actionId` | string | Client-generated UUID (used for idempotency) |
| `actionType` | `create_entry` \| `edit_entry` \| `undo_entry` | Action type |
| `payload` | object | Action-specific data (athleteId, entryType, value, etc.) |
| `expectedVersion` | number | Required for edit/undo — optimistic concurrency check |
| `clientTimestamp` | string | ISO 8601 timestamp of the action |

### Processing

All actions in a batch are processed inside a single PostgreSQL transaction:

1. **Idempotency check:** if `actionId` already exists in `sync_action_receipts`, returns `duplicate`
2. **create_entry:** inserts a new `timeline_entries` row with `version = 1` and the client-generated UUID as the primary key
3. **edit_entry:** updates the entry only if `version = expectedVersion`; returns `VERSION_CONFLICT` on mismatch
4. **undo_entry:** sets `deleted_at` only if `version = expectedVersion`; returns `VERSION_CONFLICT` on mismatch
5. After the transaction commits, results are recomputed if any action was accepted

### SyncBatchResult

```json
{
  "receipts": [
    {
      "actionId": "uuid",
      "status": "accepted",
      "entryId": "uuid",
      "serverVersion": 2
    },
    {
      "actionId": "uuid",
      "status": "rejected",
      "code": "VERSION_CONFLICT"
    },
    {
      "actionId": "uuid",
      "status": "duplicate"
    }
  ],
  "recomputedResults": true
}
```

### Receipt statuses

| Status | Meaning |
|---|---|
| `accepted` | Action was applied successfully |
| `rejected` | Action was rejected (e.g., `VERSION_CONFLICT`, `INTERNAL_ERROR`) |
| `duplicate` | Action was already applied (idempotent no-op) |

## Offline Logger Designation

One helper per event can be designated as the offline logger. This is a coordination mechanism — only one device should be logging offline for a given event to avoid conflicting edits.

| Endpoint | Purpose |
|---|---|
| `POST /events/:eventId/helpers/grants/:grantId/designate-offline-logger` | Designate a grant as the offline logger |
| `DELETE /events/:eventId/helpers/grants/:grantId/designate-offline-logger` | Revoke the designation |
| `POST /events/:eventId/helpers/transfer-offline-logger` | Transfer designation to another grant |

The designation is stored on `event_helper_grants` with `is_offline_logger = true` and `offline_queue_device_id`.

## Conflict Resolution Rules

Two new entries from different devices for the same event → both kept (append-only log, no conflict by nature).

Two edits to the same entry → resolved by version number. The edit with the correct `expectedVersion` succeeds; the stale edit is rejected with `VERSION_CONFLICT`.

Deletes (undo) are tombstones (`deleted_at`), not hard deletes. A late-arriving edit to an undone entry does not resurrect it — the update targets `deleted_at IS NULL`.

## Service Worker

Configured via `vite-plugin-pwa`, the service worker caches:
- **App shell:** static assets (HTML, CSS, JS) for offline loading
- **API responses:** cached responses for read endpoints (events, participants, timeline)

Write operations bypass the service worker and go directly to the action queue.

## Queue Status UI

The `QueueStatusBadge` component displays the current queue state (pending/synced/failed counts) and provides retry and clear controls for failed actions.

## Dependencies

- `dexie` — IndexedDB wrapper with typed schema and transactions
- `vite-plugin-pwa` — Service worker generation and manifest configuration
- `crypto.randomUUID()` — Client-generated UUIDs for action IDs and entry IDs

## AI declaration

This document was created with the assistance of opencode[mimo-v2.5-free].
