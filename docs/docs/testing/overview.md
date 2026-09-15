---
sidebar_position: 4
---

# Automatic Testing Practices

Athlora uses a three-tier testing strategy: **unit/component tests** for fast feedback, **integration tests** against a real database for correctness, and **end-to-end tests** that exercise the full stack through a real browser. Frontend, backend, coverage, and documentation checks run on every push and pull request. End-to-end tests run in CI only when the required Auth0 test-account secrets are configured; otherwise the job reports an explicit skip.

---

## 1.Policy overview

| Tier | Runner | Scope | Speed | Database | Auth |
|---|---|---|---|---|---|
| Unit / component | Vitest | Single function or React component | Milliseconds | None | Mocked |
| Integration | Vitest + Supertest | Express routes and service functions | Seconds | Real PostgreSQL | Mocked |
| End-to-end | Playwright | Full browser workflow through real servers | Minutes | Real PostgreSQL | Real Auth0 |

The tiers are designed to catch different classes of bugs:

- **Unit tests** verify pure logic (result derivation, validation rules, formatting) and component rendering (state transitions, user interactions, accessibility roles) in isolation. They are the fastest and cheapest to run.
- **Integration tests** verify that Express routes, SQL queries, and service functions work together against a real PostgreSQL instance. They catch query bugs, constraint violations, and transaction issues that mocked tests miss.
- **E2E tests** verify complete user journeys (sign in, create event, log results, view statistics) through a real browser against real backend and database services. They catch authentication flow issues, SPA routing bugs, and cross-service integration problems.

---

## 2. Frontend unit and component tests

### Stack

- **Vitest** — test runner and assertion library
- **React Testing Library** — component rendering and interaction queries
- **@testing-library/user-event** — realistic user interaction simulation (clicks, typing, keyboard navigation)
- **jsdom** — browser environment simulation in Node.js
- **@testing-library/jest-dom** — custom DOM matchers (`toBeInTheDocument`, `toHaveAttribute`, etc.)

### Configuration

The Vitest config lives inside `frontend/vite.config.ts`:

```typescript
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: ['./src/test/setup.ts'],
  css: false,
  testTimeout: 15_000,
  exclude: ['e2e/**', 'node_modules/**'],
  coverage: {
    provider: 'v8',
    reporter: ['json-summary'],
    exclude: ['dist/**', 'src/test/**', '**/*.test.*', '**/*.config.*'],
  },
}
```

The setup file (`src/test/setup.ts`) imports `@testing-library/jest-dom/vitest` for extended matchers and stubs `window.matchMedia` for components that use media queries.

### What is tested

The frontend test inventory is maintained next to its source and covers:

| Category | Examples |
|---|---|---|
| API client wrappers | `src/api/*.test.ts` — request/response shapes, error handling, auth headers |
| Feature components | `src/features/**/*.test.tsx` — dashboard, athletes, events, fixtures, fitness, live logging, comparison, public stats, offline sync |
| Shared components | `Button.test.tsx`, `Modal.test.tsx`, `Select.test.tsx`, `AsyncBoundary.test.tsx` |
| Hooks and utilities | `useLocalStorage`, `useEventOfflineSync`, `formatting`, `auth0`, `syncEngine` |
| Pure logic | `anatomySurfaceMap`, `resultPresentation`, `trackMath`, `introTimeline` |
| App shell | `App.test.tsx` |

### Patterns

**Mocking modules:** Tests use `vi.mock()` and `vi.hoisted()` to replace dependencies at the top level. API modules, Auth0 providers, and WebGL components are commonly mocked.

```typescript
vi.mock('../../api/athletes', () => ({
  fetchAthletes: vi.fn(),
}));
```

**User interaction simulation:** `@testing-library/user-event` provides realistic input simulation rather than raw DOM events.

```typescript
const user = userEvent.setup();
await user.click(screen.getByRole('button', { name: /save/i }));
await user.type(screen.getByLabelText(/name/i), 'Usain Bolt');
```

**Accessible role assertions:** Tests query elements by their accessible role rather than CSS selectors, which also serves as a basic accessibility check.

```typescript
screen.getByRole('heading', { name: /roster/i });
screen.getByRole('button', { name: /archive/i });
screen.getByRole('status');  // for live regions
screen.getByRole('alert');   // for error messages
screen.getByRole('dialog');  // for modals
```

