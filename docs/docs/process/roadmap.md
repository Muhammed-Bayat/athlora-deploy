---
sidebar_position: 4
---

# Delivery Roadmap

This is the living delivery roadmap for Athlora, an athletics coaching application. It records completed work from Gitea issues and pull requests, then defines the next planned stages. Status is changed only when the implementation, tests, and relevant documentation have landed.

## Product Direction

Athlora is intended to support a complete athletics meet and season:

- **Timed track events:** sprints, middle and long distance, hurdles, relays, and race walks.
- **Measured field events:** horizontal jumps, throws, high jump, and pole vault.
- **Meet and season workflows:** athletes, training, competitions, assignments, live results, PB/SB progression, weather, shared fixtures, reporting, and scheduling.

The delivered vertical slice is currently **100m timing in seconds**. It proves the shared foundations, not the permanent product boundary. Every additional discipline must add its own contract, validation, logger controls, result derivation, placing rules, PB/SB comparison, and tests.

## Core Model

```text
users              coach identity and role
athletes           coach-owned roster, profile, squad, notes, archival state
events             competition or training event, discipline, venue, lifecycle
event_participants athlete assignment and RSVP state
timeline_entries   append-only, versioned live observations and tombstones
results            derived per athlete/event/discipline result and audited override
account_deletions  durable account-deletion and retry state
```

The timeline is the system of record for live activity. Results, placing, PBs, and SBs are derived from it and recomputed by the API. Manual corrections remain auditable rather than replacing the source observation.

## Completed Roadmap

### Phase 1: Platform and Contract Foundation

**Status: Complete**

Established the non-monolithic React/Vite frontend, Express API, PostgreSQL migrations, Auth0 authentication, deployed service foundations, Gitea CI, and documentation site. The first API contract deliberately fixed the implemented discipline to 100m/seconds while keeping the schema ready for additional athletics contracts.

| Work tracked | Delivered through |
|---|---|
| Project scaffold, approved branding, UI conversion, Neon, Auth0, deployments, and docs deployment: issues `#9`, `#11`, `#12`, `#16`-`#20` | PRs `#1`, `#2`, `#3`, `#4`, `#5`, `#6`, `#8`, `#19` |
| Shared 100m contract, authentication/ownership, validation, transaction utilities, and typed frontend API behavior: issues `#23`-`#27` | PRs `#49`, `#50`, `#51`, `#52` |

Key outcomes:

- Separate Vercel SPA, Render API, Neon PostgreSQL, and Cloudflare Pages documentation deployments.
- Auth0 Universal Login, verified JWTs, local-user synchronization, and non-enumerating coach ownership checks.
- Checksum-tracked SQL migrations and structured API validation/error responses.
- Shared 100m result DTOs and pure result-derivation foundations.

### Phase 2: Roster and Event Management

**Status: Complete**

Delivered the coach's day-to-day roster and event workflow, including preservation of historical data when an athlete is archived, an assignment is removed, or an event is cancelled.

| Work tracked | Delivered through |
|---|---|
| Athlete API, roster UI, and athlete performance detail: issues `#28`-`#31` | PRs `#54`, `#57`, `#67`, `#68` |
| Event lifecycle, participant API/UI, and event-management UI: issues `#32`-`#36` | PRs `#55`, `#56`, `#58`, `#59` |
| Event-day venue forecast | PR `#70` |

Key outcomes:

- Coach-owned athlete create, edit, archive, restore, filters, profiles, and 100m performance history.
- Competition/training event lifecycle, cancellation-as-history-preservation, event list/calendar views, and participant RSVP management.
- Open-Meteo venue forecasts and authenticated current-weather data for the coach console.

### Phase 3: Live 100m Results and Coaching Insight

**Status: Complete**

Delivered the 100m track-side workflow from event start through derived outcomes, correction, completion, athlete statistics, and dashboard summary.

| Work tracked | Delivered through |
|---|---|
| Result engine, live-entry API, version-aware corrections, recomputation, and overrides: issues `#37`-`#42` | PRs `#53`, `#60`, `#61`, `#62`, `#63` |
| Athlete statistics, aggregates, logger, results UI, dashboard, and verification: issues `#43`-`#48` | PRs `#64`, `#65`, `#66`, `#71`, `#73`, `#74` |
| Account lifecycle management | PR `#69` |

