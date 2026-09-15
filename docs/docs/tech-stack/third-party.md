---
sidebar_position: 2
---

# Third-Party Code Integration

This document details every third-party library and external service integrated into Athlora, how each is used, where the integration code lives, and the design decisions behind each choice.

---

## 1. Authentication & Identity — Auth0 + jose

### Why

Auth0 handles identity flows (sign-up, login, password reset, social providers) without storing passwords in our database. `jose` provides standards-compliant JWT verification on the backend.

### Packages

| Package | Version | Used in |
|---------|---------|---------|
| `@auth0/auth0-react` | ^2.24.0 | Frontend |
| `jose` | ^6.2.8 | Backend |

### Frontend integration

**Provider setup** — `frontend/src/main.tsx` wraps the app in `<Auth0Provider>` configured via `frontend/src/utils/auth0.ts`:

```typescript
// frontend/src/utils/auth0.ts
auth0ProviderOptions() returns {
  domain: VITE_AUTH0_DOMAIN,
  clientId: VITE_AUTH0_CLIENT_ID,
  cacheLocation: 'localstorage',      // persists session across reloads
  authorizationParams: {
    audience: VITE_AUTH0_AUDIENCE,
    redirect_uri: window.location.origin,
    scope: 'openid profile email',
  },
}
```

Public routes (`/log/:token`, `/stats`) bypass Auth0 entirely and render without a provider.

**Token bridge** — `frontend/src/features/auth/Auth0TokenBridge.tsx` is a state machine with five states (`idle` → `synchronizing` → `ready` | `consent_required` | `onboarding` | `error`). On authentication it:

1. Calls `PUT /api/v1/auth/me` to synchronize the Auth0 profile with the local database.
2. Checks if consent has been accepted; if not, renders `ConsentGate`.
3. Loads workspace memberships; if none exist, renders `ClubOnboarding`.
4. Restores the active workspace from `localStorage` or server metadata.
5. Passes `getAccessTokenSilently` to the API client via `setAccessTokenGetter()`.

**API client token injection** — `frontend/src/api/client.ts` acquires a token before every request. When offline, it short-circuits to prevent Auth0 background refresh from cascading 401 errors. Tokens are sent as `Authorization: Bearer <token>`.

**Login/logout flows** — `frontend/src/App.tsx` and `frontend/src/features/auth/AuthPage.tsx` use `loginWithRedirect()` with `appState.returnTo` for post-login routing, `screen_hint: 'signup'` for registration, and `logout({ returnTo: origin })` for sign-out.

### Backend integration

**JWT verification** — `backend/src/middleware/auth.ts` uses `jose`'s `createRemoteJWKSet` to fetch Auth0's `.well-known/jwks.json` and `jwtVerify` to validate the token's signature, issuer, and audience. The three-tier middleware chain:

| Tier | Middleware | Purpose |
|------|-----------|---------|
| 1 | `verifyAuth0Token` | Pure JWT verification; attaches `req.auth0` |
| 2 | `resolveLocalApplicationUser` | Looks up `users` table; returns 403 if unsynchronized or deletion pending |
| 3 | `resolveApplicationUser` | Joins `workspace_members`; resolves workspace from `X-Workspace-Id` header |

**Auth0 Management API** — `backend/src/services/auth0-management.ts` uses the `client_credentials` grant to obtain a Management API token (scopes: `delete:users`, `create:user_tickets`). The token is cached in memory and refreshed 60 seconds before expiry. Used for permanent account deletion (`DELETE /api/v2/users/{auth0Id}`) and password-change tickets.

**Sync endpoint** — `PUT /api/v1/auth/me` fetches the Auth0 profile from `https://{domain}/userinfo` using the access token, verifies `sub` matches, and upserts into `users` via `ON CONFLICT (auth0_id) DO UPDATE`.

### Environment variables

| Variable | Side | Purpose |
|----------|------|---------|
| `VITE_AUTH0_DOMAIN` | Frontend | Auth0 tenant domain |
| `VITE_AUTH0_CLIENT_ID` | Frontend | SPA application client ID |
| `VITE_AUTH0_AUDIENCE` | Frontend | API audience identifier |
| `AUTH0_DOMAIN` | Backend | Same tenant domain for JWT issuer validation |
| `AUTH0_AUDIENCE` | Backend | Same audience for JWT audience validation |
| `AUTH0_MANAGEMENT_CLIENT_ID` | Backend | M2M application client ID |
| `AUTH0_MANAGEMENT_CLIENT_SECRET` | Backend | M2M application secret (never exposed to frontend) |
| `AUTH0_PASSWORD_RETURN_URL` | Backend | Return URL for password-change tickets |

### Key files