**State coverage:** Components are tested across loading, error, empty, populated, and filtered states. Async operations are verified with `waitFor` and `findBy` queries.

**Lifecycle testing:** Tests verify cleanup on unmount (clearing intervals, aborting in-flight requests, removing event listeners).

---

## 3. Backend unit tests

### Stack

- **Vitest** — test runner (Node environment, no globals)
- **Supertest** — HTTP assertion library that wraps the Express app

### Configuration

The Vitest config lives at `backend/vitest.config.ts`:

```typescript
coverage: {
  provider: 'v8',
  reporter: ['json-summary'],
  exclude: ['dist/**', 'src/test/**', '**/*.test.*', '**/*.config.*'],
}
```

No custom test environment — tests run in the default Node.js environment. Unlike the frontend, backend tests explicitly import `vi`, `describe`, `it`, and `expect` (no globals).

### What is tested

The backend unit-test inventory is maintained next to the source and covers:

| Area | What they cover |
|---|---|---|
| Routes | `routes/*.test.ts` — request validation, response shapes, status codes, auth headers |
| Services | `services/*.test.ts` — business logic, SQL query construction, result derivation |
| Middleware | `middleware/*.test.ts` — auth verification, ownership checks, error handling |
| Validation | `validation/payloads.test.ts` — exhaustive schema validation with exact error shape assertions |
| DB utilities | `db/*.test.ts` — row mapping, migration checksum verification |
| Realtime | `realtime/*.test.ts` — Socket.IO subscription authorization and broadcast |

### Patterns

**Mocking the database:** The pool's `query` and `connect` methods are mocked with `mockImplementation` that routes by SQL content:

```typescript
const mockQuery = vi.fn().mockImplementation((sql: string) => {
  if (sql.includes('SELECT')) return { rows: [/* fixtures */] };
  return { rows: [] };
});
```

**Auth mocking:** A `configureAuth()` helper sets environment variables and mocks `jose.jwtVerify` to simulate verified tokens without hitting Auth0.

**Supertest route testing:** Tests exercise the full Express middleware stack through Supertest:

```typescript
const res = await request(app)
  .get('/api/v1/athletes')
  .set('Authorization', 'Bearer valid-token')
  .set('X-Workspace-Id', workspaceId);

expect(res.status).toBe(200);
expect(res.body.data).toBeInstanceOf(Array);
```

**Ownership non-disclosure:** Tests verify that cross-coach resource access returns the same generic `404 NOT_FOUND` response whether the resource is missing, malformed, belongs to the wrong parent, or belongs to another coach. This prevents information leakage through error responses.

**Lifecycle state machine:** Event status transitions are tested exhaustively — valid forward transitions succeed, backward transitions return `409 INVALID_EVENT_TRANSITION`, and logging against non-`in_progress` events returns `409 EVENT_NOT_IN_PROGRESS`.

**Validation exhaustiveness:** `payloads.test.ts` tests every accepted and rejected field combination for each DTO, verifying exact error codes and ordered issue lists.

---

## 4. Backend integration tests

### Gating pattern

Integration tests are **opt-in** — they require a real PostgreSQL database and are skipped by default:

```typescript
const connectionString = process.env.TEST_DATABASE_URL;
const describeDB = connectionString ? describe : describe.skip;
```

Set `TEST_DATABASE_URL` to enable them. Use a **disposable database** because these suites create and remove application data.

### What is tested

The backend has **9 integration test files** covering:

| File | Coverage |
|---|---|
| `db/migrate.integration.test.ts` | Migration runner, checksum tracking, advisory locking |
| `services/athletes.integration.test.ts` | CRUD persistence, archival preserves timeline/results, lifecycle transitions |
| `services/events.integration.test.ts` | Event lifecycle, cancellation history, cross-coach isolation |
| `services/participants.integration.test.ts` | Assignment persistence, idempotent updates, ownership isolation |
| `services/timeline.integration.test.ts` | Entry persistence, parent/coach isolation, competition/training timing, ranking |
| `services/aggregates.integration.test.ts` | Statistics boundaries, archival/cancellation rules, dashboard modes |
| `services/authorization.integration.test.ts` | Two-coach isolation for athletes, events, participants, timeline, statistics |
| `services/injuries.integration.test.ts` | Injury CRUD persistence |
| `services/accounts.integration.test.ts` | Account lifecycle and workspace persistence |

