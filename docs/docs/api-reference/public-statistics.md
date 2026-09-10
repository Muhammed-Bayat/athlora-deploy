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
{ "publicResultsEnabled": true }
```

Publishing is reversible. It makes the club name, non-archived athlete names, and all-time 100m metric summaries available from the public endpoints. It does not expose athlete profile information, injuries, notes, event names, venues, dates, or progression history.

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
    "club": { "id": "uuid", "name": "Open Track Club" },
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
