---
sidebar_position: 7
---

# Venue Search API

Athlora proxies Nominatim (OpenStreetMap) for explicit venue search through an authenticated server-side boundary. The browser never contacts the provider directly.

## Endpoint

```
GET /api/v1/venues/search?q=Ellis Park
```

The route accepts exactly one query field: a trimmed non-blank `q` of at most 200 characters.

## Response

```json
{
  "data": [
    { "displayName": "Ellis Park Stadium", "latitude": -26.2041, "longitude": 28.0473 }
  ],
  "meta": { "count": 1 }
}
```

At most five results are returned. Each contains `displayName`, `latitude`, and `longitude`.

## Validation

| Condition | Response |
|---|---|
| Unknown, missing, or blank `q` | `400 VALIDATION_ERROR` |
| Repeated or non-string `q` | `400 VALIDATION_ERROR` |
| Overlong `q` (> 200 chars) | `400 VALIDATION_ERROR` |

## Provider Boundary

`backend/src/services/venues.ts` owns the Nominatim integration:

- Native `fetch` with a five-second timeout
- Identifiable `NOMINATIM_USER_AGENT` per Nominatim usage policy
- Five-minute process-memory query cache
- One-second process-local provider interval
- Strict response parsing (finite `lat`/`lon` within valid ranges)

## Error Codes

| Code | Status | Meaning |
|---|---|---|
| `VENUE_SERVICE_TIMEOUT` | 504 | Nominatim request timed out |
| `VENUE_SERVICE_UNAVAILABLE` | 502 | Provider outage or rate limit |
| `VENUE_SERVICE_INVALID_RESPONSE` | 502 | Malformed provider response |

## Frontend Usage

Venue search is activated by explicit button click (no keystroke autocomplete, per Nominatim policy). Selecting a result fills the existing `locationName`, `latitude`, and `longitude` event fields. Users can manually type or adjust all three fields.

`VenuePreview` renders a responsive read-only OpenStreetMap `<iframe>` embed with contributor attribution, saved coordinates, and an external map link fallback.

## Environment Variables

| Variable | Purpose |
|---|---|
| `NOMINATIM_BASE_URL` | Provider base URL (default: `https://nominatim.openstreetmap.org`) |
| `NOMINATIM_USER_AGENT` | Identifiable application/contact string (required by usage policy) |

## Key Files

| File | Purpose |
|---|---|
| `backend/src/services/venues.ts` | Provider boundary, cache, throttle, response parsing |
| `backend/src/routes/venues.ts` | Search endpoint |
| `frontend/src/features/events/VenuePreview.tsx` | Map iframe and external link |

## AI declaration

This document was created with the assistance of opencode[mimo-v2.5-free].
