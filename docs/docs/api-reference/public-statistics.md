---
sidebar_position: 7
---

# Public Statistics

The public Stats page exposes published performance across every catalogue discipline — legacy 100m plus timed, measured, vertical, and relay session results — for clubs that a coach has explicitly published. It does not require an Athlora account or an Auth0 token.

```
GET /api/v1/public/statistics/seasons
GET /api/v1/public/statistics/clubs
GET /api/v1/public/statistics/clubs/{clubId}
GET /api/v1/public/statistics/clubs/{clubId}/session-results
GET /api/v1/public/statistics/clubs/{clubId}/vertical
GET /api/v1/public/statistics/clubs/{clubId}/disciplines
GET /api/v1/public/statistics/comparison
GET /api/v1/public/statistics/report
GET /api/v1/public/statistics/report/disciplines
GET /api/v1/public/statistics/leaderboard
GET /api/v1/public/statistics/standings
```

Every endpoint below is documented in its own section.

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

Publishing results is reversible. It makes the club name, non-archived athlete names, published metric summaries for every catalogue discipline, and finalized detailed report performances available from the public statistics endpoints. It never exposes athlete profile information, injuries, notes, raw timeline entries, audit fields, or manual-override metadata.

## Published Clubs

```
GET /api/v1/public/statistics/clubs?q={name}
```

Returns up to 100 published clubs matching the optional case-insensitive name search. Unpublished clubs are never returned.

## Club Performance Detail

```
GET /api/v1/public/statistics/clubs/{clubId}
```

Returns `404 NOT_FOUND` if the club is unknown or not published. The response contains the club-level aggregate (legacy 100m top level plus per-discipline `disciplines[]`), `availableDisciplines` for filter UIs, and current public athlete cards:

```json
{
  "data": {
    "club": {
      "id": "uuid",
      "name": "Open Track Club",
      "branding": {
        "description": "City athletics club",
        "primaryColor": "#001D3C",
        "logoUrl": "/api/v1/media/clubs/uuid/logo-....png",
        "coverUrl": null
      }
    },
    "roster": { "active": 12, "inactive": 1, "archived": 2, "total": 15 },
    "fastestValidTime": 10.91,
    "averageValidTime": 11.4,
    "availableDisciplines": [
      { "discipline": "100m", "label": "100m", "unit": "seconds", "precision": 2, "direction": "lower" }
    ],
    "disciplines": [
      {
        "discipline": "long_jump",
        "label": "Long jump",
        "unit": "metres",
        "precision": 2,
        "direction": "higher",
        "rosterAthleteCount": 8,
        "distinctAthletesWithValidResults": 5,
        "totalResultCount": 17,
        "validResultCount": 15,
        "fastestValidResult": 6.42,
        "averageValidResult": 5.98,
        "medianValidResult": 6.1,
        "populationStandardDeviation": 0.31
      }
    ],
    "athletes": [
      {
        "athlete": { "id": "uuid", "name": "Ari Runner" },
        "pb": 10.91,
        "latestEffectiveResult": 11.02,
        "validResultCount": 3,
        "totalResultCount": 3,
        "average": 11.1,
        "consistency": 0.13,
        "improvement": 0.24,
        "disciplines": [
          {
            "discipline": "long_jump",
            "label": "Long jump",
            "unit": "metres",
            "precision": 2,
            "direction": "higher",
            "pb": 6.42,
            "latestEffectiveResult": 6.1,
            "validResultCount": 4,
            "average": 6.05,
            "consistency": 0.22,
            "improvement": 0.31
          }
        ]
      }
    ]
  }
}
```

Archived athletes are excluded from `athletes`. Club aggregates retain their existing all-time comparison semantics. Effective-result rules are identical to the authenticated comparison API: cancelled events and void outcomes are excluded from valid metrics, a positive manual override takes precedence, and accepted guest-fixture results count for the athlete's club.

`club.branding` is present only when results publication is enabled. Media URLs may be null when no logo or cover has been uploaded; clients fall back to initials derived from the club name when `logoUrl` is null.

## Seasons and athlete comparison

```
GET /api/v1/public/statistics/seasons
GET /api/v1/public/statistics/comparison?athleteId={uuid}&athleteId={uuid}&year={year|all}
```