| File | Purpose |
|------|---------|
| `frontend/src/utils/auth0.ts` | Provider configuration helper |
| `frontend/src/main.tsx` | Auth0Provider mount and bootstrap |
| `frontend/src/features/auth/Auth0TokenBridge.tsx` | Sync state machine, workspace selection, consent gate |
| `frontend/src/api/client.ts` | Token injection into HTTP requests |
| `backend/src/middleware/auth.ts` | JWT verification and three-tier middleware chain |
| `backend/src/services/auth0-management.ts` | Management API token lifecycle |
| `backend/src/controllers/auth.ts` | Sync endpoint and password ticket creation |

---

## 2. Database — pg (PostgreSQL)

### Why

Raw `pg` with hand-written SQL gives full control over query shape, transactions, and migration behavior without ORM overhead. UUID primary keys and soft deletes are designed for future offline merge.

### Package

| Package | Version | Used in |
|---------|---------|---------|
| `pg` | ^8.23.0 | Backend |
| `pg` | ^8.13.1 | E2E |

### Connection pooling

`backend/src/db/client.ts` creates a singleton `pg.Pool` from `DATABASE_URL`. The `DbExecutor` type (`Pick<PoolClient, 'query'>`) is used throughout services for testability — tests can inject a mock executor without touching the real pool.

### Migration runner

`backend/src/db/migrate.ts` implements a checksum-tracked, advisory-locked migration runner:

- Reads sequential `.sql` files from `src/db/migrations/`.
- Computes SHA-256 checksums of line-ending-normalized content for cross-platform stability.
- Acquires a PostgreSQL advisory lock (`pg_advisory_lock(hashtext('athlora:migrations'))`) to prevent concurrent runs.
- Baselines an existing database if `0001_init.sql` is the first pending migration and all six initial tables already exist.
- Rejects modified applied migrations with a clear error.
- Applies all pending migrations inside a single transaction.

### Transaction helpers

`backend/src/db/transaction.ts` provides two wrappers:

- `withTransaction(op)` — standard `BEGIN`/`COMMIT`/`ROLLBACK` with client release and poison-connection handling.
- `withReadTransaction(op)` — uses `REPEATABLE READ READ ONLY` isolation for aggregate queries (dashboard, statistics) to prevent dirty reads.

### Key files

| File | Purpose |
|------|---------|
| `backend/src/db/client.ts` | Pool creation and `DbExecutor` type |
| `backend/src/db/migrate.ts` | Checksum-tracked migration runner |
| `backend/src/db/transaction.ts` | Transaction and read-only transaction helpers |
| `backend/src/db/row-mappers.ts` | Snake-case PostgreSQL rows to camelCase DTOs |

---

## 3. Weather — GraySky (Keyless)

### Why

GraySky provides current and daily weather forecasts without requiring an API key, account, or environment variable. It uses an Open-Meteo-compatible endpoint, making it zero-configuration for development and deployment.

### Integration type

Native `fetch` — no npm package.

### Backend implementation

`backend/src/services/weather.ts` (180 lines) handles the complete integration:

**API call:**
```
GET https://graysky.net/api/forecast?lat={lat}&lon={lon}
Accept: application/json
Timeout: 5 seconds (AbortSignal.timeout)
```

**US-to-metric normalization** (`normalizeGraySky`):
- Requires `units: "us"` in the response envelope.
- Fahrenheit → Celsius: `(F - 32) * 50 / 9 / 10` with rounding.
- Fractional rain chance → percent: `value * 100` with 1 decimal.
- inches/hour → mm/hour: `inches * 25400`.
- mph → km/h: `mph * 16.09344`.
- Timezone validated via `Intl.DateTimeFormat`.
- Day/night detection: explicit icon suffix (`-day`/`-night`) or sunrise/sunset comparison.

**Cache:**
- `WeakMap<typeof fetch, Map<string, entry>>` — scoped to the fetch instance for test isolation.
- Key: `"lat,lon"` string.
- TTL: 10 minutes (`CACHE_MS = 10 * 60_000`).
- Max 500 locations with FIFO eviction.
- Concurrent in-flight deduplication: stores the promise itself so multiple callers share one request.

**Error handling:**
- HTTP 429/503: reads `Retry-After` header (numeric or HTTP-date), applies `Math.max(30_000, parsedDelay)` cooldown.
- Network errors: 30-second negative cache.
- Timeouts → 504 `WEATHER_SERVICE_TIMEOUT`.
- Malformed JSON → 502 `WEATHER_SERVICE_INVALID_RESPONSE`.

**Two endpoints:**
- `GET /api/v1/events/:id/weather` — event-day forecast (selects the matching day from up to 10 daily records).
- `GET /api/v1/weather/current?latitude=&longitude=` — console current-weather readout.

### Frontend consumption

- `frontend/src/features/events/EventWeatherPanel.tsx` — displays temperature, rain chance, wind, timezone with GraySky attribution.
- `frontend/src/features/dashboard/CoachConsole.tsx` — live weather readout in the topbar, linked to GraySky.

### Key files

