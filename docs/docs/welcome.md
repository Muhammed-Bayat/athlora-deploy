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

## Getting around

- [Getting Started](/docs/getting-started/frontend) — run the stack locally
- [Architecture overview](/docs/architecture/overview) — how the pieces fit
- [Database](/docs/db-schema/overview) — schema and result derivation rules
- [Project Process](/docs/process/git-methodology) — Git methodology, build spec, dev plan

## AI Usage

This documentation site and the repository follow the course AI policy.

- **Code generation:** `opencode[deepseek-v4-flash-free]`
- **In-line editing:** `opencode[deepseek-v4-flash-free]`, `Codex[GPT-5]`, `Claude-Web[Sonnet 5]`
- **Code review:** none used — not used for code review
- Commits that contain AI-generated code carry an `Assisted-by:` footer naming every tool and model.
- Every submitted document ends with an explicit AI usage or non-usage declaration.

This section is kept current as tools and models change.