---
sidebar_position: 2
---

# Two-Athlete 100m Comparison

The two-athlete comparison endpoint provides side-by-side all-time 100m metrics and aligned progression data for exactly two athletes. It reuses the same effective result logic as the athlete statistics endpoint.

## Endpoint

```
GET /api/v1/athletes/comparison?athlete1Id={uuid}&athlete2Id={uuid}
```

## Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `athlete1Id` | UUID | Yes | First athlete's canonical ID |
| `athlete2Id` | UUID | Yes | Second athlete's canonical ID |

## Validation Rules

- Both IDs must be valid UUIDs.
- Both IDs must match different athletes.
- Both athletes must exist in the caller's workspace.
- The comparison uses the caller's resolved `workspace_id` via Auth0 token middleware.

## Response Shape

```json
{
  "data": {
    "athletes": [
      {
        "athlete": {
          "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          "name": "Alice Sprint",
          "squadNames": ["Sprint Squad"],
          "archivedAt": null
        },
        "pb": 11.20,
        "latestEffectiveResult": 11.30,
        "latestEffectiveOutcome": "valid",
        "validResultCount": 5,
        "totalResultCount": 7,
        "average": 11.35,
        "consistency": 0.12,
        "improvement": 0.30,
        "progression": [
          {
            "event": { "id": "e1", "title": "Race 1", "date": "2026-01-01", "discipline": "100m", "status": "completed" },
            "result": { "eventId": "e1", "athleteId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "discipline": "100m", "outcome": "valid", "finalResult": 11.50, "unit": "seconds", "placing": 1, "isPb": true, "isSb": true },
            "effectiveResult": 11.50,
            "effectiveOutcome": "valid",
            "countsTowardsStatistics": true,
            "runningPb": null,
            "isNewPb": true
          }
        ]
      }
    ]
  }
}
```

## Metric Definitions

| Metric | Formula | Notes |
|---|---|---|
| **PB (Personal Best)** | `MIN(effective_result)` where `effective_result IS NOT NULL` | Lowest valid 100m time in seconds |
| **Latest effective result** | `effective_result` from the most recent entry | Most recent valid result; `NULL` if no valid results |
| **Valid result count** | `COUNT(*)` where `countsTowards_statistics = TRUE` | Only void outcomes and valid results |
| **Average** | `SUM(effective_result) / COUNT(*)` | Arithmetic mean of valid results only |
| **Consistency (SD)** | Population standard deviation of valid results | Lower = more consistent times |
| **Improvement** | `earliest_valid_result - PB` | Positive = got faster; zero = no change |
| **Aligned progression** | Chronologically ordered progression entries | Both athletes' entries aligned by date for charting |

## Effective Result Logic

The effective result for each entry is derived identically to the athlete statistics endpoint:

```
CASE
  WHEN outcome IN ('dq', 'dnf', 'dns') THEN NULL
  WHEN manual_override > 0 THEN manual_override
  ELSE final_result
END
```

- **Cancelled events** are excluded (`e.status <> 'cancelled'`).
- **Void outcomes** (`dq`, `dnf`, `dns`) always produce `NULL` effective results and never count towards statistics.
- **Manual overrides** take precedence over `final_result` when present, subject to audit field validation.
- **`no_result`** entries have `final_result = NULL` and produce a `NULL` effective result.

## Query Performance

Athlete fetches are executed **sequentially** (not in parallel) to ensure predictable query ordering and avoid connection pool contention. For athletes with large histories, the progression array may be significant; the frontend handles this with lazy rendering.

## Authorization

The endpoint requires a valid Auth0 token and resolves the caller's workspace via the `resolveApplicationUser` middleware. Both athletes must belong to the caller's workspace; cross-workspace comparisons are rejected with HTTP 404.

## Scope

This endpoint is **100m-only**. The discipline filter is hardcoded in the service query (`discipline = '100m'`). Additional discipline comparisons will be added in future iterations.