| File | Purpose |
|------|---------|
| `backend/src/services/weather.ts` | Full integration: API call, normalization, caching, error handling |
| `backend/src/routes/weather.ts` | Current weather endpoint |
| `backend/src/controllers/weather.ts` | Controller wiring |
| `frontend/src/features/events/EventWeatherPanel.tsx` | Event-day forecast display |
| `frontend/src/features/dashboard/CoachConsole.tsx` | Console weather readout |

---

## 4. Venue Search & Maps — Nominatim + OpenStreetMap

### Why

Nominatim provides free, attribution-compliant venue search without API keys. OpenStreetMap provides embeddable map previews. The server-proxied boundary keeps provider credentials and request patterns off the client.

### Integration type

Native `fetch` — no npm package.

### Backend implementation

`backend/src/services/venues.ts` (84 lines) owns the provider boundary:

**API call:**
```
GET {NOMINATIM_BASE_URL}/search?q={query}&format=jsonv2&limit=5&addressdetails=0
User-Agent: {NOMINATIM_USER_AGENT}
Timeout: 5 seconds
```

**Throttle:** A global `nextProviderRequestAt` timestamp enforces a minimum 1-second gap between requests, complying with Nominatim's strict rate limits.

**Cache:**
- `Map<lowercaseQuery, { expiresAt, results }>` with 5-minute TTL.
- Query lowercased for case-insensitive caching.

**Response parsing:** Strict validation — each result must have a non-empty `display_name` and parseable finite `lat`/`lon` within valid coordinate ranges. Returns at most 5 results with `{ displayName, latitude, longitude }`.

**Errors:** Timeout → 504, network error → 502, malformed response → 502. All use the standard error envelope.

### Frontend usage

- `frontend/src/features/events/EventsPage.tsx` — venue search is activated by explicit button click (no keystroke autocomplete, per Nominatim policy).
- `frontend/src/features/events/VenuePreview.tsx` — renders a read-only OpenStreetMap `<iframe>` embed with contributor attribution, saved coordinates, and an external map link fallback.

### Environment variables

| Variable | Purpose |
|----------|---------|
| `NOMINATIM_BASE_URL` | Provider base URL (default: `https://nominatim.openstreetmap.org`) |
| `NOMINATIM_USER_AGENT` | Identifiable application/contact string (required by usage policy) |

### Key files

| File | Purpose |
|------|---------|
| `backend/src/services/venues.ts` | Provider boundary, cache, throttle, response parsing |
| `backend/src/routes/venues.ts` | Search endpoint |
| `frontend/src/features/events/VenuePreview.tsx` | Map iframe and external link |

---

## 5. AI Voice Assistant — Google Gemini

### Why

Gemini Live provides real-time voice interaction with function-calling capability, enabling hands-free athlete creation during training sessions.

### Package

| Package | Version | Used in |
|---------|---------|---------|
| `@google/genai` | ^2.21.0 | Frontend + Backend |

### Backend: Token broker

`backend/src/controllers/ai.ts` creates a short-lived, single-use Gemini API token:

```typescript
const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const token = await client.authTokens.create({
  uses: 1,
  expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
});
```

The API key never leaves the server. The frontend receives the token name and authenticates directly with Gemini's WebSocket endpoint.

### Frontend: Two transport implementations

**1. SDK-based (primary)** — `frontend/src/api/geminiLiveSdk.ts`:

- `AthloraGeminiSession` class wraps `@google/genai`'s `ai.live.connect()`.
- Model: `gemini-3.1-flash-live-preview`, voice: `Sulafat`.
- Configures `responseModalities: [Modality.AUDIO]`, `outputAudioTranscription`, and function tools.
- Methods: `connect()`, `sendText()`, `sendAudio()`, `endAudioStream()`, `close()`.
- Callbacks: `onAudio`, `onTranscript`, `onTurnStart`, `onTurnComplete`, `onInterrupted`, `onSleepRequested`, `onToolCall`.

**2. WebSocket-based (legacy/fallback)** — `frontend/src/api/geminiLive.ts`:

- Raw WebSocket to `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained`.
- Manual setup message, `setupComplete` handshake, and `realtimeInput` text streaming.
- Same voice and tool configuration as the SDK version.

### Function tools

Both transports declare two tools:

| Tool | Parameters | Purpose |
|------|-----------|---------|
| `create_athlete` | `name` (required), `dob`, `gender`, `notes` | Creates an athlete after explicit user confirmation |
| `sleep_assistant` | none | Puts the assistant to sleep when asked to deactivate |

### Audio pipeline

**Microphone** (`frontend/src/api/geminiMicrophone.ts`):
- `getUserMedia` with echo cancellation, noise suppression, auto gain.
- `AudioContext` at 16kHz (Gemini input sample rate).
- `ScriptProcessorNode` converts Float32 → PCM16 → Base64 chunks.
- Routes through a muted `GainNode` to prevent feedback.
- `pause()`/`resume()` stops forwarding during assistant playback.

