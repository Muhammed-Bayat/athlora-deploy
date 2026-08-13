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

- **Frontend shell** — Vite + React + TypeScript (strict), design tokens from the mockups, shared components (`Button`, `Input`, `Select`, `Card`, `Badge`, `Modal`, `Toast`, `EmptyState`), feature folders, typed API client, and Auth0 Universal Login integration.
- **Backend shell** — Express + TypeScript, `/api/v1` resource routers, standard error shape, Auth0 JWT protection for application resources, Neon PostgreSQL with checksum-tracked migrations, and pure result-derivation services.
- **Backend deployment** — the Render service is live at `https://athlora-deploy.onrender.com` and its `/health` check is verified.
- **Frontend deployment** — the Vercel SPA is live at `https://athlora-deploy.vercel.app` with production Auth0 sign-in verified.
- **Quality gate** — lint, typecheck, Vitest/RTL, Supertest, Docusaurus build and a Playwright smoke test all green. CI workflow committed in `.gitea/workflows/ci.yml` (runs once a Gitea Actions runner is registered).
- **Docs deployment** — the Docusaurus site is live at `https://athlora-deploy.pages.dev`.

Pending for Stage 1 (needs accounts/credentials you hold):

- Implement account deletion and complete the remaining password/account lifecycle requirements.
- Build the CRUD features: roster, events (with Open-Meteo weather), live logging, results/dashboard.

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

This document was generated and is maintained with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol]; in-line editing via Codex[GPT-5].
