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

The runner executes each job inside a Node 22 container. The workflow requires a Gitea Actions runner registered on the server.

## Current check status

All checks pass locally at the scaffold stage:

| Package | Checks | Result |
|---------|--------|--------|
| `frontend` | lint, typecheck, test, build | passing (11 Vitest/RTL tests) |
| `backend` | lint, typecheck, test, build | passing (60 Vitest/Supertest tests; 6 database tests skipped when unconfigured) |
| `docs` | build | passing |
| `e2e` | against frontend via Playwright | passing (1 smoke test) |

The backend suite includes 6 migration integration tests that exercise real SQL against PostgreSQL (fresh application, baseline upgrade, constraints, checksums). They are gated behind `TEST_DATABASE_URL` and skip when it is unset, so CI stays green without a database:

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

This document was generated with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol].
