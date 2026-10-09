---
sidebar_position: 5
---

# Performance and reliability

Athlora is designed for live event use, where a delayed or duplicated result is more harmful than a slow decorative surface. The API remains the authority for mutations and derived results; realtime and offline features improve availability without changing that rule.

## Implemented controls

| Area | Current control |
|---|---|
| Browser bundle | The 3D landing and anatomy viewer are lazy-loaded; compact and reduced-motion profiles reduce visual work. |
| Offline use | The PWA caches the app shell and eligible reads. Writes queue in IndexedDB and replay through idempotent batch endpoints. |
| Live updates | Socket.IO sends invalidations only. Clients refetch canonical HTTP state instead of trusting a socket mutation result. |
| Database reads | Purpose-built indexes support roster, event, timeline, archive, and result queries. Aggregate reads use read-only transactions. |
| Provider resilience | Weather and venue lookups have timeouts, cache/throttle behaviour, bounded responses, and isolated error states. |
| Session finalization | Generic-session finalization creates a durable job. Writes are blocked while it is pending/running; failures retain an actionable error and can be retried. |
| Diagnostics | Optional structured request-timing logs and configurable PostgreSQL pool limits support bounded investigations. |

## Measurement procedure

No load-test throughput, Core Web Vitals, or production availability figures are claimed here because they have not been captured as a repeatable evidence set. Record a dated result before presenting one as a project metric.

Use these checks when collecting evidence:

```bash
# Production-equivalent frontend bundle
npm run build --prefix frontend

# API correctness and database-backed integration suite
TEST_DATABASE_URL=postgresql://... npm run test --prefix backend

# Desktop/mobile end-to-end flow and accessibility checks
npm test --prefix e2e
```

For API investigations, temporarily set `REQUEST_TIMING_LOG=true` on a non-sensitive environment and capture route, status, duration, and response-byte summaries. Do not log tokens, credentials, or athlete data. For browser investigations, record device/network conditions, route, cache state, and the measured navigation or interaction outcome alongside the build SHA.

## Operational limit

Realtime broadcasting is process-local on the current Render deployment. Run one API instance for consistent event invalidations; introducing multiple instances requires a shared Socket.IO adapter. The application remains functional through HTTP refresh when realtime is unavailable.

## AI declaration

This document was created or updated with the assistance of OpenCode[openai/gpt-5.6-terra].
