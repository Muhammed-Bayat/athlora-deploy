import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearWeatherCache, getCurrentWeather, getEventWeatherForecast, normalizeGraySky } from './weather.js';
import { getEvent } from './events.js';

vi.mock('./events.js', () => ({ getEvent: vi.fn() }));
function fixture() {
  const unix = (value: string) => Date.parse(value) / 1000;
  return {
    units: 'us',
    forecast: {
      timezone: 'Africa/Johannesburg',
      currently: { time: unix('2026-09-13T12:00:00+02:00'), temperature: 76.64, apparentTemperature: 77.18,
        humidity: 0.62, precipIntensity: 0.059055118, windSpeed: 11.18468146, icon: 'partly-cloudy-day' },
      daily: { data: Array.from({ length: 10 }, (_, index) => ({ time: unix(`2026-09-${13 + index}T00:00:00+02:00`),
        temperatureLow: 53.6, temperatureHigh: 77, precipProbability: 0.35, windSpeed: 13.421617,
        icon: 'rain', sunriseTime: unix(`2026-09-${13 + index}T06:00:00+02:00`), sunsetTime: unix(`2026-09-${13 + index}T18:00:00+02:00`) })) },
    },
  };
}
const transport = (body: unknown = fixture()) => vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(body)));

beforeEach(() => {
  clearWeatherCache();
  vi.mocked(getEvent).mockResolvedValue({ latitude: -26.2041, longitude: 28.0473, date: '2026-09-22' } as Awaited<ReturnType<typeof getEvent>>);
});
afterEach(() => vi.useRealTimers());

