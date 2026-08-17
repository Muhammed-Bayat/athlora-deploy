---
sidebar_position: 3
---

# Scripts, CI & services

A reference for the npm scripts and CI that keeps the repo green.

## Root

- `.gitignore`, `.editorconfig`, `README.md` (with the **AI Usage** section) at the repo root.
- Mockups `SDP-Landing.html` and `SDP-Coach-Console.html` are tracked at the root as the design source of truth.

## CI (Gitea Actions)

Workflow: `.gitea/workflows/ci.yml`. On every push and pull request it runs, in parallel jobs:

| Job | Steps |
|-----|-------|
| `frontend` | `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` |
| `backend` | `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` |
| `docs` | `npm ci`, `npm run build` |

Playwright E2E runs locally (`cd e2e && npm run test:install && npm test`) and is added to CI incrementally as cross-cutting flows land (Stage 2+).

Each job runs on the default `ubuntu-latest` runner label with Node 22 pinned via `actions/setup-node@v4` — so CI does not depend on a runner being registered with a custom `docker://` image label.

The runner is registered against the university Gitea instance (`https://sdp.ms.wits.ac.za`) and executes in the `ubuntu-latest:docker://node:22-bookworm` container. It runs from Docker Desktop on a team machine with the DinD flavour (bundled daemon, no host socket required):

```bash
docker run -d --name athlora_runner --privileged \
  -e GITEA_INSTANCE_URL=https://sdp.ms.wits.ac.za/ \
  -e GITEA_RUNNER_REGISTRATION_TOKEN=<token> \
  -e GITEA_RUNNER_NAME=athlora-runner \
  -e GITEA_RUNNER_LABELS="ubuntu-latest:docker://node:22-bookworm" \
  -v <path>:/data \
  docker.io/gitea/runner:3-dind
```

The registration token is obtained in the Gitea UI under the repository's **Settings → Actions → Runners**. A runner only accepts jobs while its machine and container are running.

## Current check status

The implemented Stage 1 checks pass locally, and the same frontend/backend/docs gates run in Gitea Actions CI on every push/PR:

| Package | Checks | Result |
|---------|--------|--------|
| `frontend` | lint, typecheck, test, build | passing (132 Vitest/RTL tests) |
| `backend` | lint, typecheck, test, build | passing (269 Vitest/Supertest tests; 34 database tests skipped when unconfigured) |
| `docs` | build | passing |
| `e2e` | against frontend via Playwright | passing (1 Chromium smoke test) |

The backend suite includes 34 database integration tests that exercise real SQL against PostgreSQL: 6 migration tests, 5 athlete-persistence tests, 6 event-persistence tests, 5 participant-persistence tests, 10 timeline-persistence tests, and 2 aggregate tests covering effective statistics/year boundaries/archival/cancellation plus deterministic dashboard modes/progress/upcoming/history ownership. They are gated behind `TEST_DATABASE_URL` and skip when it is unset, so CI stays green without a database.

## Definition of done

A task is "done" when its tests pass in CI and:

- table/column names match the build spec exactly (or a new migration follows its conventions);
- API routes and response shapes match the spec;
- the UI uses design tokens only;
- tests are added and passing;
- the `Assisted-by:` footer is present on commits with AI-generated code;
- the README AI Usage section is current.

Full checklist: the build spec, Section 12.

## AI declaration

This document was generated with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol]. This revision was edited with the assistance of opencode[deepseek-v4-flash-free].