**Playback** (`frontend/src/api/geminiAudio.ts`):
- Decodes Base64 → PCM16 → Float32 at 24kHz (Gemini output rate).
- Creates `AudioBuffer` per chunk, schedules via `AudioBufferSourceNode`.
- 2ms gain envelope at chunk boundaries to prevent clicks.
- `nextStartTime` cursor for gapless playback.
- `playbackGeneration` counter prevents stale scheduling after `clear()`.

### System prompt

```
You are Athlora, the Athlora voice assistant.
Your current job is to help authorised users add athletes.
Never invent missing information.
Before creating an athlete, clearly confirm the details with the user.
Only use create_athlete after the user explicitly confirms.
```

### Audio format

| Direction | Format | Sample Rate | Encoding |
|-----------|--------|-------------|----------|
| Microphone → Gemini | Mono PCM16 | 16kHz | Base64 |
| Gemini → Speaker | Mono PCM16 | 24kHz | Base64 |

### Key files

| File | Purpose |
|------|---------|
| `backend/src/controllers/ai.ts` | Token broker endpoint |
| `backend/src/routes/ai.ts` | Route mounting |
| `frontend/src/api/ai.ts` | Token fetch client |
| `frontend/src/api/geminiLiveSdk.ts` | Primary SDK-based session |
| `frontend/src/api/geminiLive.ts` | Legacy WebSocket transport |
| `frontend/src/api/geminiAudio.ts` | PCM16 audio playback engine |
| `frontend/src/api/geminiMicrophone.ts` | Microphone capture and encoding |

---

## 6. Offline-First PWA — Dexie + vite-plugin-pwa

### Why

Dexie provides a typed, promise-based IndexedDB wrapper for offline action queuing. `vite-plugin-pwa` generates the service worker and manifest for installability and app-shell caching.

### Packages

| Package | Version | Used in |
|---------|---------|---------|
| `dexie` | ^4.4.5 | Frontend |
| `vite-plugin-pwa` | ^1.3.0 | Frontend |

### Dexie databases

**Authenticated users** — `frontend/src/offline/db.ts`:

Database name: `athlora-${userId}` (per-user isolation).

```typescript
db.version(1).stores({
  offlineActions:     'id, [status+eventId+createdAt], eventId, status',
  cachedEvents:       'id, [workspaceId+id]',
  cachedParticipants: 'eventId',
  cachedTimeline:     'eventId',
});
```

**Public loggers** — `frontend/src/offline/publicDb.ts`:

Database name: `athlora-public-${hash}` (session-scoped, anonymous).

```typescript
db.version(1).stores({
  publicOfflineActions: 'id, [status+eventId+createdAt], eventId, status',
  publicCachedSnapshots: 'id',
});
```

### Action queue

`frontend/src/offline/actionQueue.ts` provides:

| Function | Description |
|----------|-------------|
| `enqueueAction(input, userId)` | Adds a pending action with `crypto.randomUUID()` |
| `getPendingActions(eventId, userId)` | Returns pending actions in creation order via compound index |
| `markSynced(actionId, receipt, userId)` | Marks synced with server receipt |
| `markFailed(actionId, error, userId)` | Marks failed with error message |
| `getQueueStatus(eventId, userId)` | Returns `{ pending, synced, failed }` counts |

### Sync engine

`frontend/src/offline/syncEngine.ts` — `drainQueue(eventId, userId)`:

1. Fetches all pending actions for the event in creation order.
2. Builds a `SyncBatchRequest` with `deviceId`, `eventId`, and the action array.
3. Sends `POST /api/v1/sync/batch`.
4. Processes receipts: marks each action as synced (accepted/duplicate) or failed (rejected).
5. Returns `{ accepted, rejected, duplicates, failed }`.

`drainPublicQueue(eventId, sessionToken)` uses `POST /api/v1/public/logger/sync/batch`.

### Backend batch sync

`backend/src/services/sync.ts` (296 lines) processes the batch:

- **Idempotency:** checks `sync_action_receipts` for existing `action_id` before processing.
- **Optimistic concurrency:** edits use `WHERE version = $expectedVersion`.
- **Per-action isolation:** each action is individually wrapped in try/catch; a single failure does not abort the batch.
- **Audit trail:** every accepted, rejected, or duplicate action is recorded in `sync_action_receipts`.

### Service worker configuration

`frontend/vite.config.ts` — `VitePWA` plugin:

| Strategy | URL pattern | TTL | Notes |
|----------|-------------|-----|-------|
| `NetworkOnly` | Weather endpoints | — | Never serves stale weather |
| `NetworkFirst` | `/api/v1/**` | 1hr, 5s timeout | Falls back to cache when offline |
| `StaleWhileRevalidate` | Google Fonts stylesheets | — | Serves cached, revalidates in background |
| `CacheFirst` | Google Fonts webfonts | 1yr | Static font files rarely change |
| `StaleWhileRevalidate` | Fontshare | — | |
| `CacheFirst` | `.glb` 3D models | 1yr | Large binary assets cached aggressively |

