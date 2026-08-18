import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AthleticsEvent } from '../types/domain.js';
import { getEvent } from './events.js';
import { getEventWeatherForecast } from './weather.js';

vi.mock('./events.js', () => ({ getEvent: vi.fn() }));

const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const dates = Array.from({ length: 16 }, (_, index) => {
  const date = new Date('2026-08-18T00:00:00.000Z');
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
});

function event(overrides: Partial<AthleticsEvent> = {}): AthleticsEvent {
  return {
    id: EVENT_ID,
    createdBy: USER_ID,
    type: 'competition',
    discipline: '100m',
    title: 'City Sprint Meet',
    date: '2026-09-01',
    time: '09:30:00',
    locationName: 'Central Stadium',
    latitude: -26.2041,
    longitude: 28.0473,
    status: 'scheduled',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

function forecastResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    timezone: 'Africa/Johannesburg',
    daily_units: {
      time: 'iso8601',
      weather_code: 'wmo code',
      temperature_2m_max: '°C',
      temperature_2m_min: '°C',
      precipitation_probability_max: '%',
      wind_speed_10m_max: 'km/h',
    },
    daily: {
      time: dates,
      weather_code: dates.map(() => 2),
      temperature_2m_max: dates.map(() => 24.8),
      temperature_2m_min: dates.map(() => 13.4),
      precipitation_probability_max: dates.map(() => 20),
      wind_speed_10m_max: dates.map(() => 18.1),
    },
    ...overrides,
  }));
}

