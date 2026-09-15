---
sidebar_position: 4
---

# External Integrations

Athlora integrates with several external services for weather, venue search, AI voice, and authentication. This reference summarises each integration's API boundary, error handling, and key files.

## GraySky — Weather

| Property | Detail |
|---|---|
| Type | Keyless native `fetch` |
| Endpoint | `https://graysky.net/api/forecast?lat={lat}&lon={lon}` |
| Auth required | No |
| Environment variables | None (keyless) |

The backend proxies GraySky through two endpoints:

- `GET /api/v1/events/:id/weather` — event-day forecast (up to 10 daily records)
- `GET /api/v1/weather/current?latitude=&longitude=` — console current-weather readout

US-customary responses are normalised server-side to metric DTOs (Celsius, mm/h, km/h). Both surfaces share a ten-minute coordinate cache with in-flight deduplication and a 30-second failure cooldown. Timeouts return `504 WEATHER_SERVICE_TIMEOUT`; outages return `502 WEATHER_SERVICE_UNAVAILABLE`.

See [Weather](./weather) for the full DTO reference.

## Nominatim — Venue Search

| Property | Detail |
|---|---|
| Type | Server-proxied native `fetch` |
| Endpoint | `{NOMINATIM_BASE_URL}/search?q={query}&format=jsonv2&limit=5` |
| Auth required | Yes (authenticated route, provider boundary server-side) |
| Environment variables | `NOMINATIM_BASE_URL`, `NOMINATIM_USER_AGENT` |

The browser never contacts Nominatim directly. `GET /api/v1/venues/search?q=` accepts a trimmed non-blank query of at most 200 characters and returns at most five `{ displayName, latitude, longitude }` results. A five-second timeout, one-second provider throttle, and five-minute query cache protect the public endpoint.

See [Venues](./venues) for the full DTO reference.

## Google Gemini — AI Voice Assistant

| Property | Detail |
|---|---|
| Type | Backend token broker + frontend WebSocket |
| Endpoint | `POST /api/v1/ai/gemini-token` (backend), `wss://generativelanguage.googleapis.com/ws/...` (frontend) |
| Auth required | Yes (Auth0 JWT for token endpoint) |
| Environment variables | `GEMINI_API_KEY` (backend only) |

The backend creates a short-lived, single-use Gemini API token. The frontend uses `@google/genai` SDK to establish a `BidiGenerateContentConstrained` WebSocket session with the Sulafat voice. Gemini output is mono PCM16 at 24kHz; microphone input is mono PCM16 at 16kHz.

Two function tools are declared: `create_athlete` (after user confirmation) and `sleep_assistant` (deactivation command).

See [AI Integration](./ai-integration) for the full architecture.

## Auth0 — Authentication

| Property | Detail |
|---|---|
| Type | Hosted login + JWT verification |
| Frontend package | `@auth0/auth0-react` |
| Backend package | `jose` |
| Environment variables | `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `AUTH0_MANAGEMENT_CLIENT_ID`, `AUTH0_MANAGEMENT_CLIENT_SECRET` |

Auth0 handles sign-up, login, password reset, and social providers. The backend verifies JWTs with `jose.jwtVerify` and resolves the application user through a three-tier middleware chain. The Management API is used for permanent account deletion and password-change tickets.

See [Auth0](./auth0) for the full integration reference.

## AI declaration

This document was created with the assistance of opencode[mimo-v2.5-free].