### Setup

Each integration test:
1. Connects to the test database
2. Runs pending migrations
3. Seeds test data
4. Exercises service functions directly (not through HTTP)
5. Cleans up by truncating tables with `CASCADE` in `afterEach`

### Running locally

Start a disposable PostgreSQL instance:

```bash
docker run --rm -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:16
```

Then run with the test database URL:

```bash
cd backend
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres npm run test
```

---

## 5. End-to-end tests

### Stack

- **Playwright** — browser automation
- **@axe-core/playwright** — automated accessibility auditing
- **Real Auth0 Universal Login** — no mocked authentication
- **Real PostgreSQL** — migrated and truncated before every run

### Configuration

The Playwright config lives at `e2e/playwright.config.ts`:

| Setting | Value |
|---|---|
| Test directory | `./tests` |
| Parallel | `false` (fully sequential) |
| Workers | `1` |
| Retries | 1 in CI, 0 locally |
| Timeout | 90 seconds per test |
| Expect timeout | 15 seconds |
| Base URL | `http://localhost:5174` |
| Trace | Captured on first retry |

### Projects

| Project | Purpose | Auth |
|---|---|---|
| `auth-setup` | Authenticates via Auth0 Universal Login, saves browser state | Real Auth0 |
| `smoke` | Anonymous landing page smoke test + axe audit | None |
| `desktop-chromium` | All authenticated tests at desktop viewport | Saved state from `auth-setup` |
| `mobile-chromium` | All authenticated tests at Pixel 5 viewport | Saved state from `auth-setup` |

### What is tested

The E2E suite has **20 spec files** covering:

| Spec | Coverage |
|---|---|
| `vertical-slice.spec.ts` | Full 100m workflow: roster → event → assignment → live logging → corrections → overrides → completion → statistics → dashboard |
| `workspace.spec.ts` | Multi-workspace switching and membership management |
| `roles.spec.ts` | Coach vs assistant role enforcement |
| `squads.spec.ts` | Squad management and filtering |
| `athlete-lifecycle.spec.ts` | Active/inactive/archived transitions |
| `injuries.spec.ts` | Injury creation and resolution |
| `event-helpers.spec.ts` | Helper invitations and offline designation |
| `realtime.spec.ts` | Socket.IO live updates |
| `reminders.spec.ts` | Event reminders |
| `public-logger.spec.ts` | Public logger links and sessions |
| `fixtures.spec.ts` | Cross-club fixture flow (multi-user, multi-context) |
| `fixture-notifications.spec.ts` | Notification delivery and unread counts |
| `authorization.spec.ts` | Cross-workspace authorization boundaries |
| `migration.spec.ts` | Schema migration verification |
| `accessibility.spec.ts` | Deep axe-core audit of 7 pages + keyboard nav + narrow viewport |
| `routing.spec.ts` | SPA route navigation |
| `analytics.spec.ts` | Analytics features |
| `comparison.spec.ts` | Two-athlete comparison |
| `offline-logging.spec.ts` | Offline sync E2E |
| `smoke.spec.ts` | Anonymous landing page + axe |

### Global setup

Before any tests run, `global-setup.ts`:
1. Runs `npm run db:migrate` against the E2E database
2. Truncates all **29 application tables** with `CASCADE` for a clean slate

### Auth setup

`auth.setup.ts` authenticates two separate users through Auth0 Universal Login:
1. **Coach** — primary test account, saves to `.auth/coach.json`
2. **Guest** — secondary account for cross-workspace fixture flows, saves to `.auth/guest.json`

Multi-user tests use `browser.newContext({ storageState })` to run with separate browser sessions.

### Required environment variables

```text
DATABASE_URL          PostgreSQL (disposable — truncated every run)
VITE_AUTH0_DOMAIN     Auth0 tenant domain
VITE_AUTH0_CLIENT_ID  Auth0 SPA application client ID
VITE_AUTH0_AUDIENCE   Auth0 API audience
E2E_AUTH0_EMAIL       Primary coach test account email
E2E_AUTH0_PASSWORD    Primary coach test account password
E2E_GUEST_AUTH0_EMAIL   Guest coach test account email
E2E_GUEST_AUTH0_PASSWORD  Guest coach test account password
```