`/seasons` lists every year with published performances plus the current year. `/comparison` compares two to five published athletes (repeat `athleteId` once per athlete; otherwise `422 ATHLETE_IDS_INVALID`) and returns each athlete's safe identity, per-discipline bests, and chronological 100m progression for charting. It never exposes date of birth, notes, injuries, or other private profile fields.

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
          "label": "4 × 100m relay Final",
          "status": "completed",
          "disciplineCode": "4x100m",
          "disciplineLabel": "4 × 100m relay",
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

Relay `members` expose only ordered leg number, display name, and guest flag. Raw `memberIds`, athlete UUIDs for members, notes, incidents, override audit fields, and private entrant details are never returned. Team times never write athlete `results` rows and therefore never affect individual PB/SB statistics. Read-time placing uses standard competition ranking with ties. The public Stats page renders these tables under the published club view: the section is mounted for the selected club discipline, so relay team rows reappear as soon as a relay discipline tab is selected, and sessions for other disciplines are filtered out client-side.

## Published discipline and vertical statistics

```
GET /api/v1/public/statistics/clubs/{clubId}/vertical?year={year|all}
GET /api/v1/public/statistics/clubs/{clubId}/disciplines?year={year|all}
```

Both return per-athlete PB/SB statistics for a published club's roster — `/vertical` scoped to vertical events, `/disciplines` covering every catalogue discipline. Official relay leg splits are unioned into `/disciplines` under the relay discipline's code (for example `4x100m`), so a relay leg PB surfaces on the public athlete cards, athlete comparison rows, and each discipline's progression entries. They return `404 NOT_FOUND` for an unknown, non-canonical, or unpublished club, and resolve `year=all` to the current UTC year.

## Detailed Statistics Reports

```
GET /api/v1/public/statistics/report?discipline={code}&season={year|all}&club={uuid}&gender={male|female}&age={5..100}
GET /api/v1/public/statistics/report/disciplines
```

The unauthenticated `/stats/report` page keeps these filters in its shareable URL and reads the endpoint live, so it never serves a stored private snapshot. `age` is an exact whole-number age from 5 to 100, calculated against each performance's event date; athletes without a recorded date of birth do not match an age-filtered report. Its searchable discipline selector reads `/report/disciplines`, which returns canonical `{ code, label }` values for every configured discipline. Selecting a discipline without eligible results shows the normal empty state. The report response includes completed legacy 100m results, completed/final individual session performances, and finalized relay team rows — each relay appears as its team name with the summed team result and public standing. Each row contains safe athlete and club names, discipline presentation, performance, public standing, event title and date. Cancelled events, archived athletes, provisional sessions, invalid outcomes, withdrawn registrations, guests and unpublished clubs are excluded. Because a relay team has no gender or age, gender-filtered and age-filtered reports never match relay rows, even for a relay discipline.

The report page generates matching CSV and branded PDF downloads in the browser. CSV cells are quoted and values beginning with spreadsheet formulas are escaped. PDF and CSV exports contain the same filtered data displayed in the report.

## Athlete Leaderboard And Club Standings

```
GET /api/v1/public/statistics/leaderboard?discipline={code}&season={year|all}&club={uuid}&gender={male|female}&age={5..100}
GET /api/v1/public/statistics/standings?season={year|all}
```

`/stats/leaderboard` ranks one eligible best performance per athlete and per relay team. `age` uses the same exact, birthday-aware event-date calculation as reports. Timed disciplines rank lower values first; measured disciplines rank higher values first. Equal performances share standard competition places (`1, 1, 3`). The all-time scope uses each athlete's personal best (or the team's best finalized result); a selected season uses their season best. Relay rows carry the team name and club in place of an athlete identity, and gender and age filters never match them. Legacy 100m and finalized individual session performances are included only when their club has published results.

`/stats/standings` ranks public clubs across completed shared fixtures. A fixture must have an accepted guest at its current revision. Valid final individual and relay places earn 5 points for first, 3 for second, and 1 for third; relay points are awarded once to the relay's club. Clubs tie only when points, wins, second places, and third places all match. Private clubs, withdrawn teams, guests, and invalid or provisional results never appear.

## AI declaration

This document was created or updated with the assistance of OpenCode[openai/gpt-5.6-terra].