Additional config: `registerType: 'autoUpdate'`, `maximumFileSizeToCacheInBytes: 10MB`, `navigateFallbackDenylist: [/^\/api\//, /^\/auth\//]`.

### Cleanup

`frontend/src/offline/cleanup.ts` — `Dexie.delete(dbName)` purges offline data; also clears service worker caches via `caches.delete()`.

### Key files

| File | Purpose |
|------|---------|
| `frontend/src/offline/db.ts` | Authenticated Dexie schema |
| `frontend/src/offline/publicDb.ts` | Public logger Dexie schema |
| `frontend/src/offline/actionQueue.ts` | Authenticated action queue |
| `frontend/src/offline/publicActionQueue.ts` | Public action queue |
| `frontend/src/offline/syncEngine.ts` | Queue drain and batch sync |
| `frontend/src/offline/cleanup.ts` | Offline data purge |
| `frontend/src/offline/networkStatus.ts` | Connectivity tracker |
| `backend/src/services/sync.ts` | Server-side batch processing |
| `backend/src/routes/sync.ts` | Batch sync endpoint |
| `frontend/vite.config.ts` | PWA manifest and service worker config |

---

## 7. Realtime — Socket.IO

### Why

Socket.IO provides reliable WebSocket communication with automatic fallback to polling, room-based event broadcasting, and middleware support for authentication.

### Packages

| Package | Version | Used in |
|---------|---------|---------|
| `socket.io` | ^4.8.3 | Backend |
| `socket.io-client` | ^4.8.3 | Frontend |

### Backend

`backend/src/realtime/index.ts` (148 lines):

**Dynamic loading:** Socket.IO is loaded via `Function('specifier', 'return import(specifier)')('socket.io')` to avoid static bundling issues.

**Authentication:** The `io.use()` middleware extracts `socket.handshake.auth.token` and calls `verifyAuth0AccessToken()` — the same `jose`-based verification used by Express routes. Failed verification disconnects the socket.

**Room management:**
- Room naming: `event:{eventId}`.
- `event:subscribe` handler validates the socket is authenticated, then calls `authorizeEventSubscription(auth0Id, eventId)`.
- Authorization checks: workspace membership, accepted fixture participation, or active helper grant (with a 2-hour read-only window for completed/cancelled events).

**Broadcasting:** `notifyEventInvalidated(eventId, resources)` emits `realtime:invalidate` to all sockets in the event room with `{ id, eventId, resources, occurredAt }`. Resources are typed: `'event' | 'participants' | 'results' | 'timeline'`.

**Helper revocation:** `disconnectHelperFromEvent(auth0Id, eventId)` removes the helper from the event room and emits `realtime:access-revoked`.

### Frontend

`frontend/src/features/realtime/useRealtimeRoom.ts` — custom hook:

1. **Lazy loading:** `socket.io-client` is imported dynamically to keep it out of the main bundle.
2. **Connection:** `io(realtimeUrl, { auth: { token, workspaceId }, transports: ['websocket', 'polling'] })`.
3. **Subscription:** On connect, emits `event:subscribe` with the `eventId`.
4. **Invalidation protocol:** Listens for `realtime:invalidate` and triggers an HTTP refetch — the realtime channel carries only invalidation signals, never authoritative data.
5. **Deduplication:** `Set<string>` of received notification IDs (capped at 200).
6. **Offline handling:** Disconnects when `useOnlineStatus()` reports offline.
7. **States:** `'unavailable'`, `'connecting'`, `'connected'`, `'disconnected'`, `'error'`.

### Key files

| File | Purpose |
|------|---------|
| `backend/src/realtime/index.ts` | Server: auth, rooms, broadcasting, revocation |
| `frontend/src/features/realtime/useRealtimeRoom.ts` | Client: connection, subscription, invalidation |

---

## 8. 3D Graphics — Three.js + React Three Fiber + drei

### Why

Three.js with React Three Fiber provides declarative 3D rendering within React. Used for the landing page cinematic experience and the anatomical injury viewer.

### Packages

| Package | Version | Used in |
|---------|---------|---------|
| `three` | ^0.185.1 | Frontend |
| `@react-three/fiber` | ^8.18.0 | Frontend |
| `@react-three/drei` | ^9.122.0 | Frontend |

### Landing page cinematic stage

`frontend/src/features/landing/cinematic/PersistentWebGLStage.tsx` — one lazy-loaded, decorative canvas:

**Canvas config:**
```typescript
<Canvas
  dpr={compact ? [1, 1] : [1, 1.5]}
  camera={{ position: [...], fov: 35, near: 0.1, far: 65 }}
  frameloop={paused ? 'never' : 'always'}
  gl={{ alpha: false, antialias: true, powerPreference: 'high-performance' }}
/>
```

