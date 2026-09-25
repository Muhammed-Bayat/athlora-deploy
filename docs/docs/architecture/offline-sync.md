---
sidebar_position: 3
---

# Offline-First Architecture

Athlora supports offline-first live logging through a Progressive Web App (PWA) with a service worker, IndexedDB action queue via Dexie, and idempotent batch sync endpoints. Both authenticated coaches and public logger officials can log finishes and incidents without network connectivity; actions queue locally and drain automatically on reconnect.

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
│  │  Live Logger / Public Logger            │         │
│  │  (enqueues when offline,                │         │
│  │   sends directly when online)           │         │
│  └─────────────────────────────────────────┘         │
└───────────────────────┬─────────────────────────────┘
                        │
          ┌─────────────┴─────────────┐
          │                           │
          ▼                           ▼
┌─────────────────────┐  ┌─────────────────────────────┐
│ POST /api/v1/       │  │ POST /api/v1/public/        │
│ sync/batch          │  │ logger/sync/batch           │
│ (authenticated)     │  │ (public session token)      │
└─────────────────────┘  └─────────────────────────────┘
          │                           │
          ▼                           ▼
┌─────────────────────────────────────────────────────┐
│  Backend API                                        │
│  - Idempotent action processing                     │
│  - Last-write-wins conflict resolution (public)     │
│  - Optimistic version conflict detection (auth)     │
│  - Conflict audit log (public)                      │
│  - Result recomputation after batch                 │
│  - Action receipts (accepted/rejected/duplicate)    │
└─────────────────────────────────────────────────────┘
```

## Dexie Databases

### Authenticated users

Named `athlora-${userId}` (per-user isolation).

### Public loggers

Named `athlora-public-${sessionHash}` (session-scoped, anonymous).

Both databases share the same schema:

### offlineActions / publicOfflineActions

Primary key: `id`. Indexes: `[status+eventId+createdAt]`, `eventId`, `status`. Public multi-discipline actions additionally carry a `target` containing `disciplineSessionId` and `entrantId`.

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

### cachedEvents / cachedParticipants / cachedTimeline (authenticated)

Caches event data, participant lists, and timeline entries for offline display.

### publicCachedSnapshots (public)

Caches the full event snapshot (participants + timeline) per event for offline display.

## Action Queue

### Authenticated (`actionQueue.ts`)

| Function | Description |
|---|---|
| `enqueueAction(input, userId)` | Adds an action to the queue with a UUID, returns the action ID |
| `getPendingActions(eventId, userId)` | Returns pending actions for an event in creation order |
| `markSynced(actionId, receipt, userId)` | Marks an action as synced with the server receipt |
| `markFailed(actionId, error, userId)` | Marks an action as failed with the error message |
| `getQueueStatus(eventId, userId)` | Returns pending/synced/failed counts and the latest local sync timestamp |
| `getQueueActions(eventId, userId)` | Returns locally stored actions for recovery, newest first |

### Public (`publicActionQueue.ts`)

| Function | Description |
|---|---|
| `enqueuePublicAction(input, sessionToken)` | Adds an action to the public queue |
| `getPendingPublicActions(eventId, sessionToken)` | Returns pending actions for an event |
| `markPublicSynced(actionId, receipt, sessionToken)` | Marks an action as synced |
| `markPublicFailed(actionId, error, sessionToken)` | Marks an action as failed |
| `getPublicQueueStatus(eventId, sessionToken)` | Returns counts and the latest local sync timestamp |
| `getPublicQueueActions(eventId, sessionToken)` | Returns locally stored actions for recovery, newest first |

## Sync Engine (`syncEngine.ts`)

### `drainQueue(eventId, userId)` — Authenticated

1. Fetches all pending actions for the event (creation order via the `[status+eventId+createdAt]` index)
2. Single-flight guard keyed by `eventId:userId` — concurrent reconnect/interval callers share one in-flight drain
3. Builds a `SyncBatchRequest` with the stable `deviceId`, `eventId`, and mapped actions (`actionId`, `payload` including `entryId`, `expectedVersion`, ISO `clientTimestamp`)
4. Chunks at 50 actions and sends sequential `POST /api/v1/sync/batch` requests (mirrors the public cap)
5. Processes receipts: marks accepted/duplicate as synced (storing the server receipt) and rejected as failed with the rejection code; actions without a receipt stay pending
6. On transport/HTTP failure, leaves every action **pending** so the queue is preserved for the next reconnect — the server is idempotent by `actionId`, so a re-send cannot create duplicates
7. Returns `{ accepted, rejected, duplicates, failed }`

Rejected actions do not block accepted siblings in the same batch. Their rejection code is retained with the action so the logger can identify and retry it after recovery.

### `drainPublicQueue(eventId, sessionToken)` — Public

Same flow but uses `POST /api/v1/public/logger/sync/batch` with the session token. Targeted meet actions are drained only with actions for the same `(eventId, disciplineSessionId, entrantId)` and never mixed with legacy public timeline actions.

## Batch Sync Endpoints

### Authenticated

```
POST /api/v1/sync/batch
Body: { deviceId, eventId, actions: SyncActionInput[] }
```

Processing: idempotent via `sync_action_receipts`, optimistic version conflict detection. `eventId` is owned from the request body (not a path param); logging must be open (`in_progress`). Structural validation rejects non-canonical `actionId`s, unknown action types, and batches larger than 50 with `400 VALIDATION_ERROR` before any write.

### Public

```
POST /api/v1/public/logger/sync/batch
Header: Authorization: Bearer <session-token>
Body: { eventId, deviceId, actions: PublicSyncActionInput[] }
```

Processing: idempotent, **last-write-wins** conflict resolution with audit logging. A batch is either legacy public timeline actions or target-scoped multi-discipline session actions; a mixed batch is rejected before processing.

### Offline logger designation

```
GET /api/v1/events/:eventId/helpers/offline-logger
```

The authenticated, event-owner endpoint returns the active offline logger grant, user, and queue device ID, or `null` when no helper is designated. It is intended for status/audit display and does not change a designation.

### Conflict Resolution

| Scenario | Authenticated | Public |
|---|---|---|
| Two creates | Both kept (append-only) | Both kept (append-only) |
| Two edits to same entry | VERSION_CONFLICT on stale edit | Last-write-wins, conflict logged |
| Edit to undone entry | VERSION_CONFLICT | Last-write-wins, conflict logged |

## Hooks

### `useOnlineStatus`

Tracks `navigator.onLine` and `wasOffline` (true after returning from offline).

### `useEventOffline(userId, eventId)`

For the authenticated Live Logger. Provides offline mutation fallbacks, detailed local actions, cache fallback data, retry, queue refresh, and drain operations.

### `usePublicOfflineSync({ sessionToken, eventId, deviceId })`

For public logger. Same interface. Also provides `cacheSnapshot` for persisting the event snapshot offline.

## UI Integration

`LiveLoggingPage`, `SessionLivePanel`, and `PublicLoggerPage`:
- Check `isOnline` before each mutation
- If offline, enqueue the action and show a toast ("Queued for sync")
- Render the accessible `OfflineRecoverySurface`, including connection state, cache freshness, designated logger status when available, last local sync, and action-level local records
- Identify each local action by action type, target session, entrant/athlete when available, device ID, creation time, server receipt time, and server error
- State explicitly that queued data is local and becomes server-canonical only after the server accepts it
- Provide refresh, sync-now, and per-action retry controls without a page reload
- Auto-sync when connectivity returns

Opened multi-discipline sessions are cached with their catalogue, entrants, entries, and results. If the selected session cannot be read while offline, the logger restores that cache and shows its freshness timestamp.

## Service Worker

Configured via `vite-plugin-pwa`, the service worker caches:
- **App shell:** static assets (HTML, CSS, JS) for offline loading
- **API responses:** cached via `NetworkFirst` for read endpoints
- **SPA routing:** `navigateFallback: '/index.html'` for offline navigation

Write operations bypass the service worker and go directly to the action queue.

## Recovery UI

`OfflineRecoverySurface` is a responsive, keyboard-accessible recovery surface shared by authenticated 100m logging, multi-discipline session logging, and public logging. It keeps local queue state visibly distinct from refreshed server data. Failed actions retain their server rejection code and can be reset to pending, then retried through the normal idempotent sync path.

## Dependencies

- `dexie` — IndexedDB wrapper with typed schema and transactions
- `vite-plugin-pwa` — Service worker generation and manifest configuration
- `crypto.randomUUID()` — Client-generated UUIDs for action IDs and entry IDs

## AI declaration

This document was created with the assistance of opencode[mimo-v2.5-free]. The authenticated batch drain single-flight guard, chunking, receipt processing, and transport-failure behavior were documented with the assistance of opencode[mimo-v2.6-flash-free]. The recovery surface and designation-status documentation were updated with assistance from OpenCode[openai/gpt-5.6-terra]. The target-scoped public multi-discipline queue behavior was documented with assistance from OpenCode[gpt-5.6-terra].