Key outcomes:

- Mobile-first 100m finish, incident, note, correction, and undo logging with optimistic versions.
- Transactional derived outcomes for valid results, DQ, DNF, DNS, placing, PBs, SBs, and audited manual overrides.
- Athlete statistics, live/summary dashboard states, current event progress, recent results, and PB feeds.
- Permanent account deletion with durable tombstones and retry reconciliation.
- Desktop/mobile Playwright vertical-slice coverage, accessibility audits, and cross-coach authorization integration tests.

`#71` was closed without a formal merge, but its dashboard work was incorporated during the `#73` conflict-resolution sequence and is present on `main`.

### Phase 4: Experience and Release Hardening

**Status: Complete**

Polished the public landing experience and authenticated console after the core workflow was in place.

| Work tracked | Delivered through |
|---|---|
| Landing-page redesign and mockup-matched cinematic track | PRs `#75`, `#76` |
| Premium coach-console redesign, theme controls, weather readout, and filter refinements | PR `#77` |

The console uses real dashboard data rather than mockup figures. The landing page and console retain responsive and reduced-motion behavior.

## Planned Roadmap

### Stage 2: Full Athletics Events and Connected Coaching

**Status: Planned**

#### 2.1 Discipline Expansion

1. Add timed contracts for 200m/400m, middle and long distance, hurdles, relays, and race walks.
2. Add measured contracts for long jump, triple jump, throws, high jump, and pole vault.
3. Give every discipline explicit unit, validation, timeline-entry, derivation, placing, PB/SB, and presentation rules.
4. Add migration, unit, API, component, and browser coverage with each discipline; do not loosen the 100m contract as a shortcut.

#### 2.2 Roles, Fixtures, and Shared Calendar

1. Enforce coach, assistant, and viewer permissions. For example, assistants may log an event but cannot archive athletes.
2. Extend fixtures so another coach's squad can participate without exposing unrelated workspace data.
3. Add shared calendar views, RSVP workflows, and event reminders.
4. Add API and Playwright permission coverage for each role.

#### 2.3 Season Analysis

1. Add season totals and discipline-aware athlete/squad comparisons.
2. Use Chart.js for PB/SB progression and comparison charts once the aggregate data is stable.
3. Add chart tests using seeded, multi-discipline data.

#### 2.4 Offline-First Logging

1. Add Dexie/IndexedDB so live entries are written locally before network sync.
2. Add `vite-plugin-pwa` for an installable shell and service-worker caching.
3. Drain queued actions in order on reconnect; Stage 2 uses last-write-wins while Stage 3 adds deterministic merge rules.
4. Add Socket.IO event rooms for live updates when online.
5. Add Playwright coverage for offline logging, reconnection, and synchronization.

### Stage 3: Collaborative Meets and Season Tools

**Status: Planned**

#### 3.1 Multi-Device Offline Merge

1. Give every locally created action a unique ID before it reaches the server.
2. Add batch sync in PostgreSQL transactions with version checks and a durable audit trail.
3. Keep concurrent new entries, resolve concurrent edits deterministically, and preserve undo tombstones.
4. Recompute results after each accepted batch so every device converges on the same outcome.
5. Test different reconnection orders across two simulated devices.

#### 3.2 Public Results and Exports

1. Add standings and explicitly allow-listed, read-only public athlete/squad result pages.
2. Generate athlete and event PDF/CSV reports with `pdf-lib`.

#### 3.3 Coaching Summaries and Scheduling

1. Add rule-based summaries such as consecutive PBs and selection suggestions; this remains deterministic application logic, not an external AI service.
2. Generate season schedules from fixtures, venues, and availability, with athlete and venue clash warnings.

## Quality Gates

Every roadmap item is complete only when its implementation and documentation are aligned, relevant tests pass, and the applicable CI checks are green. The current CI runs frontend, backend, documentation, and credential-gated E2E jobs. New work must preserve the coach-ownership boundary, responsive track-side interaction, accessible controls, and server-authoritative result derivation.

## AI Declaration

This document was created with the assistance of Codex[GPT-5] and opencode[deepseek-v4-flash-free], and updated with the assistance of OpenCode[gpt-5.6-terra].