**Scene components:**
1. `fog` — dark navy (`#00070d`) from distance 11 to 31.
2. Lights — ambient cyan (`#9beff8`, 0.2), directional white (`#d8feff`, 1.65), point cyan (`#087f9c`, 4.5).
3. `StadiumIntro` — arched tunnel with extruded panels, glowing arches (additive blending), wordmark HTML overlays, custom shader floor with cyan edge glow and portal effect.
4. `CameraRig` — smoothly interpolates position and lookAt between intro and legacy camera paths.
5. `TrackWorld` — procedural stadium track geometry (8 lane lines as `lineLoop`, surface and lanes fade in on scroll).
6. `AthleteSignals` — 4 glowing spheres moving along a `CatmullRomCurve3` path.
7. `PerformanceRibbon` — a `<Line>` geometry that morphs from track outline to 3D performance graph on scroll, with `<Html>` data labels.
8. `FitnessTeaserGate` — lazily loads the anatomy model via `requestIdleCallback`.

**Performance:** Compact DPR profile for low-end devices, reduced-motion CSS fallback, pauses `frameloop` when tab is hidden.

### Anatomy body viewer

`frontend/src/features/fitness/BodyViewer.tsx` — on-demand injury visualization:

**Model:** `athlora-anatomy.glb` (79,534 position vertices, 120,000 triangles) with a companion `athlora-anatomy-map-v2.json` providing per-vertex `regionId` and `coreWeight`.

**Canvas:**
```typescript
<Canvas dpr={[1, 1.5]} camera={{ position: [0, 1.6, 6], fov: 31 }}
  gl={{ antialias: true, powerPreference: 'high-performance' }} />
```

**Custom material** (`frontend/src/features/fitness/anatomyMaterial.ts`):
- `MeshStandardMaterial` with `onBeforeCompile` shader injection.
- Injects `injuryColor` (vec3) and `injuryStrength` (float) vertex attributes.
- Fragment shader blends injury colors based on `injuryStrength` with emissive glow.
- Severity mapping: Minor = `#d17b00` (0.72), Moderate = `#e23b00` (0.84), Severe = `#dc002f` (0.98).

**Surface map** (`frontend/src/features/fitness/anatomySurfaceMap.ts`):
- `attachAnatomyAttributes()` adds `anatomyRegion`, `anatomyCoreWeight`, `injuryColor`, `injuryStrength` buffer attributes.
- `updateInjuryAttributes()` resolves UI injury regions (body part + area + side) to vertex region IDs and updates color/strength buffers.
- `uiMappings` maps `{region → area → side → [regionName]}`.

**Controls:** `OrbitControls` from drei with damping (0.075), constrained polar angles (0.72–2.35), zoom range 3.4–8.5. `ContactShadows` for grounding. Camera auto-frames the model.

### Key files

| File | Purpose |
|------|---------|
| `frontend/src/features/landing/cinematic/PersistentWebGLStage.tsx` | Landing page 3D stage |
| `frontend/src/features/landing/cinematic/StadiumIntro.tsx` | Tunnel and arches |
| `frontend/src/features/landing/cinematic/introTimeline.ts` | Camera animation curves |
| `frontend/src/features/fitness/BodyViewer.tsx` | Anatomy viewer |
| `frontend/src/features/fitness/anatomyMaterial.ts` | Custom shader material |
| `frontend/src/features/fitness/anatomySurfaceMap.ts` | Vertex-to-injury mapping |

---

## 9. Charts — Custom SVG

### Why

The project uses hand-built SVG charts rather than Chart.js to avoid a runtime dependency and maintain full control over the visual language matching the approved mockups. Chart.js was originally planned but not installed.

### Implementation

**Progression chart** — `frontend/src/features/athletes/ProgressionChart.tsx` (370 lines):

- Fetches data via `getAthleteProgression(athleteId, { year })`.
- `buildChartGeometry()` computes scaled x/y coordinates:
  - X-axis: date (linear time scale).
  - Y-axis: time in seconds (with 12% padding, 5 tick marks).
- Renders as `<svg viewBox="0 0 700 320">` with axis lines, dashed grid lines, `<polyline>` for the data line, `<circle>` for points (PB milestones rendered larger with white stroke), transparent hit-area for pointer tracking, and a positioned tooltip `<g>`.
- Toggle between `'chart'` and `'table'` view modes.

**Comparison chart** — `frontend/src/features/comparison/ComparisonPage.tsx`:

- Supports up to 5 athletes simultaneously with 5 fixed series colors.
- Same SVG structure as progression but with multiple `<g>` groups per athlete.
- Four comparison modes: `athlete-club`, `athlete-cross-club`, `club-statistics`, `club-comparison`.
- `club-statistics` and `club-comparison` render HTML `<table>` elements instead of charts.

### Key files

