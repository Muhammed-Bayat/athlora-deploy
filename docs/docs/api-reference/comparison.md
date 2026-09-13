---
sidebar_position: 2
---

# 100m Comparisons

The Compare page supports all-time 100m athlete and club analysis. All responses use effective results: void outcomes are excluded and a positive manual override takes precedence over the recorded final result.

## Athlete Comparison

```
GET /api/v1/athletes/comparison?athlete1Id={uuid}&athlete2Id={uuid}
```

The default comparison is restricted to two distinct athletes in the caller's club workspace.

### Cross-Club Athlete Comparison

```
GET /api/v1/athletes/comparison?athlete1Id={uuid}&athlete2Id={uuid}&scope=cross-club
```

- Both IDs are required, valid UUIDs, and must be different.
- The athletes must belong to different club workspaces.
- The caller must be an authenticated member of an application workspace.
- The response contains only the existing safe comparison identity and performance fields. It never exposes date of birth, notes, injury data, or other private athlete profile fields.
- The UI requires users to select two clubs first, then search each club's roster by name before selecting the athletes.

Both athlete endpoints return side-by-side all-time 100m PB, latest effective result, valid-result count, average, population standard deviation, improvement, and chronological progression entries for charting.

## Club Roster Lookup

```
GET /api/v1/clubs/{clubId}/athletes?q={name}
```

This authenticated lookup supports the cross-club athlete selectors. `q` is optional and case-insensitive. Archived athletes are excluded. The response exposes only safe selection data:

```json
{
  "data": [
    { "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "name": "Alice Sprint", "status": "active" }
  ],
  "meta": { "count": 1 }
}
```

## Club Statistics

```
GET /api/v1/clubs/{clubId}/statistics
```

Returns all-time 100m performance for the club's current roster, including:

- Roster counts for active, inactive, archived, and total athletes.
- Distinct athletes with valid results.
- Total and valid 100m result counts.
- Fastest and latest valid time.
- Average, median, and population standard deviation of valid times.

## Club Comparison

```
GET /api/v1/clubs/comparison?club1Id={uuid}&club2Id={uuid}
```

Compares exactly two distinct clubs using the same all-time statistics returned by the single-club endpoint. Duplicate club IDs return `400 DUPLICATE_CLUB_ID`; unknown clubs return `404 CLUB_NOT_FOUND`.

## Effective Result Scope

- The discipline is fixed to 100m and values are measured in seconds.
- Cancelled events are excluded.
- `dq`, `dnf`, and `dns` outcomes never count as valid results.
- A positive `manualOverride` is used instead of `finalResult`.
- An athlete's result at an accepted guest fixture counts for their own club's statistics and progression.
