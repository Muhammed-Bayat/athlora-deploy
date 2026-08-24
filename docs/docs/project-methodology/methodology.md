---
sidebar_position: 5
---

# Project Methodology

This document describes the lightweight delivery process used by the Athlora team. It combines a Gitea Projects Kanban board for everyday work tracking with Sprint checkpoints for planning, stakeholder feedback, and improvement.

---

## 1. Methodology Overview

Athlora uses a **lightweight Kanban-and-Sprint process**. Gitea Projects is the live Kanban board and source of day-to-day work status. Sprint windows provide a shared delivery focus and a point to review completed work, client feedback, and process improvements.

This approach fits the team because:

- **Visible flow.** The board shows all work from backlog to completion and prevents work from being lost in chat.
- **Focused delivery.** The team identifies a Sprint goal and the most valuable ready issues, while retaining flexibility when university commitments or technical dependencies change.
- **Practical coordination.** Short planning, progress, review, and improvement records create useful evidence without unnecessary ceremony.
- **Continuous quality.** Pull requests, review, automated checks, documentation, and deployment readiness are required before work reaches `Done`.

---

## 2. Core Principles

### 2.1 Shared Responsibilities

The team works cross-functionally rather than assigning permanent frontend or backend silos. For each Sprint, the team identifies who will coordinate product/client decisions and who will facilitate the workflow, blockers, and meeting record. Any team member can pick up a task based on:

- **Availability** — who has time this week.
- **Interest** — who wants to learn or strengthen a skill.
- **Context** — who is closest to the problem or has the most recent understanding of the area.

This approach keeps the bus factor low. If one member is unavailable, the rest of the team can cover their work without handoff friction because there is no ownership silo.

### 2.2 Flexible Workflow

Tasks flow through the board at their own pace. There is no rule that a card must move from "In Progress" to "Done" within a fixed window. A task stays where it is until the work is genuinely complete and passes quality gates.

This means:

- A simple documentation fix might move from "To Do" to "Done" in an hour.
- A complex feature like offline-first logging might sit in "In Progress" for days while the developer iterates, tests, and refines.
- Both are normal and expected.

### 2.3 Sprint Checkpoints

Sprint milestones are delivery checkpoints, not a restriction on useful work. At the start of a Sprint, the team records a goal, the ready issues it expects to deliver, and any important dependencies. During the Sprint, work continues to flow through the Kanban board. At the end, the team records what was delivered, client feedback, carry-over work, and one or more practical improvements for the next Sprint.

---

## 3. The Visual Board

The team uses a **Gitea Projects** board as the single source of truth for all work tracking. Every piece of work — features, bugs, documentation, infrastructure — is represented as a card on the board.

### 3.1 Board Columns

| Column | Meaning |
|---|---|
| **Backlog** | Valid work that has been identified but is not yet scheduled. Cards here are prioritised but not yet committed to. |
| **To Do** | Work that has been selected for the current cycle. The team has reviewed it, confirmed it is well-defined, and intends to start it soon. |
| **In Progress** | Someone is actively working on this. There should be a branch and ideally a draft PR linked. |
| **In Review** | The PR is open and awaiting review. No further code changes should be pushed until review feedback is addressed. |
| **Done** | The work is merged, tests pass, documentation is updated, and the card is complete. |

### 3.2 How Cards Move

```
Backlog → To Do → In Progress → In Review → Done
```

- Cards move **left to right** only. A card moves back if, for example, review reveals the work was not ready — but this is uncommon.
- A card in `In Progress` should always have a linked branch and PR. If someone is blocked, the card stays in `In Progress` and the blockage is flagged to the team.

---

## 4. Work Items

### 4.1 Issues

Every unit of work is tracked as a **Gitea issue**. Issues provide a natural place to record:

- What needs to be done (description).
- Why it needs to be done (link to the dev plan, API contract, or build spec).
- Acceptance criteria (what "done" looks like).
- Who is working on it (assignee).
- Where the code lives (linked PR).

### 4.2 Labels

Issues are categorised with labels so the team can filter and prioritise:

| Label | Scope |
|---|---|
| `frontend` | React/Vite UI work |
| `backend` | Express API, PostgreSQL, migrations |
| `docs` | Docusaurus documentation |
| `e2e` | Playwright end-to-end tests |
| `bug` | Something is broken |
| `enhancement` | Improvement to existing functionality |
| `chore` | Maintenance, dependency updates, CI changes |


---

## 5. Workflow in Practice

A typical work cycle looks like this:

1. **Plan the Sprint.** The team records a short Sprint goal and selects ready issues from `Backlog` into `To Do`.
2. **Pull from To Do.** A team member takes a selected card when they have capacity.
3. **Create a branch.** Following the [git methodology](./git-methodology), they branch off `main` with a descriptive name (e.g., `feature/live-logging-undo`).
4. **Work on the branch.** If using an agent-assisted session, the agent writes code and commits; the developer creates the branch, pushes, and reviews. If working directly, the developer commits following Conventional Commits.
5. **Open a PR (early).** Even as a draft. This signals to the team that work is underway and invites early feedback.
6. **Move to In Review.** When the PR is ready for review, the card moves to `In Review`. At least one team member reviews the diff.
7. **Address feedback.** If changes are requested, the developer (or agent) pushes fixes to the same branch. The card stays in `In Review`.
8. **Merge.** Once approved and all CI checks pass, the PR is merged into `main`. The card moves to `Done`.
9. **Review and improve.** At the Sprint checkpoint, the team reviews delivered work and feedback, then records any follow-up work or process improvement.

---

## 6. Sprint Records

Each Sprint record contains the evidence appropriate to the work completed:

- Sprint dates and goal.
- Selected issues, assignments, dependencies, and status.
- Relevant pull requests and merged implementation.
- Client feedback and resulting backlog changes.
- User-story and UAT progress where verification evidence exists.
- A short improvement action for the next Sprint.

The Sprint 1 folder contains both concise meeting records and the retained raw chat transcript. The transcript is the source evidence; the concise records are an accurate summary of its material decisions and outcomes.

---

## AI Declaration

This document was created with the assistance of opencode[mimo-v2.5-free] and updated with the assistance of OpenCode[gpt-5.6-terra].
