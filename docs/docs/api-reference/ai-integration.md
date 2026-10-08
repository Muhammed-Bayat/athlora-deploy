---
sidebar_position: 13
---

# AI Coaching Assistant

Athlora's authenticated coaching assistant combines Gemini Live voice interaction with deterministic, workspace-scoped analytics. Gemini explains verified tool output; it does not calculate rankings, infer unavailable data, or make medical claims.

## Architecture

```text
Browser (voice, tool UI, PDF) -- authenticated HTTPS --> Athlora API
Browser -- one-use ephemeral token --> Gemini Live API
Athlora API -- server-only GEMINI_API_KEY --> Gemini token service
Athlora API -- workspace-scoped queries --> PostgreSQL
```

The browser never receives the server API key. `POST /api/v1/ai/gemini-token` returns `{ data: { token, model } }` after Auth0 authentication and application-user resolution. The token is limited to one use, expires after 30 minutes, and is constrained to the returned Live model.

## Model Configuration

The default model is `gemini-3.8-live-extended-thinking`. Live connections use:

```ts
thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM }
```

Set `GEMINI_LIVE_MODEL=rollback` in the backend environment to use the previous `gemini-3.1-flash-live-preview` model. A named supported model can also be supplied through `GEMINI_LIVE_MODEL`. The token broker and browser use the same returned model, so a browser cannot switch models independently.

Before enabling a production key, an operator must confirm that its Gemini project has access to the selected model, sufficient quota, and the intended billing state. Athlora does not enable billing or paid services.

## Live Behavior

`AthloraGeminiSession` in `frontend/src/api/geminiLiveSdk.ts` is the production wrapper around `@google/genai`.

- Sulafat is requested when supported by the model.
- Every function declaration uses `Behavior.NON_BLOCKING`.
- `InteractionStatus.IN_PROGRESS` and `InteractionStatus.IDLE` drive completion. `turnComplete` is only a compatibility fallback if no interaction status has been received.
- Multiple calls in one tool request run concurrently and return together.
- Interrupted, closed, or replaced sessions abort active tool calls and suppress stale responses.
- Gemini audio is accepted only as PCM at 24 kHz; microphone input is PCM16 at 16 kHz.
- The exact startup greeting is `Good day coach, how can I help?`

## Deterministic Analytics

All endpoints are under `/api/v1/analytics`, require authentication, derive workspace identity from the request context, validate query parameters, and use parameterized SQL.

| Endpoint | Purpose | Key filters |
|---|---|---|
| `GET /coach/performance` | Multi-athlete performance facts and compact result history | `athleteIds`, `discipline`, `dateFrom`, `dateTo`, `lifecycleStatus` |
| `GET /coach/injuries` | Recorded-injury monitoring indicators | `athleteIds`, `dateFrom`, `dateTo`, `lifecycleStatus` |
| `GET /coach/rankings` | Discipline-specific promising-athlete ranking | `discipline`, `dateFrom`, `dateTo`, `lifecycleStatus`, `limit` |

Performance analysis distinguishes direction-aware improvement for timed events (lower is better) and field events (higher is better). It reports all-time personal best, season best, selected-range best, recent trend, volatility, plateau status, result counts, lifecycle state, and explicit insufficient-data reasons.

Ranking weights are documented in every response: standing 45%, improvement percentage 25%, consistency 20%, and valid result count 10%. Factors lacking sufficient comparable data are omitted and remaining weights are normalized. Ties are resolved by standing, athlete name, then athlete ID.

## Injury Safety

Injury analytics returns only body region, area, side, severity, relevant dates, active state, and derived record-based warning reasons. Injury notes and free-text details are never returned to Gemini or the PDF tools.

The assistant must describe these signals as monitoring information only. It must not diagnose, estimate injury probability, or claim workload, wellness, readiness, attendance, treatment, sleep, heart-rate, RPE, or recovery facts because Athlora does not store those data.

## Gemini Tools

Existing tools support page context, discipline lookup, athlete search, individual/discipline analytics, athlete-draft preparation, named/current-location weather, and sleep.

Coaching tools are:

| Tool | Purpose |
|---|---|
| `get_coach_performance_analysis` | Retrieve factual direction-aware performance analysis. |
| `get_coach_injury_analysis` | Retrieve non-diagnostic recorded-injury indicators. |
| `get_coach_rankings_analysis` | Retrieve one-discipline deterministic rankings. |
| `download_coach_performance_report` | Re-query filtered data and download a real performance PDF. |
| `download_coach_injury_report` | Re-query filtered data and download a monitoring-only injury PDF. |
| `download_coach_rankings_report` | Re-query filtered data and download a ranking-methodology PDF. |

The system instruction requires evidence-first answers: use tools for Athlora facts, state no data or no conclusion when appropriate, explain the factual change and discipline direction, and offer one concrete non-medical coaching action. Reports require real tool results and are generated locally with `pdf-lib`.

## Session Lifecycle

1. The authenticated coach opens the assistant.
2. The frontend requests a short-lived, model-constrained token.
3. The browser opens Gemini Live with the returned model, Sulafat voice, tools, and system instruction.
4. The coach speaks or types; the browser streams audio/transcripts and renders response status.
5. Gemini asks for data through non-blocking tools; the browser calls Athlora's authenticated APIs and returns verified results.
6. The assistant completes on `IDLE`, then microphone forwarding resumes after queued output finishes.
7. A report tool generates a local PDF from the exact server response and downloads it.

## Key Modules

| Module | Responsibility |
|---|---|
| `backend/src/controllers/ai.ts` | Ephemeral token broker and model constraint. |
| `backend/src/services/coachAnalytics.ts` | Direction-aware performance, ranking, and injury-monitoring calculations. |
| `frontend/src/api/geminiLiveSdk.ts` | Live SDK, Extended Thinking, status/tool orchestration, and cancellation. |
| `frontend/src/features/assistant/AthloraAssistantProvider.tsx` | Authenticated tool execution, UI state, downloads, microphone behavior. |
| `frontend/src/features/reports/coachingAnalyticsReport.ts` | Evidence-only multi-athlete PDF generation. |

## AI Declaration

This document was updated with the assistance of OpenCode[gpt-5.6-terra].
