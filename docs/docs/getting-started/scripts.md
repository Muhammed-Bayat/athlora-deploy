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
| `backend` | `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test` |
| `docs` | `npm ci`, `npm run build` |

Playwright E2E runs locally (`cd e2e && npm run test:install && npm test`) and is added to CI incrementally as cross-cutting flows land (Stage 2+).

The runner executes each job inside a Node 20 container.

## Definition of done

A task is "done" when its tests pass in CI and:

- table/column names match the build spec exactly (or a new migration follows its conventions);
- API routes and response shapes match the spec;
- the UI uses design tokens only;
- tests are added and passing;
- the `Assisted-by:` footer is present on commits with AI-generated code;
- the README AI Usage section is current.

Full checklist: the build spec, Section 12.