| File | Purpose |
|------|---------|
| `frontend/src/features/athletes/ProgressionChart.tsx` | Single-athlete progression |
| `frontend/src/features/comparison/ComparisonPage.tsx` | Multi-athlete and club comparison |

---

## 10. QR Code — qrcode

### Package

| Package | Version | Used in |
|---------|---------|---------|
| `qrcode` | ^1.5.4 | Frontend |
| `@types/qrcode` | ^1.5.6 | Frontend |

### Implementation

`frontend/src/features/events/PublicLoggerPanel.tsx`:

```typescript
import { toDataURL } from 'qrcode';

void toDataURL(shareUrl, { errorCorrectionLevel: 'M', margin: 1, width: 240 })
  .then((code) => { if (current) setQrCode(code); });
```

Generates a Base64 data URL from the public logger shareable link (`{origin}/log/{token}`). Rendered as `<img src={qrCode}>`. The QR code is shown once after link creation and cleared on revocation.

---

## 11. Security Middleware — helmet + cors

### Packages

| Package | Version | Used in |
|---------|---------|---------|
| `helmet` | ^8.3.0 | Backend |
| `cors` | ^2.8.6 | Backend |

### Configuration

`backend/src/app.ts`:

```typescript
app.use(helmet());                        // All default security headers
app.use(cors({ origin: allowedOrigins })); // CORS_ORIGINS env var, comma-separated
```

**helmet** sets `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy`, `Referrer-Policy`, and other standard headers with secure defaults. No custom configuration.

**cors** parses `CORS_ORIGINS` (default: `http://localhost:5173`) and allows only listed origins. Used by both Express HTTP and Socket.IO.

### Request pipeline order

1. `helmet()` — security headers
2. `cors()` — CORS headers
3. `express.json()` — body parsing
4. `/health` — unauthenticated
5. `/api/v1` — authenticated routes
6. `notFoundHandler` — 404
7. `errorHandler` — catch-all

---

## 12. Fonts — Google Fonts + Fontshare

### Loaded in `frontend/index.html`

| Font | Source | Weights | Purpose |
|------|--------|---------|---------|
| Bebas Neue | Google Fonts | — | Display/headline (landing titles) |
| Inter | Google Fonts | 400–900 | Primary UI body font |
| Space Mono | Google Fonts | 400, 700 | Monospace (data/numbers) |
| Space Grotesk | Google Fonts | 500–700 | 3D overlays, landing brand |
| Satoshi | Fontshare | 400–700 | Alternative sans-serif body |

### Token mapping

`frontend/src/styles/tokens.css`:

```css
--font-display: 'Space Grotesk', 'Inter', ...;
--font-family-base: 'Satoshi', 'Inter', ...;
--font-family-mono: 'Space Grotesk', ...;
```

### PWA caching

- Google Fonts stylesheets: `StaleWhileRevalidate`
- Google Fonts webfonts: `CacheFirst` with 1-year TTL, max 30 entries
- Fontshare: `StaleWhileRevalidate`

---

## 13. Testing — Vitest + RTL + Supertest + Playwright + axe-core

### Packages

| Package | Version | Used in |
|---------|---------|---------|
| `vitest` | ^3.2.7 | Frontend + Backend |
| `@vitest/coverage-v8` | ^3.2.7 | Frontend + Backend |
| `@testing-library/react` | ^16.3.0 | Frontend |
| `@testing-library/dom` | ^10.4.1 | Frontend |
| `@testing-library/jest-dom` | ^6.9.1 | Frontend |
| `@testing-library/user-event` | ^14.6.1 | Frontend |
| `supertest` | ^7.2.2 | Backend |
| `@playwright/test` | ^1.62.1 | Frontend E2E |
| `@playwright/test` | ^1.55.0 | Standalone E2E |
| `axe-core` | ^4.13.0 | Frontend + E2E |
| `@axe-core/playwright` | ^4.13.0 | Frontend |
| `@axe-core/playwright` | ^4.10.1 | E2E |

### Vitest configuration

**Frontend** — embedded in `frontend/vite.config.ts`:
- Environment: `jsdom`, globals enabled.
- Setup file: `src/test/setup.ts` (imports `@testing-library/jest-dom/vitest`, stubs `window.matchMedia`).
- Coverage: V8 provider, `json-summary` reporter.

**Backend** — `backend/vitest.config.ts`:
- Default Node.js environment.
- Coverage: V8 provider, `json-summary` reporter.

### Testing patterns

**Frontend (RTL):** 62 test files covering API wrappers, feature components, shared components, hooks, and pure logic. Uses `vi.mock()` for dependency replacement, `@testing-library/user-event` for realistic interactions, and accessible role queries (`getByRole`, `getByLabelText`).

**Backend (Supertest):** 15 test files covering route validation, response shapes, status codes, auth headers, ownership non-disclosure, and lifecycle state machines. Uses mocked `jose.jwtVerify` and `pg.Pool.query`.

