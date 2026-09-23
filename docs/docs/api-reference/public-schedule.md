---
sidebar_position: 4
---

# Public Schedule

The public schedule exposes only upcoming meet metadata for clubs that a coach has explicitly published. It does not require an Athlora account or an Auth0 token. It is gated by the independent `publicScheduleEnabled` publication flag and never shares a gate with public results.

## Visibility rules

- Only clubs with `publicScheduleEnabled = true` are visible; unknown or unpublished clubs return `404 NOT_FOUND` with the same generic code (non-enumerating).
- Upcoming means `date >= today` (UTC) with status `scheduled` or `in_progress`. Completed and cancelled events are never returned.
- Responses contain only club identity and event metadata: title, date, time, type, discipline, venue (`locationName`), and status.
- Athlete rosters, guest rosters, participants, results, timeline entries, injuries, and notes are never published by these endpoints — independent of either publication flag.

## Publication control

The schedule flag is managed through the same coach-only endpoints as results (see the [public statistics reference](./public-statistics) for auth details):

```
GET /api/v1/clubs/publication
PUT /api/v1/clubs/publication
```

```json
{ "publicResultsEnabled": false, "publicScheduleEnabled": true }
```

## Published schedule clubs

```
GET /api/v1/public/schedule/clubs?q={name}
```

Returns up to 100 clubs with a published schedule matching the optional case-insensitive name search. Unpublished clubs are never returned.

```json
{ "data": [{ "id": "uuid", "name": "Open Track Club", "branding": { "description": null, "primaryColor": null, "accentColor": null, "logoUrl": null, "coverUrl": null } }], "meta": { count: 1 } }
```

## Upcoming club schedule

```
GET /api/v1/public/schedule/clubs/{clubId}
```

Returns `404 NOT_FOUND` if the club is unknown or its schedule is not published. The response contains the club identity and its upcoming events:

```json
{
  "data": {
    "club": {
      "id": "uuid",
      "name": "Open Track Club",
      "branding": { "description": null, "primaryColor": null, "accentColor": null, "logoUrl": null, "coverUrl": null }
    },
    "events": [
      {
        "id": "uuid",
        "title": "Spring Open",
        "date": "2026-10-01",
        "time": "10:00:00",
        "type": "competition",
        "discipline": "100m",
        "locationName": "City Track",
        "status": "scheduled"
      }
    ]
  }
}
```

Events are ordered by date ascending, then time ascending (nulls last), then creation time. `discipline` is nullable for multi-discipline meets. `club.branding` is present only when schedule publication is enabled.

## AI declaration

This document was created with the assistance of opencode[mimo-v2.6-flash-free]. Club branding fields were documented with the assistance of opencode[mimo-v2.6-flash-free].
