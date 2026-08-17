# Athlora

Run the whole season from one place.

Athlora is a web app for an athletics (track & field) coach to manage a roster of athletes, plan competitions and training, log results live during an event (times for track, distances/heights for field), derive statistics and PBs/SBs from that log, and — in later stages — collaborate with assistants offline, publish public results pages, and generate season schedules.

## Live services

- **Application:** [athlora-deploy.vercel.app](https://athlora-deploy.vercel.app)
- **Documentation:** [athlora-deploy.pages.dev](https://athlora-deploy.pages.dev)
- **API health:** [athlora-deploy.onrender.com/health](https://athlora-deploy.onrender.com/health)

## Architecture

Non-monolithic: a **React + Vite + TypeScript** frontend talks to a separate **Express + TypeScript** API over HTTP/JSON, backed by **PostgreSQL**. Auth is handled by **Auth0**. No framework that merges front and back (no Next.js/SvelteKit-style fused routing) — this is a hard project requirement.

```
/frontend   React + Vite + TypeScript SPA
/backend    Express + TypeScript REST API (PostgreSQL)
/docs       Docusaurus documentation site
/e2e        Playwright end-to-end tests
```

## Tech stack

| Layer            | Tool                                   | Why |
|------------------|----------------------------------------|-----|
| Frontend         | React + Vite + TypeScript (strict)     | Fast dev/build, strict typing, team-standard React |
| Styling          | Plain CSS (CSS variables + modules)    | Design tokens from approved mockups, no runtime dependency |
| Backend          | Node.js + Express + TypeScript         | Small hand-written REST API, shared TS types with frontend |
| Database         | PostgreSQL (Neon)                      | Relational results/log data, UUIDs for offline-safe keys |
| Auth             | Auth0                                  | Never hand-roll auth; hosted identity + JWT verification |
| Weather          | Open-Meteo                             | Keyless REST forecast for event locations |
| Testing          | Vitest, React Testing Library, Supertest, Playwright | Unit / component / API / E2E |
| CI/CD            | Gitea Actions                          | Lint + typecheck + test on every push/PR |
| Hosting          | Vercel (frontend), Render (backend)    | S3/FaaS + API hosting |
| Docs site        | Docusaurus (Cloudflare Pages)          | Versioned docs for setup, API, schema |

Full design conventions and database schema live in the build spec (`docs/process/agent-build-spec`), the development plan in `docs/process/dev-plan`, and this repo's Git workflow in `docs/process/git-methodology`.

## Getting started

See `/docs` (Docusaurus) for the full setup guides: [frontend](docs/docs/getting-started/frontend), [backend](docs/docs/getting-started/backend).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in DATABASE_URL and Auth0 values
npm run dev
```

A Postgres instance (Neon or similar) and an Auth0 tenant are required for the live features. Checksum-tracked sequential migrations live in `backend/src/db/migrations` and are applied with `npm run db:migrate` from `backend`.

### Docs

```bash
cd docs
npm install
npm run start
```

## Contributing (Git workflow)

We use **GitHub Flow** with Conventional Commits. Branch off `main` (`feature/<short-desc>`), open a PR early, get a review, squash-merge. Every commit follows `type(scope): description` and carries an `Assisted-by:` footer when AI generated code. Full details: `docs/process/git-methodology`.

## AI Usage

This project follows the course AI policy. The tools below have contributed to the repository; categories that are unused are explicitly declared as unused.

- **Code generation:** `opencode[deepseek-v4-flash-free]`, `opencode[gpt-5.6-sol]`
- **In-line editing:** `opencode[deepseek-v4-flash-free]`, `opencode[gpt-5.6-sol]`, `Codex[GPT-5]`, `Claude-Web[Sonnet 5]`
- **Code review:** `opencode[gpt-5.6-sol]`
- Every commit where AI generated code includes an `Assisted-by:` footer naming every contributing tool and model.
- Every submitted document ends with an AI usage/non-usage declaration.
- This section is kept current as tools and models change.

## Documentation

- [Dev plan](docs/docs/process/dev-plan)
- [Agent build spec](docs/docs/process/agent-build-spec)
- [Git methodology](docs/docs/process/git-methodology)
- [Architecture overview](docs/docs/architecture/overview)
- [Database schema](docs/docs/db-schema/overview)
