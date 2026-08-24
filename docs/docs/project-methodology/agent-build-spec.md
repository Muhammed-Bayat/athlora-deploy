---
sidebar_position: 2
---

# Athletics Coaching App — Agent Build Spec

**Purpose of this document:** this is the reference every opencode agent (yours and your teammates') should be given alongside a task, so that independently-generated code stays consistent — same schema, same naming, same API shape, same design tokens — no matter who's prompting or which feature they're building. Treat this as the source of truth; the companion `athletics_coaching_app_dev_plan.md` defines *what* to build and *when*, this document defines *how* to build it so everyone's output fits together.

**How to use this with an opencode agent:** paste or attach this file (and the dev plan) at the start of a session, then give the specific feature/task from the dev plan. If the agent proposes something that conflicts with this spec (a different table name, a different color, a different response shape), correct it before accepting the change — and if a genuine improvement is found, update this file first and re-share it with the team rather than letting one branch drift.

---

## 1. Project Summary (for agent context)

A web app for an athletics (track & field) coach to manage a roster of athletes, plan events (competitions and training), log results live during an event (times for track, distances/heights for field), derive statistics and PBs/SBs from that log, and — in later stages — collaborate with assistants offline, publish public results pages, and generate season schedules.

Non-monolithic architecture: **React/Vite/TypeScript frontend** talking to a **separate Express/TypeScript API** over HTTP (JSON), backed by **PostgreSQL**. Auth via **Auth0**. No framework that merges front/back (no Next.js/SvelteKit-style fused routing) — this is a hard project requirement.

The product is branded **Athlora** ("run the whole season from one place"). The frontend visual identity is set by the approved mockups `SDP-Landing.html` (marketing page) and `SDP-Coach-Console.html` (in-app console) in the repo root; the design tokens in Section 6 are the exact colours/fonts/radii those mockups use and are all an agent may use. The mockups still carry the placeholder brand "SDP" — swap it for **Athlora** everywhere during implementation (document `<title>`, brand lockup, copy, footer), keeping the look and layout unchanged.

---

## 2. Tech Stack (do not substitute without team agreement)

| Layer | Tool | Notes |
|---|---|---|
| Frontend framework | React + Vite | TypeScript, strict mode |
| Styling | Plain CSS (CSS variables / modules) | No Tailwind/CSS-in-JS unless the team agrees to add it — keep it consistent |
| Backend | Node.js + Express | Hand-written REST API, TypeScript |
| Database | PostgreSQL | Hosted on Neon or university instance |
| Auth | Auth0 | Never hand-roll auth |
| Weather integration | Open-Meteo | No API key required, keep it that way |
| Offline storage (Stage 2+) | IndexedDB via Dexie | |
| PWA (Stage 2+) | vite-plugin-pwa | |
| Realtime (Stage 2+) | Socket.IO | |
| Charts (Stage 2+) | Chart.js | |
| PDF export (Stage 3) | pdf-lib | |
| Testing | Vitest, React Testing Library, Supertest, Playwright | Unit/API/E2E respectively |
| CI/CD | Gitea Actions | Lint + typecheck + test on every push/PR |
| Hosting | Vercel (frontend), Render (backend) | |
| Docs site | Docusaurus on Cloudflare Pages | |

If an agent suggests a different library for something already listed here, **decline it** unless the whole team agrees to update this file.

---

## 3. Repository Structure

```
/frontend
  /src
    /components        # shared, reusable UI (buttons, inputs, cards, badges)
    /features
      /athletes
      /events
      /timeline         # live logging screen + entry components
      /results
      /dashboard
      /auth
    /api                # typed fetch wrappers per resource, one file per resource
    /hooks
    /styles
      tokens.css         # design tokens — see Section 6
      global.css
    /types              # shared TypeScript types/interfaces (mirrors backend DTOs)
    main.tsx
  index.html
  vite.config.ts

/backend
  /src
    /routes             # one file per resource: athletes.ts, events.ts, timeline.ts, results.ts, auth.ts
    /controllers
    /services           # business logic (result derivation, merge rules, etc.) — kept pure & unit-testable
    /db
      /migrations
      client.ts          # pg client/pool setup
    /middleware          # auth, permissions, error handler
    /types
    app.ts
    server.ts

/docs                   # Docusaurus source
  /architecture
  /api-reference
  /db-schema
  /getting-started

/e2e                    # Playwright specs
```

**Feature-folder rule:** frontend code is organized by feature, not by file type (no global `/pages`, `/forms`, `/modals` dumping grounds). Backend code is organized by resource, matching the table names in Section 5.

---

## 4. Naming & Coding Conventions

- **Language:** TypeScript everywhere, `strict: true`. No `any` without a `// eslint-disable-next-line` and a comment explaining why.
- **Casing:**
  - Database: `snake_case` for tables and columns.
  - TypeScript: `camelCase` for variables/functions, `PascalCase` for components/types/interfaces.
  - API JSON payloads: `camelCase` (backend maps `snake_case` DB columns → `camelCase` JSON at the service/controller boundary — never leak snake_case into the API).
  - Files: `kebab-case.ts` for non-component files, `PascalCase.tsx` for React components.
- **IDs:** UUID primary keys everywhere (`gen_random_uuid()` in Postgres), not serial integers — this matters later for offline-generated records in Stage 3 (client-generated UUIDs must be valid PKs).
- **Timestamps:** every table has `created_at` and `updated_at` (`timestamptz`, default `now()`), set via trigger or ORM hook — never set manually from the client.
- **Soft deletes:** any table an agent might be tempted to hard-delete from during "undo" logic (`timeline_entries` especially) uses `deleted_at timestamptz null` instead of `DELETE`.
- **Branch naming:** `feature/<short-desc>`, `fix/<short-desc>`, `chore/<short-desc>`.
- **Commit messages:** every commit uses Conventional Commits (`type(scope): description`), including documentation, test, maintenance and squash-merge commits. Use a short, lowercase, imperative description; common types include `feat`, `fix`, `test`, `docs`, `chore` and `refactor`. See Section 9 for the AI footer requirement.
- **Who commits:** the agent creates every commit on the branch during agent-driven sessions — always following the conventions above. The developer's only Git responsibilities are creating and pushing the branch and reviewing/merging the PR; they should never need to hand-write `git add`/`git commit` on an agent-driven branch.
- **Error handling (API):** every error response follows the shape in Section 8.3. No bare `throw new Error(...)` reaching the client uncaught.
- **No secrets in code:** all keys/URLs via `.env`, never committed. See `.env.example` templates in Section 10.

---

## 5. Database Schema (authoritative — agents must not invent alternate table/column names)

```sql
-- users: mirrors Auth0 identity, adds app-level role
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth0_id      TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  role          TEXT NOT NULL DEFAULT 'coach',   -- 'coach' | 'assistant' | 'viewer'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- athletes: belongs to a coach (owner), squads optional string tag for now
CREATE TABLE athletes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      UUID NOT NULL REFERENCES users(id),
  name          TEXT NOT NULL,
  dob           DATE,
  gender        TEXT,                             -- category, not restricted to binary
  squad         TEXT,
  notes         TEXT,
  archived_at   TIMESTAMPTZ,                       -- archival state (non-null = archived)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- events: competitions and training sessions
CREATE TABLE events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by    UUID NOT NULL REFERENCES users(id),
  type          TEXT NOT NULL,                     -- 'competition' | 'training'
  discipline    TEXT,                               -- primary discipline tag, e.g. '100m', 'long_jump'; nullable for multi-discipline meets
  title         TEXT NOT NULL,
  date          DATE NOT NULL,
  time          TIME,
  location_name TEXT,
  latitude      NUMERIC(9,6),
  longitude     NUMERIC(9,6),
  status        TEXT NOT NULL DEFAULT 'scheduled',  -- 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- event_participants: RSVP + fixture participation (Stage 2)
CREATE TABLE event_participants (
  event_id      UUID NOT NULL REFERENCES events(id),
  athlete_id    UUID NOT NULL REFERENCES athletes(id),
  rsvp_status   TEXT NOT NULL DEFAULT 'pending',    -- 'pending' | 'yes' | 'no'
  PRIMARY KEY (event_id, athlete_id)
);

-- timeline_entries: append-only live log — the core of the app
CREATE TABLE timeline_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- client-generated in Stage 2+ for offline support
  event_id      UUID NOT NULL REFERENCES events(id),
  athlete_id    UUID NOT NULL REFERENCES athletes(id),
  discipline    TEXT NOT NULL,                      -- '100m' for the MVP contract (API fixes discipline)
  entry_type    TEXT NOT NULL,                      -- 'attempt' | 'split' | 'penalty' | 'note'
  value         NUMERIC,                             -- seconds for time, metres for distance/height
  unit          TEXT,                                -- 'seconds' | 'metres' | 'cm'
  is_foul       BOOLEAN NOT NULL DEFAULT false,
  incident_type TEXT,                                 -- 'false_start' | 'dq' | 'dnf' | 'dns' | 'lane_infringement' | null
  note_text     TEXT,                                 -- free-text body for 'note' entries
  recorded_by   UUID NOT NULL REFERENCES users(id),
  version       INT NOT NULL DEFAULT 1,               -- Stage 3: bumped on every edit, used for merge conflict detection
  device_id     TEXT,                                 -- Stage 3: originating device for offline merge
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ                            -- soft delete = "undo"
);

-- results: derived, materialized per athlete per event/discipline
CREATE TABLE results (
  event_id        UUID NOT NULL REFERENCES events(id),
  athlete_id      UUID NOT NULL REFERENCES athletes(id),
  discipline      TEXT NOT NULL,
  outcome         TEXT NOT NULL DEFAULT 'no_result',  -- 'no_result' | 'valid' | 'dq' | 'dnf' | 'dns'
  final_result    NUMERIC,
  unit            TEXT,
  "placing"       INT,
  is_pb           BOOLEAN NOT NULL DEFAULT false,
  is_sb           BOOLEAN NOT NULL DEFAULT false,
  manual_override NUMERIC,
  override_reason TEXT,
  overridden_by   UUID REFERENCES users(id),
  override_at     TIMESTAMPTZ,                        -- when the override was applied
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, athlete_id, discipline)
);
```

**MVP contract and enforced state (migration `0002_contract_100m.sql`):** the MVP discipline is fixed to **100m** and the result unit to **seconds** at the API/service boundary (see `docs/api-reference/contract`); the `discipline` column stays free-form `TEXT` so future disciplines are added by new migrations. The migration also adds `archived_at` on `athletes`, `note_text` on `timeline_entries`, `outcome` + `override_at` on `results`, CHECK constraints (event `status`/`type`, `rsvp_status`, `entry_type`, `incident_type`, `unit`, non-negative values, voided outcomes carry no `final_result`), and indexes on `events(created_by)`, `events(status, date)`, `event_participants(athlete_id)` and `timeline_entries(event_id, athlete_id, discipline)`.

**Rules for agents extending this schema:**
- New tables follow the same PK/timestamp/soft-delete conventions above.
- Never rename an existing table/column to "improve" it without flagging the change to the team — the frontend types and API contracts depend on these exact names.
- Migrations live in `/backend/src/db/migrations`, one file per change, numbered/timestamped, never edited after being merged (write a new migration instead).

---

## 6. Design System / UI Tokens

The visual identity is defined by the approved mockups `SDP-Landing.html` (marketing/landing page) and `SDP-Coach-Console.html` (in-app console). Treat those as the design source of truth: same fonts, same palette, same radius/shadows/easing. The product brand is **Athlora** (the mockups label it "SDP" — a placeholder to be renamed, not a design change). Translate the tokens **once** into `/frontend/src/styles/tokens.css`, load the Google Fonts (Bebas Neue, Inter, Space Mono) in `/frontend/index.html`, and consume via these variables everywhere — no hard-coded hex values in components.

```css
:root {
  /* Brand — "Athlora": deep-ink navy with teal/cyan/blue track-lane accents */
  --ink-900: #001D3C;
  --ink-800: #012C4E;
  --ink-700: #023A62;
  --teal-800: #004A68;
  --teal-700: #005E83;
  --blue-500: #0092BC;
  --blue-400: #1CA6CE;
  --cyan-400: #45BED7;
  --cyan-300: #6ED2E6;
  --cyan-200: #8AE9F2;
  --mist-50: #EFFBFC;
  --mist-100: #E3F6F9;
  --white: #FFFFFF;
  --alert: #E2664F;
  --alert-soft: #FBE4DF;

  /* Semantic aliases (what components actually consume) */
  --color-primary: var(--blue-500);        /* primary actions, live/recording state */
  --color-primary-dark: var(--teal-700);   /* btn-primary gradient = blue-500 → teal-700 */
  --color-secondary: var(--cyan-400);      /* field-event accents */
  --color-secondary-dark: var(--blue-400);
  --color-accent: var(--cyan-200);         /* glow/highlights on ink surfaces */
  --color-bg: var(--mist-50);
  --color-surface: var(--white);
  --color-border: rgba(0, 94, 131, 0.16);
  --color-text: var(--ink-900);
  --color-text-muted: rgba(0, 29, 60, 0.62);
  --color-text-faint: rgba(0, 29, 60, 0.42);
  --color-text-light: #EAFBFD;
  --color-text-light-muted: rgba(234, 251, 252, 0.68);

  /* Semantic status */
  --color-success: var(--teal-700);
  --color-warning: #00879E;                /* "Peaking" status teal from mockups */
  --color-danger: var(--alert);            /* DQ/foul/error states */
  --color-info: var(--blue-500);

  /* Typography (Google Fonts: Bebas Neue, Inter, Space Mono) */
  --font-display: 'Bebas Neue', 'Arial Narrow', sans-serif;   /* headings/brand */
  --font-family-base: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-family-mono: 'Space Mono', 'Courier New', monospace; /* times/results */
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.25rem;
  --font-size-xl: 1.75rem;
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-bold: 700;

  /* Spacing scale (4px base) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  /* Radius / shadow / motion (per mockups) */
  --radius-sm: 9px;
  --radius-md: 16px;
  --radius-lg: 24px;
  --radius-pill: 999px;
  --shadow-soft: 0 20px 50px -22px rgba(0, 29, 60, 0.35);
  --shadow-card: 0 10px 30px -16px rgba(0, 29, 60, 0.22);
  --shadow-glow: 0 0 0 1px rgba(69, 190, 215, 0.35), 0 12px 30px -10px rgba(0, 146, 188, 0.45);
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
}
```

**Usage conventions for agents:**
- Headings and the brand lockup use `--font-display` (Bebas Neue); body copy uses `--font-family-base` (Inter); every numeric result (times, distances, PBs, clocks) uses `--font-family-mono` (Space Mono) for alignment/scannability.
- Primary actions and "live"/recording states use the `--color-primary` → `--color-primary-dark` gradient (blue-500 → teal-700), same as the mockups' `.btn-primary`.
- Track (timed) disciplines use `--color-primary` as their accent; field (measured) disciplines use `--color-secondary` (cyan). This lets the UI visually distinguish "timed" vs "measured" events at a glance.
- PB values render in `--teal-700` mono on light surfaces (see mockup roster rows) and `--cyan-200`/`--cyan-300` on dark ink surfaces; SB highlights use a `--blue-500` outline style.
- Penalties/fouls/DQ/DNF/DNS always render in `--color-danger` with an icon/label, never in plain red hex — color is never the only signal (WCAG).
- Dark "ink" surfaces (sidebar, hero, quote band, live console card) use the `--ink-900` → `--teal-800` gradient with `--color-text-light` text, per the mockups. Standalone app CSS uses `--color-bg` (mist-50) page, `--color-surface` (white) cards/panels, `--color-border` hairlines.
- Use the radius scale `sm/md/lg/pill` (9/16/24/999px) and the shadow set from the mockups; animate with `var(--ease)` and honour `prefers-reduced-motion`.
- Minimum tap target 44×44px on any live-logging control (used track-side, often one-handed).
- All interactive elements need a visible `:focus-visible` state (do not remove `outline` without replacing it) — accessibility rubric item.
- Keep this block in sync with the mockups; if the mockups change, update this token block first and re-share the file with the team.

---

## 7. Component Conventions

- Shared primitives live in `/frontend/src/components`: `Button`, `Input`, `Select`, `Card`, `Badge`, `Modal`, `Toast`. Feature code composes these rather than writing new buttons/inputs per feature.
- `Badge` variants: `pb`, `sb`, `foul`, `dq`, `dnf`, `dns`, `neutral` — mapped to the tokens above, defined once.
- Every list/table component (roster, event list, results) supports an empty state and a loading state — don't leave agents to invent ad hoc "no data" text each time; use a shared `EmptyState` component.
- Forms use a shared validation pattern (agent should check for an existing form hook/util before writing a new one).

---

## 8. API Conventions

### 8.1 Base URL & versioning
`https://<render-app>.onrender.com/api/v1/...` — all routes prefixed `/api/v1`.

### 8.2 Resource routes (match table names from Section 5)
```
GET    /api/v1/athletes
POST   /api/v1/athletes
GET    /api/v1/athletes/:id
PUT    /api/v1/athletes/:id
DELETE /api/v1/athletes/:id

GET    /api/v1/events
POST   /api/v1/events
GET    /api/v1/events/:id
PUT    /api/v1/events/:id
DELETE /api/v1/events/:id
GET    /api/v1/events/:id/weather        -- proxies Open-Meteo

POST   /api/v1/events/:id/entries        -- create timeline entry
PATCH  /api/v1/events/:id/entries/:entryId
DELETE /api/v1/events/:id/entries/:entryId   -- soft delete / undo

GET    /api/v1/events/:id/results
PUT    /api/v1/events/:id/results/:athleteId  -- manual override

POST   /api/v1/sync/batch                -- Stage 3: batched offline action sync
```

### 8.3 Response shape
Success:
```json
{ "data": { ... } }
```
List:
```json
{ "data": [ ... ], "meta": { "count": 12 } }
```
Error (consistent shape, non-2xx status code):
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Human-readable message", "details": {} } }
```

### 8.4 Auth
Every non-public route requires `Authorization: Bearer <auth0 JWT>`. Public results pages (Stage 3) are the only unauthenticated `GET` routes, and must be explicitly allow-listed in middleware, not achieved by omitting auth checks elsewhere.

---

## 9. AI Usage Compliance (agents must follow this per commit/session)

This mirrors the course AI policy. Code generated by opencode or any other AI tool must be tracked in the same way. The agent owns commit creation: whenever it writes or changes code, it commits it on the current branch itself (Conventional Commits + the footer below), so the developer can simply branch, push, review and merge without hand-writing commits.

- Every commit where AI generated code gets an `Assisted-by:` footer listing every contributing tool and model, e.g.:
  ```
  feat: add timeline entry undo endpoint

  Assisted-by: opencode[<model-name-used>]
  ```
- AI in-line editing and AI code review do not require a footer on every commit. Keep the `README.md` **AI Usage** section current with the tools and models used for code generation, in-line editing and code review, plus an explicit non-usage statement for each unused category.
- Every submitted document must include either a usage declaration stating whether AI planned, reviewed, edited or generated it and listing every tool and model, or the policy's explicit non-usage declaration.
- Do not let the agent write documentation prose (motivation, design rationale) verbatim into submitted reports — those sections get rewritten in the team's own words per the policy.
- At the start of a new assessment, start a fresh opencode session and keep the transcript/export as evidence if the assessment requires it.

---

## 10. Environment Variables (template — do not commit real values)

`/backend/.env.example`
```
DATABASE_URL=
AUTH0_DOMAIN=
AUTH0_AUDIENCE=
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=
PORT=4000
```

`/frontend/.env.example`
```
VITE_API_BASE_URL=
VITE_AUTH0_DOMAIN=
VITE_AUTH0_CLIENT_ID=
VITE_AUTH0_AUDIENCE=
```

---

## 11. Testing Expectations (per feature, before an agent marks a task "done")

- Backend: Supertest coverage for happy path + at least one validation/error path per new endpoint.
- Result-derivation and merge logic: pure functions in `/backend/src/services`, covered by Vitest unit tests with edge cases (foul-only attempts, DQ, tied results).
- Frontend: RTL test per new component covering render + primary interaction.
- Cross-cutting flows (login, live logging, offline sync): Playwright E2E, added incrementally as those features land (Stage 2+).
- No task is "done" without its corresponding test(s) passing in Gitea Actions CI.

---

## 12. Definition of "Done" Checklist (paste into PR description)

- [ ] Matches table/column names in Section 5 exactly (or migration added following its conventions)
- [ ] API route/response shape matches Section 8
- [ ] UI uses tokens from Section 6, no hard-coded colors
- [ ] Components reused from `/components` where applicable
- [ ] Tests added and passing in CI
- [ ] `Assisted-by:` footer added if AI generated code, listing every contributing tool and model
- [ ] README/AI Usage section updated for every AI tool, model and usage category, with explicit non-usage statements for unused categories
- [ ] Docs updated in `/docs` if this changes the schema, API, setup steps, or project status (see Section 14)

---

## 13. Distributing This to the Team

Every team member should hand their opencode agent **both** this file and `athletics_coaching_app_dev_plan.md` at the start of a session, and re-share this file whenever it's updated (treat edits to this doc like a schema migration — announce it, don't let it drift silently between branches).

---

## 14. Keeping the Docs Current (mandatory agent duty)

The `/docs` Docusaurus site is the living record of the project, not a one-time deliverable. Work is only "done" if the docs that describe it are updated **by the same agent, in the same session** — never deferred and never left for a developer.

### Non-negotiables after every agent session

1. **Status sections reflect reality.** Keep the status/state sections accurate every time you add code:
   - `docs/docs/welcome.md` — "Current status (Stage 1 start)": move implemented items out of *Pending*; add what you built.
   - `getting-started/frontend.md` and `getting-started/backend.md` — "Current state": new routes, endpoints, components, scripts, auth/DB wiring.
   - `getting-started/scripts.md` — "Current check status": refresh the table (lint/typecheck/test/build results and counts) so it matches what `npm test`/`npm run build` actually report.
   - `architecture/overview.md`, `tech-stack/stack.md` — align claims ("currently in use" vs "reserved for later stages") with the code.
   - `db-schema/overview.md` and `db-schema/results-derivation.md` — migration status, table additions, derivation behaviour.
2. **Name things from this spec.** Use the exact table/column names (Section 5), route shapes (Section 8) and tokens (Section 6) in docs — never invented synonyms.
3. **Docs commit with the code.** Commit documentation changes on the same branch as the feature they describe, in the same commit when practical, using Conventional Commits (`docs:` scope) and the `Assisted-by:` footer (Section 9). Never open a PR without its doc updates.
4. **Verify the build.** Run `cd docs && npm run build` before finishing a session so broken links or stale claims never ship.
5. **Source-of-truth docs are read-only for progress.** `git-methodology`, `agent-build-spec` and `dev-plan` are team records — never edit them to reflect progress. If you believe one needs a change, flag it to the developer and let the team update/re-share the file.
6. **AI declarations trail edits.** Any document you edit must end with its AI declaration updated to name every contributing tool and model (Section 9).

---

## AI Declaration

The preceding document was edited with the assistance of Codex[GPT-5], opencode[deepseek-v4-flash-free].