**Backend integration:** 8 `TEST_DATABASE_URL`-gated test files exercising real PostgreSQL — migrations, athlete/event/participant/timeline persistence, aggregates, cross-coach authorization, and injuries.

**E2E (Playwright):** 20 spec files in `e2e/tests/` running against real Auth0, backend, frontend, and PostgreSQL. Projects: `auth-setup`, `smoke`, `desktop-chromium`, `mobile-chromium`. Auth setup fills Auth0 Universal Login forms and saves browser state. Serial execution (`workers: 1`) with per-project unique data.

**Accessibility (axe-core):** `@axe-core/playwright` audits dashboard, roster, events, live logger, comparison, fixtures, account, and athlete detail pages against WCAG 2.0/2.1 A/AA. Fails on critical or serious violations.

### Key files

| File | Purpose |
|------|---------|
| `frontend/vite.config.ts` | Frontend Vitest config |
| `backend/vitest.config.ts` | Backend Vitest config |
| `frontend/src/test/setup.ts` | Test setup (matchers, matchMedia stub) |
| `e2e/playwright.config.ts` | E2E Playwright config |
| `e2e/global-setup.ts` | DB migration + truncation before each run |
| `e2e/tests/auth.setup.ts` | Auth0 Universal Login automation |
| `e2e/tests/helpers/accessibility.ts` | Shared axe-core wrapper |

---

## 14. Documentation — Docusaurus

### Package

| Package | Version | Used in |
|---------|---------|---------|
| `@docusaurus/core` | 3.10.2 | Docs |
| `@docusaurus/preset-classic` | 3.10.2 | Docs |

### Configuration

`docs/docusaurus.config.ts`:
- Theme: classic preset with `prismThemes.github` (light) and `prismThemes.dracula` (dark).
- `respectPrefersColorScheme: true`.
- Deployed to `https://athlora-deploy.pages.dev` via Cloudflare Pages.

### Key files

| File | Purpose |
|------|---------|
| `docs/docusaurus.config.ts` | Site configuration |
| `docs/sidebars.ts` | Navigation structure |
| `docs/docs/` | Source markdown pages |

---

## 15. Build & Tooling

### Vite

| Package | Version | Used in |
|---------|---------|---------|
| `vite` | ^6.4.3 | Frontend |
| `@vitejs/plugin-react` | ^4.7.0 | Frontend |

`frontend/vite.config.ts` configures the React plugin, PWA plugin, Vitest, and build output. Dev server on port 5173; E2E uses strict port 5174.

### TypeScript

| Package | Version | Used in |
|---------|---------|---------|
| `typescript` | ~5.9.3 | Frontend + Backend |
| `typescript` | ~6.0.2 | Docs |

Both frontend and backend use `strict: true`. Backend adds `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`.

### ESLint

| Package | Version | Used in |
|---------|---------|---------|
| `eslint` | ^9.39.5 | All packages |
| `typescript-eslint` | ^8.67.0 | All packages |
| `eslint-plugin-react-hooks` | ^5.2.0 | Frontend |
| `eslint-plugin-react-refresh` | ^0.4.20 | Frontend |

Flat config format (`eslint.config.js`) in each package.

### Other tooling

| Package | Version | Purpose |
|---------|---------|---------|
| `dotenv` | ^17.4.0 | Backend env loading |
| `tsx` | ^4.23.12 | Backend dev server (watch mode) |
| `hls.js` | 1.6.14 | Declared dependency (reserved for future use) |

---

## Summary: Environment Variables

| Variable | Side | Integration |
|----------|------|-------------|
| `DATABASE_URL` | Backend | pg connection |
| `AUTH0_DOMAIN` | Backend | JWT issuer |
| `AUTH0_AUDIENCE` | Backend | JWT audience |
| `AUTH0_MANAGEMENT_CLIENT_ID` | Backend | Management API |
| `AUTH0_MANAGEMENT_CLIENT_SECRET` | Backend | Management API |
| `AUTH0_PASSWORD_RETURN_URL` | Backend | Password tickets |
| `GEMINI_API_KEY` | Backend | Gemini token broker |
| `CORS_ORIGINS` | Backend | CORS + Socket.IO |
| `NOMINATIM_BASE_URL` | Backend | Venue search |
| `NOMINATIM_USER_AGENT` | Backend | Venue search |
| `VITE_AUTH0_DOMAIN` | Frontend | Auth0 provider |
| `VITE_AUTH0_CLIENT_ID` | Frontend | Auth0 provider |
| `VITE_AUTH0_AUDIENCE` | Frontend | Auth0 provider |
| `VITE_API_BASE_URL` | Frontend | API client base |
| `VITE_REALTIME_URL` | Frontend | Socket.IO endpoint |

---

## AI Declaration

This document was created with the assistance of opencode[mimo-v2.5-free]. Research and compilation were performed with the assistance of opencode[mimo-v2.5-free].