describe('GraySky weather boundary', () => {
  it('requests the keyless GraySky forecast and normalizes its US units', async () => {
    const fetcher = transport();
    const current = await getCurrentWeather(-26.2041, 28.0473, fetcher);
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe('https://graysky.net/api/forecast?lat=-26.2041&lon=28.0473');
    expect(options?.headers).toEqual({ Accept: 'application/json' });
    expect(current).toMatchObject({ temperatureC: 24.8, apparentTemperatureC: 25.1, humidityPercent: 62,
      precipitationRateMmHr: 1.5, windSpeedKmh: 18, weatherCode: 'partly-cloudy-day', isDay: true });
    const day = await getEventWeatherForecast('workspace', 'event', fetcher);
    expect(day).toMatchObject({ date: '2026-09-22', temperatureMinC: 12, temperatureMaxC: 25,
      precipitationProbabilityMaxPercent: 35, windSpeedKmh: 21.6 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('deduplicates concurrent reads, caches ten minutes and isolates locations', async () => {
    vi.useFakeTimers();
    const fetcher = transport();
    await Promise.all([getCurrentWeather(1, 2, fetcher), getCurrentWeather(1, 2, fetcher)]);
    await getCurrentWeather(3, 4, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(599_999);
    await getCurrentWeather(1, 2, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    await getCurrentWeather(1, 2, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('preserves nulls and unknown conditions without inventing zero or daytime', () => {
    const result = normalizeGraySky({ units: 'us', forecast: { currently: { time: Date.parse('2026-09-13T12:00:00Z') / 1000, icon: 'future-condition' },
      daily: { data: [{ time: Date.parse('2026-09-13T00:00:00Z') / 1000, icon: 'limited', temperatureLow: null }] } } });
    expect(result.current).toMatchObject({ temperatureC: null, humidityPercent: null, windSpeedKmh: null, isDay: null });
    expect(result.daily[0]).toMatchObject({ weatherCode: 'limited', temperatureMinC: null, temperatureMaxC: null });
  });
  it('uses sunrise/sunset for day/night when condition has no suffix', () => {
    const body = fixture();
    body.forecast.currently.icon = 'rain';
    expect(normalizeGraySky(body).current?.isDay).toBe(true);
    body.forecast.currently.time = Date.parse('2026-09-13T23:00:00+02:00') / 1000;
    expect(normalizeGraySky(body).current?.isDay).toBe(false);
    body.forecast.currently.icon = 'clear-night';
    expect(normalizeGraySky(body).current?.isDay).toBe(false);
  });
  it('preserves the venue calendar date across UTC midnight', () => {
    const body = fixture();
    body.forecast.daily.data[0].time = Date.parse('2026-09-12T22:00:00Z') / 1000;
    expect(normalizeGraySky(body).daily[0].date).toBe('2026-09-13');
  });
  it.each([[91, 0], [0, 181], [NaN, 0], [0, Infinity], [null, 1]])('rejects invalid coordinates %s,%s before fetching', async (lat, lon) => {
    const fetcher = transport();
    await expect(getCurrentWeather(lat, lon, fetcher)).rejects.toMatchObject({ code: 'WEATHER_COORDINATES_INVALID' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('checks event ownership and missing coordinates before fetching, even with a cache', async () => {
    const fetcher = transport();
    await getCurrentWeather(-26.2041, 28.0473, fetcher);
    vi.mocked(getEvent).mockRejectedValueOnce(new Error('Not found'));
    await expect(getEventWeatherForecast('foreign', 'event', fetcher)).rejects.toThrow('Not found');
    vi.mocked(getEvent).mockResolvedValueOnce({ latitude: null, longitude: null } as Awaited<ReturnType<typeof getEvent>>);
    await expect(getEventWeatherForecast('workspace', 'event', fetcher)).rejects.toMatchObject({ code: 'WEATHER_LOCATION_UNAVAILABLE' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('reports the actual daily horizon and empty coverage', async () => {
    vi.mocked(getEvent).mockResolvedValueOnce({ latitude: 1, longitude: 2, date: '2026-09-23' } as Awaited<ReturnType<typeof getEvent>>);
    await expect(getEventWeatherForecast('workspace', 'event', transport())).rejects.toMatchObject({ code: 'WEATHER_DATE_UNAVAILABLE', details: { dateFrom: '2026-09-13', dateTo: '2026-09-22' } });
    await expect(getCurrentWeather(1, 2, transport({ units: 'us', forecast: { currently: null, daily: null } }))).rejects.toMatchObject({ code: 'WEATHER_FORECAST_NOT_FOUND' });
    await expect(getEventWeatherForecast('workspace', 'event', transport({ units: 'us', forecast: { currently: null, daily: { data: [] } } }))).rejects.toMatchObject({ code: 'WEATHER_FORECAST_NOT_FOUND' });
  });
  it.each([404, 429, 500, 503])('handles HTTP %s with safe errors and a short retry cache', async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('private provider error', { status }));
    for (let i = 0; i < 2; i++) await expect(getCurrentWeather(1, 2, fetcher)).rejects.toMatchObject({ code: 'WEATHER_SERVICE_UNAVAILABLE', message: 'Weather temporarily unavailable' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('recovers after an outage without caching it for ten minutes', async () => {
    vi.useFakeTimers();
    const fetcher = transport().mockRejectedValueOnce(new Error('network'));
    await expect(getCurrentWeather(1, 2, fetcher)).rejects.toMatchObject({ code: 'WEATHER_SERVICE_UNAVAILABLE' });
    vi.advanceTimersByTime(30_000);
    await expect(getCurrentWeather(1, 2, fetcher)).resolves.toMatchObject({ temperatureC: 24.8 });
  });
  it('respects the provider Retry-After cooldown for rate exhaustion', async () => {
    vi.useFakeTimers();
    const fetcher = transport().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '900' } }));
    await expect(getCurrentWeather(1, 2, fetcher)).rejects.toMatchObject({ code: 'WEATHER_SERVICE_UNAVAILABLE' });
    vi.advanceTimersByTime(899_999);
    await expect(getCurrentWeather(1, 2, fetcher)).rejects.toMatchObject({ code: 'WEATHER_SERVICE_UNAVAILABLE' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await expect(getCurrentWeather(1, 2, fetcher)).resolves.toMatchObject({ temperatureC: 24.8 });
  });
  it('handles timeouts and malformed JSON', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    await expect(getCurrentWeather(1, 2, fetcher)).rejects.toMatchObject({ code: 'WEATHER_SERVICE_TIMEOUT', status: 504 });
    await expect(getCurrentWeather(1, 2, vi.fn<typeof fetch>().mockResolvedValue(new Response('{')))).rejects.toMatchObject({ code: 'WEATHER_SERVICE_INVALID_RESPONSE' });
  });
  it.each([{}, { units: 'us', forecast: [] }, { units: 'us', forecast: { daily: { data: 'bad' } } },
    { units: 'us', forecast: { currently: { time: 'invalid' } } },
    { units: 'us', forecast: { currently: { time: -1 } } },
    { units: 'us', forecast: { currently: { time: 1, humidity: 1.01 } } },
    { units: 'us', forecast: { currently: { time: 1, windSpeed: -1 } } },
    { units: 'us', forecast: { daily: { data: [{ time: 1, temperatureLow: 86, temperatureHigh: 68 }] } } },
    { units: 'si', forecast: fixture().forecast },
  ])('rejects malformed provider data %j', (body) => {
    expect(() => normalizeGraySky(body)).toThrow('Weather temporarily unavailable');
  });
});
