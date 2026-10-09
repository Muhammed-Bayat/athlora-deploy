---
sidebar_position: 2
---

# Product experience

Athlora supports coaches before, during, and after an athletics meet. The product is deliberately split into public information surfaces and an authenticated coach console so a club can publish selected information without exposing its working roster or event controls.

## Core workflow

1. A coach signs in through Auth0 and completes club onboarding.
2. The coach manages athletes, preferred disciplines, injuries, and season goals.
3. The coach creates a training session or competition, adds discipline sessions, and registers eligible athletes.
4. During an in-progress event, coaches and authorised loggers record results, corrections, incidents, and relay splits.
5. Athlora derives results, placing, PBs, and SBs server-side. A coach selects official attempts or finalises a session where required.
6. Coaches review results, athlete history, comparisons, reports, and the dashboard. Clubs can independently publish results and upcoming schedules.

## Shipped scope

| Area | What is available | Primary audience |
|---|---|---|
| Roster | Athlete profiles, lifecycle states, discipline preferences, goals, and injury records | Coach, assistant |
| Meets | Training/competition lifecycle, venue lookup, weather, RSVPs, fixtures, and discipline sessions | Coach, assistant |
| Live results | Timed, measured, vertical, relay, incident, correction, undo, and offline queue flows | Coach, authorised logger |
| Insight | Athlete history, PB/SB, progression, comparisons, dashboard, and PDF/CSV reporting | Coach |
| Public surfaces | Club schedule, results, reports, leaderboard, standings, and token-based public logger | Visitors, invited logger |

The supported catalogue is 100m, 200m, 400m, 800m, 1500m, 100m hurdles, 400m hurdles, long jump, triple jump, high jump, javelin, discus, shot put, and 4 x 100m relay. Multi-events and automated season scheduling remain planned rather than implied as shipped functionality.

## Access and routes

| Surface | Access | Key routes | Mobile/offline behaviour |
|---|---|---|---|
| Coach console | Auth0, current club membership | `/console`, `/console/athletes`, `/console/events`, `/console/live`, `/console/account` | Responsive console; logging actions can queue offline |
| Public logger | Token in URL | `/log/:token` | Responsive; token-scoped offline queue |
| Public results | Club has enabled results publication | `/stats*` | Responsive, no Auth0 bootstrap |
| Public schedule | Club has enabled schedule publication | `/schedule*` | Responsive, no Auth0 bootstrap |

The current membership rule permits one club workspace per user. The API still resolves the active workspace from `X-Workspace-Id` so every protected request has an explicit authorization scope; it is not evidence of multi-workspace switching.

## Interface principles

- **Track-side first:** live entry controls, recovery states, and result boards prioritise narrow screens and touch targets.
- **Server-authoritative results:** the browser records observations; the API derives results, placings, PBs, and SBs.
- **Visible recovery:** loading, empty, error, conflict, queued-offline, and retry states are intentional UI states rather than silent failures.
- **Public by explicit choice:** results and schedules have separate club publication flags. Disabled and unknown public clubs use the same unavailable response.
- **Progressive enhancement:** public pages bypass Auth0, the PWA retains an app shell, and the heavier 3D injury viewer loads only when requested.

See [Architecture overview](./overview) for system boundaries, [API contract](../api-reference/contract) for endpoint behaviour, and [Accessibility and responsive design](../quality/accessibility-responsive) for implementation and verification evidence.

## AI declaration

This document was created or updated with the assistance of OpenCode[openai/gpt-5.6-terra].
