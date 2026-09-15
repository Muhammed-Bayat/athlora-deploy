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

```
Reported → Triaged → In Progress → Verified → Closed
```

- **Reported:** bug is entered into the tracker with reproduction steps.
- **Triaged:** the team reviews severity and assigns ownership.
- **In Progress:** a fix is being developed on a branch.
- **Verified:** the fix has been tested in the affected environment and merged.
- **Closed:** the defect is resolved and no longer reproduces.

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

## Improvement

Sprint 2 identified that keeping the bug tracker current with reproducible descriptions and affected environment, then verifying the relevant local, production, and automated-test paths before release, reduces regression cycles. This is carried forward as a process improvement for subsequent Sprints.

## AI declaration

This document was created with the assistance of opencode[mimo-v2.5-free].
