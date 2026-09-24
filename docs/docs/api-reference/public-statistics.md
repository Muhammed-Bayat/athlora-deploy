---
sidebar_position: 3
---

# Public Statistics

The public Stats page exposes all-time 100m performance only for clubs that a coach has explicitly published. It does not require an Athlora account or an Auth0 token.

## Publication Control

```
GET /api/v1/clubs/publication
PUT /api/v1/clubs/publication
```

Both endpoints require an authenticated member of the active club workspace. Only a `coach` can update publication.

```json
{ "publicResultsEnabled": true, "publicScheduleEnabled": false }
```

The two flags are independent. `publicResultsEnabled` gates this page's public statistics endpoints (named athlete performance, detailed reports, leaderboards). `publicScheduleEnabled` gates the separate public schedule endpoints only — turning it on or off never changes results visibility, and vice versa. The PUT body is a full replacement and requires both booleans.

Publishing results is reversible. It makes the club name, non-archived athlete names, and all-time 100m metric summaries available from the public statistics endpoints. It does not expose athlete profile information, injuries, notes, event names, venues, dates, or progression history.

## Published Clubs

```
GET /api/v1/public/statistics/clubs?q={name}
```

Returns up to 100 published clubs matching the optional case-insensitive name search. Unpublished clubs are never returned.

## Club Performance Detail

```
GET /api/v1/public/statistics/clubs/{clubId}
```

Returns `404 NOT_FOUND` if the club is unknown or not published. The response contains the established club-level all-time aggregate and current public athlete cards:

```json
{
  "data": {
    "club": {
      "id": "uuid",
      "name": "Open Track Club",
      "branding": {
        "description": "City athletics club",
        "primaryColor": "#001D3C",
        "accentColor": "#45BED7",
        "logoUrl": "/api/v1/media/clubs/uuid/logo-....png",
        "coverUrl": null
      }
    },
    "roster": { "active": 12, "inactive": 1, "archived": 2, "total": 15 },
    "fastestValidTime": 10.91,
    "averageValidTime": 11.4,
    "athletes": [
      {
        "athlete": { "id": "uuid", "name": "Ari Runner" },
        "pb": 10.91,
        "latestEffectiveResult": 11.02,
        "validResultCount": 3,
        "totalResultCount": 3,
        "average": 11.1,
        "consistency": 0.13,
        "improvement": 0.24
      }
    ]
  }
}
```

Archived athletes are excluded from `athletes`. Club aggregates retain their existing all-time comparison semantics. Effective-result rules are identical to the authenticated comparison API: cancelled events and void outcomes are excluded from valid metrics, a positive manual override takes precedence, and accepted guest-fixture results count for the athlete's club.

`club.branding` is present only when results publication is enabled. Media URLs may be null when no logo or cover has been uploaded; clients fall back to initials derived from the club name when `logoUrl` is null.

## Published session and team results

```
GET /api/v1/public/statistics/clubs/{clubId}/session-results
```

Returns `404 NOT_FOUND` if the club is unknown or not published (`publicResultsEnabled` must be true). The response lists multi-discipline meet sessions with coach-visible standings projected to safe public fields only:

```json
{
  "data": [
    {
      "eventId": "uuid",
      "eventTitle": "City Relays",
      "eventDate": "2026-09-20",
      "sessions": [
        {
          "id": "uuid",
          "label": "4x400m Final",
          "status": "completed",
          "disciplineCode": "4x400m",
          "disciplineLabel": "4x400m relay",
          "unit": "seconds",
          "precision": 2,
          "results": [
            {
              "entrantId": "uuid",
              "name": "Speed Demons",
              "kind": "relay",
              "members": [
                { "leg": 1, "name": "Ari Runner", "isGuest": false },
                { "leg": 2, "name": "Bea Dash", "isGuest": false }
              ],
              "value": 61.12,
              "outcome": "valid",
              "placing": 1,
              "isSelected": true
            }
          ]
        }
      ]
    }
  ]
}
```

Relay `members` expose only ordered leg number, display name, and guest flag. Raw `memberIds`, athlete UUIDs for members, notes, incidents, override audit fields, and private entrant details are never returned. Team times never write athlete `results` rows and therefore never affect individual PB/SB statistics. Read-time placing uses standard competition ranking with ties. The public Stats page renders these tables under the published club view.

## AI declaration

This document was created with the assistance of opencode[mimo-v2.6-flash-free]. The published session/team results endpoint was documented with the assistance of opencode[mimo-v2.6-flash-free].