### Running locally

```bash
docker run --rm -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:16

cp e2e/.env.example e2e/.env   # fill in Auth0 + database credentials
cd e2e
npm install
npm run test:install   # install Chromium
npm test
```

Playwright starts both the backend (port 4100) and the Vite frontend (port 5174) automatically via the `webServer` config.

---

## 6. Accessibility testing

Accessibility is tested at two levels:

### E2E level (axe-core)

Every major page is audited with `@axe-core/playwright` against **WCAG 2.0/2.1 Level A and AA**. The `accessibility.spec.ts` file tests:

- Dashboard
- Roster
- Events
- Live logger
- Comparison
- Fixtures
- Account
- Athlete detail

Tests fail on any **critical** or **serious** violation. The shared `expectNoSeriousViolations()` helper wraps axe-core and is reused across spec files:

```typescript
import { expectNoSeriousViolations } from './helpers/accessibility';

await expectNoSeriousViolations(page);
```

### Component level

Frontend component tests use accessible role queries (`getByRole`, `getByLabelText`, `getByTestId`) which implicitly verify that ARIA roles and labels are present. This provides a baseline accessibility check during unit testing without a full axe audit.

---

## 7. Linting and typechecking

### ESLint

Both frontend and backend use ESLint v9 flat config with `@eslint/js` recommended + `typescript-eslint` recommended.

| Package | Extra plugins | Notable rules |
|---|---|---|
| Frontend | `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` | Hooks rules enforced, `only-export-components` warn |
| Backend | — | `_` prefix ignores unused vars, namespaces allowed in `.d.ts` |

### TypeScript

Both packages use **strict mode**:

| Package | Target | Module resolution | Extra strictness |
|---|---|---|---|
| Frontend | ES2022 | Bundler | Project references (`tsconfig.app.json` + `tsconfig.node.json`) |
| Backend | ES2022 | NodeNext | `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` |

---

## 8. Coverage

### Configuration

Both frontend and backend use Vitest V8 coverage with `json-summary` reporter:

```typescript
coverage: {
  provider: 'v8',
  reporter: ['json-summary'],
}
```

Running coverage:

```bash
npm run test:coverage --prefix frontend   # → frontend/coverage/coverage-summary.json
npm run test:coverage --prefix backend    # → backend/coverage/coverage-summary.json
```

### Combined report

The `scripts/generate-coverage-report.mjs` script reads both JSON summaries and generates a Markdown table combining frontend and backend **line**, **branch**, and **function** coverage. In CI it writes to `GITEA_STEP_SUMMARY` (or `GITHUB_STEP_SUMMARY`), printing a short Markdown table visible in the job summary.

Coverage is **informational** — it makes gaps visible but does not enforce a threshold. A coverage report is reviewed as part of the author's documented pre-merge self-review for source-code changes.

---

## 9. CI pipeline

The Gitea Actions workflow (`.gitea/workflows/ci.yml`) runs on every push and pull request using **Node.js 22**:

| Job | Steps |
|---|---|
| `frontend` | Install → Lint → Typecheck → Test → Build |
| `backend` | Install → Lint → Typecheck → Test → Build |
| `coverage` | Install both → Generate frontend coverage → Generate backend coverage → Generate quality report |
| `docs` | Install → Build |
| `e2e` | Provision PostgreSQL on port `55432` → Install all deps → Install Chromium → Run Playwright when Auth0/E2E secrets are configured; otherwise emit an explicit skip message |

### E2E job details

The `e2e` job provisions an isolated PostgreSQL cluster inside the job container:

```bash
sudo apt-get install -y postgresql libpq-dev
initdb → pg_ctl start -p 55432 → createdb athlora_e2e → set password
```

When the seven required Auth0/E2E repository secrets are not configured, the job prints a clear skip message and stays green:

```text
Skipping the e2e job: the Auth0 / E2E credentials are not configured.
Set VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID, VITE_AUTH0_AUDIENCE,
E2E_AUTH0_EMAIL, E2E_AUTH0_PASSWORD, E2E_GUEST_AUTH0_EMAIL, and
E2E_GUEST_AUTH0_PASSWORD as repository secrets to run the
full 100m vertical-slice suite (Playwright desktop + mobile + a11y).
```

On failure, the Playwright HTML report is uploaded as an artifact with 7-day retention.

---

## 10. Running tests locally — quick reference

```bash
# Frontend unit tests
cd frontend && npm run test

# Backend unit tests (skips integration tests)
cd backend && npm run test

# Backend integration tests (requires PostgreSQL)
docker run --rm -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:16
cd backend
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres npm run test

# E2E tests (requires PostgreSQL + Auth0 test accounts)
docker run --rm -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:16
cp e2e/.env.example e2e/.env   # fill credentials
cd e2e && npm install && npm run test:install && npm test

# Lint and typecheck
npm run lint --prefix frontend
npm run typecheck --prefix frontend
npm run lint --prefix backend
npm run typecheck --prefix backend

# Coverage
npm run test:coverage --prefix frontend
npm run test:coverage --prefix backend
node scripts/generate-coverage-report.mjs
```

---

## 11. Test file organisation

### Naming

- Unit and component tests: `*.test.ts` or `*.test.tsx` next to the source file
- Integration tests: `*.integration.test.ts` in the same directory as unit tests
- E2E specs: `*.spec.ts` in `e2e/tests/`

### Directory mapping

```
frontend/src/
  api/athletes.test.ts           → tests src/api/athletes.ts
  features/athletes/AthletesPage.test.tsx → tests src/features/athletes/AthletesPage.tsx
  components/Modal.test.tsx      → tests src/components/Modal.tsx

backend/src/
  routes/athletes.test.ts        → tests src/routes/athletes.ts
  services/athletes.test.ts      → tests src/services/athletes.ts
  services/athletes.integration.test.ts → tests src/services/athletes.ts against real DB

e2e/tests/
  vertical-slice.spec.ts         → tests the full 100m workflow
  helpers/accessibility.ts       → shared axe-core wrapper
  helpers/navigation.ts          → shared page navigation helpers
  helpers/names.ts               → unique test data generators
```

---

## 12. Writing new tests

When adding a new feature, tests should be written in the same session as the implementation. The "done" checklist requires:

- [ ] Backend: Supertest coverage for happy path + at least one validation/error path per new endpoint
- [ ] Result-derivation and merge logic: Vitest unit tests with edge cases (foul-only attempts, DQ, tied results)
- [ ] Frontend: RTL test per new component covering render + primary interaction
- [ ] Cross-cutting flows (login, live logging, offline sync): Playwright E2E added incrementally
- [ ] Accessibility: axe-core audit covers any new page or major view
- [ ] No task is "done" without its applicable automated checks passing; authenticated E2E checks additionally require configured repository secrets

### Guidelines

- **Test behaviour, not implementation.** Assert on what the component renders and how it responds to interaction, not on internal state or call counts.
- **Use accessible queries.** Prefer `getByRole`, `getByLabelText`, and `getByText` over `getByTestId`.
- **Mock at the boundary.** Mock API calls and external services, not internal utility functions.
- **Keep tests independent.** Each test should set up its own data and not depend on other tests running in a specific order.
- **Use unique test data.** E2E tests generate unique tokens, names, and IDs to prevent collisions between desktop and mobile runs.
- **Test error states.** Loading, empty, error, and retry states are first-class test scenarios.

---

## 13. Stakeholder feedback

Automated tests are complemented by manual stakeholder and user feedback. During Sprint 2, the client/stakeholder and users tested the deployed application and completed separate structured forms covering the product experience and improvement opportunities. The response evidence is retained with the Sprint records; feedback-to-issue/PR linkage is recorded only where that link is available.

The submitted response evidence and form links are retained in [Sprint 2 Stakeholder Feedback](./stakeholder-feedback) and [Sprint 2 User Feedback](./user-feedback). Manual feedback is not a substitute for unit, integration, end-to-end, or accessibility testing; it provides independent product perspectives alongside those automated quality gates.

---

## AI declaration

This document was created with the assistance of opencode[mimo-v2.5-free] and updated with the assistance of OpenCode[openai/gpt-5.6-terra].
