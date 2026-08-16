---
sidebar_position: 1
slug: /
---

# Athlora

Run the whole season from one place.

Athlora is a web app for an athletics (track & field) coach to manage a roster of athletes, plan competitions and training, log results live during an event, derive statistics and PBs/SBs from that log, and collaborate with assistants — offline at the track and online back home.

## Monorepo layout

```
/frontend   React + Vite + TypeScript SPA (design tokens in src/styles/tokens.css)
/backend    Express + TypeScript REST API (PostgreSQL, Auth0)
/docs       This Docusaurus site
/e2e        Playwright end-to-end tests
```

Design mockups live at the repo root: `SDP-Landing.html` (marketing page) and `SDP-Coach-Console.html` (in-app console). Both carry the placeholder brand "SDP" — the real brand everywhere is **Athlora**.

## Key decisions

- **Non-monolithic architecture**: React frontend and Express API are separate services talking over HTTP/JSON. No fused framework (Next.js/SvelteKit) — this is a hard project requirement.
- **Timeline-first data model**: everything an athlete does during an event is captured as an append-only `timeline_entries` log; `results` are derived from it, with a manual override for corrections.
- **Safe distributed writes**: UUID primary keys and soft deletes everywhere, so offline logging (Stage 2+) and multi-device merge (Stage 3+) stay consistent.
- **Design tokens**: the approved mockups are encoded once in `frontend/src/styles/tokens.css`; no hard-coded colours in components.

## Current status (Stage 1 start)

The monorepo is scaffolded, committed, and all automated checks pass locally. What is done today:

- **Frontend shell and roster** — Vite + React + TypeScript (strict), design tokens from the mockups, shared components (`Button`, `Input`, `Select`, `Card`, `Badge`, `Modal`, `Toast`, `EmptyState`), feature folders, a typed API client with structured errors, and Auth0 Universal Login integration that synchronizes the application user before authenticated content renders. The roster is API-backed with active/archived views, name/squad filters, reusable add/edit forms, archive/restore confirmation, and complete loading/error/empty feedback.
- **Backend shell** — Express + TypeScript, `/api/v1` resource routers, standard error shape, Auth0 JWT protection that resolves every resource request to a typed application-user context, Neon PostgreSQL with checksum-tracked migrations, and pure result-derivation services.
- **100m data/API contract** — the authoritative MVP contract is defined in `docs/api-reference/contract`, encoded in the aligned backend/frontend TypeScript domain types (fixed to 100m/seconds at the API/service boundary), and backed by the forward-only migration `0002_contract_100m.sql` (athlete archival, result outcomes, override audit timestamp, note storage, constraints and indexes). The schema now distinguishes no result, a valid finish, DQ, DNF and DNS.
- **Ownership foundation** — verified Auth0 subjects resolve to `users.id` and role before protected resource handlers run. Unsynchronized identities receive a structured recovery error, while reusable athlete/event/timeline/participant/result checks scope access to the current user and return the same generic not-found response for missing and cross-coach resources.
- **Athlete roster CRUD** — the `/api/v1/athletes` routes are live against PostgreSQL: coach-scoped list with name/squad filtering and stable ordering, create (server-derived owner), detail, full replacement, plus reversible archival (`DELETE` = archive, `POST /:id/unarchive`) that preserves timeline entries and results. Covered by API, service, and a `TEST_DATABASE_URL`-gated integration suite.
- **Event CRUD & lifecycle** — the `/api/v1/events` routes are live against PostgreSQL: coach-scoped list with `type`/`status`/date-range filters and stable ordering, create (discipline fixed to 100m server-side), detail, full replacement with forward-only status transitions (`cancelled` is terminal), and cancellation-as-delete (`DELETE` sets `status = 'cancelled'`, preserving timeline entries and results). The timeline routes now reject logging against any event that is not `in_progress` (`409 EVENT_NOT_IN_PROGRESS`). Covered by API, service, and a `TEST_DATABASE_URL`-gated integration suite.
- **Event management UI** — the coach console event view now consumes the typed event API with responsive list/calendar views, date/type/status filters, async and empty states, strict create/edit forms, detail participant counts, and confirmed start/complete/history-preserving cancel actions. API-wrapper and RTL tests cover filters, payloads, validation, details and lifecycle failures.
- **Event athlete assignments** — authenticated event routes can list assigned athletes with logger-ready summaries, assign active owned athletes, idempotently update RSVP status, and remove assignments without deleting timeline/results history. Duplicate assignments and archived new assignments return explicit conflicts; all ownership failures remain non-enumerating. Covered by API, service, row-mapper, validation and gated PostgreSQL integration tests.
- **Backend deployment** — the Render service is live at `https://athlora-deploy.onrender.com` and its `/health` check is verified.
- **Frontend deployment** — the Vercel SPA is live at `https://athlora-deploy.vercel.app` with production Auth0 sign-in verified.
- **Quality gate** — lint, typecheck, Vitest/RTL, Supertest and the Docusaurus build are green. A Playwright smoke test is present; local execution requires the documented Chromium system dependencies. CI workflow is committed in `.gitea/workflows/ci.yml` and executed by a registered Gitea Actions runner on the university instance.
- **Docs deployment** — the Docusaurus site is live at `https://athlora-deploy.pages.dev`.

Pending for Stage 1 (needs accounts/credentials you hold):

- Implement account deletion and complete the remaining password/account lifecycle requirements.
- Build the remaining CRUD features: Open-Meteo weather for events, live logging endpoints + UI, results/dashboard, athlete performance detail, and event participant assignment controls.

## Keeping these docs current

These pages are a living record that agents maintain as part of every task. If you are an agent working in this repo: the sections marked **Current status** / **Current state** and the **check-status table** in `getting-started/scripts.md` must be updated in the same session as the code they describe, documentation changes are committed with the feature (Conventional Commits, `Assisted-by:` footer), the docs build must pass before you finish, and this site's source-of-truth process docs must never be edited for progress. The full mandatory rules are in the build spec, Section 14.

## Getting around

- [Getting Started](/docs/getting-started/frontend) — run the stack locally
- [Architecture overview](/docs/architecture/overview) — how the pieces fit
- [Database](/docs/db-schema/overview) — schema and result derivation rules
- [Project Process](/docs/process/git-methodology) — Git methodology, build spec, dev plan

## AI Usage

This documentation site and the repository follow the course AI policy.

- **Code generation:** `opencode[deepseek-v4-flash-free]`, `opencode[gpt-5.6-sol]`
- **In-line editing:** `opencode[deepseek-v4-flash-free]`, `opencode[gpt-5.6-sol]`, `Codex[GPT-5]`, `Claude-Web[Sonnet 5]`
- **Code review:** none used — not used for code review
- Commits that contain AI-generated code carry an `Assisted-by:` footer naming every tool and model.
- Every submitted document ends with an explicit AI usage or non-usage declaration.

This section is kept current as tools and models change.

## AI declaration

This document was generated and is maintained with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol]; in-line editing via Codex[GPT-5] and opencode[deepseek-v4-flash-free].
