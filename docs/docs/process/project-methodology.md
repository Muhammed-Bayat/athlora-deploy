---
sidebar_position: 5
---

# Project Methodology

This document describes how the Athlora team organises work, tracks progress, and delivers features. It covers the Agile framework, team roles, workflow, and the visual board.

---

## 1. Methodology Overview

Athlora follows the **Kanban** Agile methodology. Kanban is a pull-based workflow system that visualises work in progress, limits multitasking, and emphasises continuous delivery over fixed iteration cadences.

Kanban fits because:

- **No ceremony overhead.** There are no sprint planning meetings, velocity tracking, or retrospectives mandated by the framework — the team can hold them if useful, but they are not required.
- **Continuous flow.** Work moves from left to right on the board as it progresses. There is no artificial sprint boundary that forces incomplete work to be carried over or rushed to "done."
- **Adaptable.** Priorities shift during a university semester — assessments, exams, and other courses compete for time. Kanban lets the team re-prioritise the backlog at any point without disrupting ongoing work.
- **Transparent.** Every team member can see the state of all work at a glance, which reduces coordination overhead in a small team.

---

## 2. Core Principles

### 2.1 No Fixed Roles

The team does not assign permanent roles such as "backend developer," "frontend developer," or "scrum master." Any team member can pick up any task based on:

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

### 2.3 Continuous Flow Over Sprints

The rubric uses Sprint 1–4 milestones, and the team maps those to stages in the dev plan. Internally, however, the team works in continuous flow. Cards are pulled from the backlog whenever someone has capacity, not only at the start of a sprint window. The sprint milestones act as progress checkpoints rather than rigid iteration boundaries.

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

1. **Pull from Backlog.** A team member identifies a card they want to work on and moves it to `To Do`.
2. **Create a branch.** Following the [git methodology](./git-methodology), they branch off `main` with a descriptive name (e.g., `feature/live-logging-undo`).
3. **Work on the branch.** If using an agent-assisted session, the agent writes code and commits; the developer creates the branch, pushes, and reviews. If working directly, the developer commits following Conventional Commits.
4. **Open a PR (early).** Even as a draft. This signals to the team that work is underway and invites early feedback.
5. **Move to In Review.** When the PR is ready for review, the card moves to `In Review`. At least one team member reviews the diff.
6. **Address feedback.** If changes are requested, the developer (or agent) pushes fixes to the same branch. The card stays in `In Review`.
7. **Merge.** Once approved and all CI checks pass, the PR is merged into `main`. The card moves to `Done`.
8. **Quality gates.** Before merging, the following must pass: lint, typecheck, tests, and build across the affected packages. The CI pipeline enforces this automatically.

---

## 6. Why Not Scrum

Scrum is the most common Agile framework, but it was not the right fit for this project:

- **Fixed sprint cadence.** Scrum requires time-boxed sprints (typically 1–2 weeks) with mandatory planning, review, and retrospective ceremonies. A 5-person university team with competing course deadlines and variable availability cannot reliably commit to a fixed cadence.
- **Estimation overhead.** Scrum often involves story-point estimation and velocity tracking. For a team of this size, the overhead outweighs the benefit — a simple "is this ready to work on?" check is enough.
- **Role rigidity.** Scrum defines roles (Product Owner, Scrum Master) that create unnecessary structure in a small, flat team.

Kanban provides the same visibility and accountability and lets the team focus on building and shipping.

---

## AI Declaration

This document was created with the assistance of opencode[mimo-v2.5-free].
