---
sidebar_position: 6
---

# Weather API

Athlora proxies GraySky Free for event-day forecasts and the console current-weather readout. No provider account, API key, or environment variable is required. All requests are server-side, authenticated, and cached.

## Endpoints

### Event-Day Forecast

```
GET /api/v1/events/:id/weather
```

After authentication and ownership checks, returns the stored event date's forecast from up to ten daily records.

### Current Weather

```
GET /api/v1/weather/current?latitude=-26.2041&longitude=28.0473
```

Returns current conditions for the console readout.

## Forecast DTO

```json
{
  "data": {
    "date": "2026-09-15",
    "timezone": "Africa/Johannesburg",
    "weatherCode": "clear-day",
    "temperatureMinC": 12,
    "temperatureMaxC": 26,
    "precipitationProbabilityMaxPercent": 5,
    "windSpeedKmh": 14
  }
}
```

All metrics and timezone are nullable. `weatherCode` is a string condition identifier.

## Current Weather DTO

```json
{
  "data": {
    "timezone": "Africa/Johannesburg",
    "temperatureC": 22,
    "apparentTemperatureC": 21,
    "humidityPercent": 45,
    "isDay": true,
    "precipitationRateMmHr": 0,
    "weatherCode": "clear-day",
    "windSpeedKmh": 12
  }
}
```

Numeric metrics, timezone, and `isDay` are nullable.

## Normalisation

The backend requests `units: "us"` from GraySky and converts:

| US Unit | Metric Unit | Conversion |
|---|---|---|
| Fahrenheit | Celsius | `(F - 32) * 50 / 9 / 10` |
| Fractional rain chance | Percent | `value * 100` |
| inches/hour | mm/hour | `inches * 25400` |
| mph | km/h | `mph * 16.09344` |

## Caching

- Ten-minute coordinate cache with in-flight deduplication
- Maximum 500 locations with FIFO eviction
- 30-second negative cache on network errors
- 429/503 responses respect `Retry-After` (or ten minutes when unspecified)
- PWA uses network-only weather routes

## Validation

- Coordinates must be finite numbers: latitude `-90..90`, longitude `-180..180`
- Unknown, missing, or repeated parameters return `400 VALIDATION_ERROR`
- Strict query validation rejects unknown parameters

## Error Codes

| Code | Status | Meaning |
|---|---|---|
| `WEATHER_SERVICE_TIMEOUT` | 504 | GraySky request timed out |
| `WEATHER_SERVICE_UNAVAILABLE` | 502 | Provider outage or rate limit |
| `WEATHER_SERVICE_INVALID_RESPONSE` | 502 | Malformed provider response |
| `WEATHER_LOCATION_UNAVAILABLE` | 422 | Missing coordinates |
| `WEATHER_DATE_UNAVAILABLE` | 422 | Date outside forecast range |
| `WEATHER_FORECAST_NOT_FOUND` | 404 | No daily coverage for the date |

## Attribution

Both weather surfaces link "Weather data by GraySky".

## Key Files

| File | Purpose |
|---|---|
| `backend/src/services/weather.ts` | Full integration: API call, normalisation, caching, error handling |
| `backend/src/routes/weather.ts` | Current weather endpoint |
| `backend/src/controllers/weather.ts` | Controller wiring |
| `frontend/src/features/events/EventWeatherPanel.tsx` | Event-day forecast display |
| `frontend/src/features/dashboard/CoachConsole.tsx` | Console weather readout |

## AI declaration

This document was created with the assistance of opencode[mimo-v2.5-free].
