---
sidebar_position: 7
---

# Athlete Progression

The progression endpoint provides a chronological 100m result history for a single athlete, with running personal-best tracking and cursor-based pagination. It is designed to power progression charts and detailed performance analysis.

All paths are relative to `/api/v1`. Authentication is required.

## Endpoint

```
GET /api/v1/athletes/:id/progression
```

## Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `cursor` | string | No | Pagination cursor from previous response |
| `limit` | number | No | Page size (default 50, max 200) |
| `type` | `competition` \| `training` | No | Filter by event type |

## Response Shape

```json
{
  "data": {
    "athlete": {
      "id": "uuid",
      "name": "Usain Bolt",
      "squadNames": ["Sprint Squad"],
      "archivedAt": null
    },
    "entries": [
      {
        "event": {
          "id": "uuid",
          "title": "Spring Invitational",
          "type": "competition",
          "discipline": "100m",
          "date": "2026-01-15",
          "time": "10:00:00",
          "locationName": "Main Stadium",
          "status": "completed"
        },
        "result": {
          "eventId": "uuid",
          "athleteId": "uuid",
          "discipline": "100m",
          "outcome": "valid",
          "finalResult": 10.45,
          "unit": "seconds",
          "placing": 1,
          "isPb": true,
          "isSb": true,
          "manualOverride": null,
          "overrideReason": null,
          "overriddenBy": null,
          "overrideAt": null
        },
        "effectiveResult": 10.45,
        "effectiveOutcome": "valid",
        "countsTowardsStatistics": true,
        "runningPb": null,
        "isNewPb": true
      },
      {
        "event": { "..." : "..." },
        "result": { "..." : "..." },
        "effectiveResult": 10.52,
        "effectiveOutcome": "valid",
        "countsTowardsStatistics": true,
        "runningPb": 10.45,
        "isNewPb": false
      }
    ],
    "pagination": {
      "nextCursor": "2026-02-01|10:30:00|event-uuid",
      "count": 2,
      "total": 15
    },
    "summary": {
      "allTimePb": 10.45,
      "totalResults": 15,
      "totalValid": 12
    }
  }
}
```

## Field Definitions

### Entry fields

| Field | Type | Description |
|---|---|---|
| `effectiveResult` | number \| null | The effective result after considering overrides: override value if present and positive, otherwise `finalResult` |
| `effectiveOutcome` | string | The effective outcome: `valid` if a positive override promotes a `no_result`, otherwise the derived `outcome` |
| `countsTowardsStatistics` | boolean | `true` if the event is not cancelled and the effective outcome is `valid` |
| `runningPb` | number \| null | The best effective result before this entry (null if this is the first valid result) |
| `isNewPb` | boolean | `true` if this entry's `effectiveResult` is lower than `runningPb` (or is the first valid result) |

### Summary fields

| Field | Type | Description |
|---|---|---|
| `allTimePb` | number \| null | The athlete's all-time best effective result for 100m |
| `totalResults` | number | Total number of non-cancelled results |
| `totalValid` | number | Number of results with `effectiveOutcome = 'valid'` |

## Effective Result Logic

The effective result is computed identically to the statistics endpoint:

```sql
CASE
  WHEN outcome IN ('dq', 'dnf', 'dns') THEN NULL
  WHEN manual_override > 0 THEN manual_override
  ELSE final_result
END
```

- **Cancelled events** are excluded
- **Void outcomes** (`dq`, `dnf`, `dns`) always produce `NULL` effective results
- **Manual overrides** take precedence over `final_result` when positive
- **`no_result`** entries have `final_result = NULL` and produce `NULL` effective results

## Running PB Logic

Entries are ordered chronologically (date ASC, time ASC with nulls last, event creation ASC, event ID ASC). For each entry with a valid effective result:

1. If `runningPb` is null, this is the first valid result → `isNewPb = true`
2. If `effectiveResult < runningPb`, this is a new PB → `isNewPb = true`
3. Otherwise → `isNewPb = false`

The `runningPb` for each entry is the minimum `effectiveResult` of all preceding entries.

## Pagination

Uses cursor-based pagination. The cursor is a composite key: `date|time|eventId`. The next page returns entries after the cursor in the same sort order.

- Omit `cursor` for the first page
- Use `pagination.nextCursor` from the previous response for the next page
- When `nextCursor` is `null`, all entries have been returned
- `pagination.count` is the number of entries in the current page
- `pagination.total` is the total number of non-cancelled results for the athlete

## Authorization

Requires a valid Auth0 token and athlete ownership (the athlete must belong to the caller's workspace). Cross-workspace access returns `404 NOT_FOUND`.

## Scope

This endpoint is **100m-only**. The discipline filter is hardcoded to `discipline = '100m'`. Additional discipline progression will be added in future iterations.

## AI declaration

This document was created with the assistance of opencode[mimo-v2.5-free].
