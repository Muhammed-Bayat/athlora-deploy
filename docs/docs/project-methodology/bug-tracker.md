---
sidebar_position: 6
---

# Bug Tracker

This document records how the Athlora team tracks and resolves defects during each Sprint.

## Approach

The team maintains a separate bug tracker alongside the Gitea Projects Kanban board. Bugs are entered with:

- A clear, reproducible description
- Affected environment (local, production, or both)
- Steps to reproduce
- Expected vs actual behaviour
- Severity (critical, major, minor)
- Assigned owner where known

## Workflow

The canonical flow is the Gitea Projects board documented in [Project Methodology](./methodology):

```
Backlog → To Do → In Progress → Verification → Done
```

The bug tracker keeps its own defect-specific labels, which map onto those board columns rather than replacing them:

| Bug state | Board column | Meaning |
|---|---|---|
| **Reported** | Backlog / To Do | Bug is entered into the tracker with reproduction steps. |
| **Triaged** | To Do | The team reviews severity and assigns ownership. |
| **In Progress** | In Progress | A fix is being developed on a branch. |
| **Verified** | Verification | The fix has been tested in the affected environment and merged. |
| **Closed** | Done | The defect is resolved and no longer reproduces. |

## Sprint 2 Bug Tracking

During Sprint 2, the team adopted a bug tracker to complement the Kanban board. Key defects tracked included:

- Light-theme colour issues
- Injury visual on athlete tiles
- Progression chart E2E failures
- Live-weather provider reliability
- Navigation controls and page-return behaviour
- Comparison and progression errors
- Venue selection and event weather
- Fixture invitation flows
- Public logger session management
- Slow loading and refresh prompts

The tracker was used to prioritise fixes between the client review (3 September) and the stabilisation period (9–14 September). Local-vs-deployed discrepancies were recorded as separate categories to avoid regression cycles.

## Sprint 3 Bug Tracking

During Sprint 3 the tracker ran alongside Gitea issues and delivery rows. Key defects tracked were:

- Past-events ordering and chart-colour readability: issues `#234`, `#235` (PRs `#255`, `#256`)
- AI assistant voice command and idle-sleep behaviour: issue `#236` (PR `#257`)
- Discipline rule typing and hurdle-count validation regressions: issues `#245`, `#246` (PRs `#268`, `#269`)
- Offline logger visibility, recovery surface, and sync reconciliation: issues `#252`, `#254` (PRs `#275`, `#285`)
- Multi-discipline public meet logger sessions and public report-filter navigation: issue `#251` (PRs `#279`, `#291`)
- Injury delete confirmation: issue `#316` (PR `#322`)
- Stabilisation regressions without their own issue numbers — offline-logger grant alias, unit-only session-result rows, progression history, current-day calendar entries, and the DQ/DNF/DNS undo path (PRs `#301`, `#308`, `#320`, `#321`)

Defects surfaced during the 25–28 September product-flow testing were turned into focused fixes rather than absorbed into feature branches, and external Gitea/deployment-trigger instability was tracked separately from product defects so it did not mask local-versus-deployed differences.

## Improvement

Sprint 2 identified that keeping the bug tracker current with reproducible descriptions and affected environment, then verifying the relevant local, production, and automated-test paths before release, reduces regression cycles. This carried into Sprint 3, where the tracker was used alongside Gitea issues, delivery rows, and pull requests through the stabilisation window, and it remains a process improvement for subsequent Sprints.

## AI declaration

This document was created with the assistance of opencode[mimo-v2.5-free]. The Sprint 3 section and workflow reconciliation were updated with the assistance of opencode[mimo-v2.6-flash-free].
