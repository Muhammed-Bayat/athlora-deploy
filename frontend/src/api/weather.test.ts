import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CurrentWeather } from '../types';
import { getCurrentWeather } from './weather';

const weather: CurrentWeather = {
  timezone: 'Africa/Johannesburg',
  temperatureC: 24.8,
  apparentTemperatureC: 25.1,
  humidityPercent: 62,
  isDay: true,
  precipitationMm: 0,
  weatherCode: 2,
  windSpeedKmh: 12.4,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('current weather API', () => {
  it('requests current conditions for the given coordinates', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: weather })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getCurrentWeather(-26.2041, 28.0473)).resolves.toEqual(weather);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/weather/current?latitude=-26.2041&longitude=28.0473`,
    );
  });

  it('forwards the abort signal', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: weather })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await getCurrentWeather(0, 0, controller.signal);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});