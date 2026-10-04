---
sidebar_position: 6
---

# Comparisons

The Compare page supports calendar-year and all-time athlete and club analysis across every catalogue discipline. All responses use effective results: void outcomes are excluded and a positive manual override takes precedence over the recorded final result.

## Season Scope

All comparison and club-statistics endpoints accept an optional `year` query parameter. Omit it to use the current UTC calendar year, pass a four-digit calendar year such as `2025` for a historical season, or pass `all` for all-time analysis. `GET /api/v1/workspaces/seasons` returns the authenticated workspace's available years plus the current year; public clients can use `GET /api/v1/public/statistics/seasons`.

## Athlete Comparison

```
GET /api/v1/athletes/comparison?athlete1Id={uuid}&athlete2Id={uuid}&year=2026
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

Both athlete endpoints return side-by-side scoped bests, latest effective result, valid-result count, average, population standard deviation, improvement, and chronological progression entries for charting. They also return `availableDisciplines` and a per-athlete `disciplines[]` array, so the Compare page renders one tab per catalogue discipline alongside the legacy aggregate fields. Official relay leg splits are unioned into these rows under the relay discipline's code (for example `4x100m`), so a relay PB and its progression entry appear on the comparison graph under that tab.

### Multi-Athlete Comparison

```
GET /api/v1/athletes/comparison/multi?athleteId={uuid}&athleteId={uuid}&year=2026
```

- Repeat `athleteId` once per athlete; 2–5 unique UUIDs are required, otherwise `422 ATHLETE_IDS_INVALID`.
- Accepts the same `scope=cross-club` and `year` parameters as the pair routes; cross-club multi requires athletes from at least two club workspaces.
- Returns `{ athletes: [...], availableDisciplines: [...] }` with the same per-athlete shape as the pair endpoint.

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
GET /api/v1/clubs/{clubId}/statistics?year=2026
```

Returns the selected season's performance for the club's current roster. The response carries the legacy 100m aggregate at the top level:

- Roster counts for active, inactive, archived, and total athletes.
- Distinct athletes with valid results.
- Total and valid 100m result counts (`total100mResultCount`, `valid100mResultCount`).
- Fastest and latest valid 100m time.
- Average, median, and population standard deviation of valid 100m times.
- Club branding summary (`description`, `primaryColor`, `logoUrl`, `coverUrl`) when present.

…plus the per-discipline breakdown `availableDisciplines` and `disciplines[]`. Each discipline entry carries its catalogue metadata (`code`, label, unit, precision, direction) with roster counts, distinct athletes with valid results, total/valid result counts, and fastest/latest/average/median/standard-deviation values for that discipline. Athlete-comparison rows union official relay leg splits under the relay discipline's code (for example `4x100m`); club-statistics rows count finalized relay team results instead — each team result counted once and attributed to the club's own members, so the fastest value is the best summed team total and the counts cover team results and the members who raced in them. Only supported-catalogue disciplines are listed.

## Club Comparison

```
GET /api/v1/clubs/comparison?club1Id={uuid}&club2Id={uuid}
```

Compares exactly two distinct clubs using the same selected-season statistics returned by the single-club endpoint. Duplicate club IDs return `400 DUPLICATE_CLUB_ID`; unknown clubs return `404 CLUB_NOT_FOUND`.

### Multi-Club Comparison

```
GET /api/v1/clubs/comparison/multi?clubId={uuid}&clubId={uuid}
```

Repeat `clubId` once per club; 2–5 unique UUIDs are required, otherwise `422 CLUB_IDS_INVALID`. Returns `{ clubs: [...] }` where each element is the single-club statistics object above.

## Effective Result Scope

- The legacy top-level aggregate is pinned to 100m and measured in seconds; `disciplines[]` entries use their own catalogue unit (seconds, metres, cm) and direction (lower-is-better or higher-is-better).
- Preference-only `disciplines[]` rows (athletes who prefer a discipline without results yet) are limited to the supported catalogue; retired codes (`4x400m`, `hammer`) are never listed.
- Cancelled events are excluded.
- `dq`, `dnf`, and `dns` outcomes never count as valid results.
- A positive `manualOverride` is used instead of `finalResult`.
- An athlete's result at an accepted guest fixture counts for their own club's statistics and progression.

## AI declaration

This document was created with the assistance of opencode[mimo-v2.5-free]. The club branding summary field was documented with the assistance of opencode[mimo-v2.6-flash-free]. The club accent-colour removal was documented with OpenCode[openai/gpt-5.6-terra]. Relay leg splits feeding athlete and club `disciplines[]` rows and the supported-catalogue preference filter were documented with the assistance of opencode[mimo-v2.6-flash-free]. The team-based club-statistics relay aggregation and the athlete-versus-club relay row wording were documented with the assistance of opencode[mimo-v2.6-flash-free].