beforeEach(() => {
  vi.mocked(getEvent).mockResolvedValue(event());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Open-Meteo event forecast', () => {
  it('requests one local daily forecast and maps provider data to the API contract', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(forecastResponse());

    await expect(getEventWeatherForecast(USER_ID, EVENT_ID, fetcher)).resolves.toEqual({
      date: '2026-09-01',
      timezone: 'Africa/Johannesburg',
      weatherCode: 2,
      temperatureMinC: 13.4,
      temperatureMaxC: 24.8,
      precipitationProbabilityMaxPercent: 20,
      windSpeedMaxKmh: 18.1,
    });

    expect(getEvent).toHaveBeenCalledWith(USER_ID, EVENT_ID);
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      latitude: '-26.2041',
      longitude: '28.0473',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
      timezone: 'auto',
      forecast_days: '16',
      temperature_unit: 'celsius',
      wind_speed_unit: 'kmh',
    });
    expect(fetcher.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('accepts zero coordinates and nullable optional daily metrics', async () => {
    vi.mocked(getEvent).mockResolvedValue(event({ latitude: 0, longitude: 0 }));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(forecastResponse({
      daily: {
        time: dates,
        weather_code: dates.map(() => 0),
        temperature_2m_max: dates.map(() => 22),
        temperature_2m_min: dates.map(() => 10),
        precipitation_probability_max: dates.map(() => null),
        wind_speed_10m_max: dates.map(() => null),
      },
    }));

    const result = await getEventWeatherForecast(USER_ID, EVENT_ID, fetcher);
    expect(result.precipitationProbabilityMaxPercent).toBeNull();
    expect(result.windSpeedMaxKmh).toBeNull();
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('latitude=0&longitude=0');
  });

  it('rejects incomplete coordinates before contacting Open-Meteo', async () => {
    vi.mocked(getEvent).mockResolvedValue(event({ longitude: null }));
    const fetcher = vi.fn<typeof fetch>();

    await expect(getEventWeatherForecast(USER_ID, EVENT_ID, fetcher)).rejects.toMatchObject({
      status: 422,
      code: 'WEATHER_LOCATION_UNAVAILABLE',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['2026-08-17', '2026-09-03'])('rejects provider-local unsupported forecast date %s', async (date) => {
    vi.mocked(getEvent).mockResolvedValue(event({ date }));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(forecastResponse());

    await expect(getEventWeatherForecast(USER_ID, EVENT_ID, fetcher)).rejects.toMatchObject({
      status: 422,
      code: 'WEATHER_DATE_UNAVAILABLE',
      details: { dateFrom: '2026-08-18', dateTo: '2026-09-02' },
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('distinguishes legitimate no-data from an invalid response', async () => {
    vi.mocked(getEvent).mockResolvedValue(event({ date: '2026-09-02' }));
    const incompleteDay = vi.fn<typeof fetch>().mockResolvedValue(forecastResponse({
      daily: {
        time: dates,
        weather_code: dates.map((_, index) => index === 15 ? null : 2),
        temperature_2m_max: dates.map((_, index) => index === 15 ? null : 24),
        temperature_2m_min: dates.map((_, index) => index === 15 ? null : 12),
        precipitation_probability_max: dates.map(() => 10),
        wind_speed_10m_max: dates.map(() => 15),
      },
    }));
    await expect(getEventWeatherForecast(USER_ID, EVENT_ID, incompleteDay)).rejects.toMatchObject({
      status: 404,
      code: 'WEATHER_FORECAST_NOT_FOUND',
    });

    const invalid = vi.fn<typeof fetch>().mockResolvedValue(new Response('{invalid'));
    await expect(getEventWeatherForecast(USER_ID, EVENT_ID, invalid)).rejects.toMatchObject({
      status: 502,
      code: 'WEATHER_SERVICE_INVALID_RESPONSE',
    });
  });

  it('maps upstream failures and timeouts without exposing provider details', async () => {
    const unavailable = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('provider secret detail', { status: 503 }),
    );
    await expect(getEventWeatherForecast(USER_ID, EVENT_ID, unavailable)).rejects.toMatchObject({
      status: 502,
      code: 'WEATHER_SERVICE_UNAVAILABLE',
      message: 'The weather service is temporarily unavailable',
    });

    const timeout = new Error('provider timeout detail');
    timeout.name = 'TimeoutError';
    await expect(
      getEventWeatherForecast(USER_ID, EVENT_ID, vi.fn<typeof fetch>().mockRejectedValue(timeout)),
    ).rejects.toMatchObject({ status: 504, code: 'WEATHER_SERVICE_TIMEOUT' });

    const delayedBody = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockRejectedValue(timeout),
    } as unknown as Response);
    await expect(getEventWeatherForecast(USER_ID, EVENT_ID, delayedBody)).rejects.toMatchObject({
      status: 504,
      code: 'WEATHER_SERVICE_TIMEOUT',
    });
  });

  it('rejects valid JSON with a malformed shape, units, or metric range', async () => {
    const nullBody = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('null', { headers: { 'Content-Type': 'application/json' } }),
    );
    await expect(getEventWeatherForecast(USER_ID, EVENT_ID, nullBody)).rejects.toMatchObject({
      status: 502,
      code: 'WEATHER_SERVICE_INVALID_RESPONSE',
    });

    const wrongUnits = vi.fn<typeof fetch>().mockResolvedValue(forecastResponse({
      daily_units: {
        time: 'iso8601', weather_code: 'wmo code', temperature_2m_max: '°F',
        temperature_2m_min: '°F', precipitation_probability_max: '%', wind_speed_10m_max: 'km/h',
      },
    }));
    await expect(getEventWeatherForecast(USER_ID, EVENT_ID, wrongUnits)).rejects.toMatchObject({
      code: 'WEATHER_SERVICE_INVALID_RESPONSE',
    });

    const invalidTimezone = vi.fn<typeof fetch>().mockResolvedValue(forecastResponse({
      timezone: 'Not/A_Timezone',
    }));
    await expect(getEventWeatherForecast(USER_ID, EVENT_ID, invalidTimezone)).rejects.toMatchObject({
      code: 'WEATHER_SERVICE_INVALID_RESPONSE',
    });

    const invalidRain = vi.fn<typeof fetch>().mockResolvedValue(forecastResponse({
      daily: {
        time: dates,
        weather_code: dates.map(() => 2),
        temperature_2m_max: dates.map(() => 24),
        temperature_2m_min: dates.map(() => 12),
        precipitation_probability_max: dates.map(() => 120),
        wind_speed_10m_max: dates.map(() => 15),
      },
    }));
    await expect(getEventWeatherForecast(USER_ID, EVENT_ID, invalidRain)).rejects.toMatchObject({
      code: 'WEATHER_SERVICE_INVALID_RESPONSE',
    });
  });
});
