import { ApiError } from '../middleware/errors.js';
import type { CurrentWeather, EventWeatherForecast } from '../types/domain.js';
import { getEvent } from './events.js';

interface Forecast {
  current: CurrentWeather | null;
  daily: EventWeatherForecast[];
}

const CACHE_MS = 10 * 60_000;
const MAX_LOCATIONS = 500;
// Separate injected transports make tests independent without bypassing the cache.
let caches = new WeakMap<typeof fetch, Map<string, { expiresAt: number; promise: Promise<Forecast> }>>();
export function clearWeatherCache(): void { caches = new WeakMap(); }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function invalid(): never {
  throw new ApiError(502, 'WEATHER_SERVICE_INVALID_RESPONSE', 'Weather temporarily unavailable');
}
function metric(value: unknown, min = -Infinity, max = Infinity): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid();
  return value;
}
function condition(value: unknown): string {
  if (value === null || value === undefined) return 'limited';
  if (typeof value !== 'string' || !value.trim()) invalid();
  return value;
}
function timezone(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') invalid();
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); } catch { invalid(); }
  return value;
}
function unixTime(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalid();
  const milliseconds = value * 1000;
  if (!Number.isFinite(milliseconds) || Number.isNaN(new Date(milliseconds).valueOf())) invalid();
  return milliseconds;
}
function localDate(milliseconds: number, zone: string | null): string {
  if (!zone) return new Date(milliseconds).toISOString().slice(0, 10);
  const parts = new Intl.DateTimeFormat('en', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(milliseconds));
  return ['year', 'month', 'day'].map((key) => parts.find((part) => part.type === key)!.value).join('-');
}
function temperature(value: unknown): number | null {
  const fahrenheit = metric(value, -150, 160);
  return fahrenheit === null ? null : Math.round((fahrenheit - 32) * 50 / 9) / 10;
}
function percentage(value: unknown): number | null {
  const fraction = metric(value, 0, 1);
  return fraction === null ? null : Math.round(fraction * 1000) / 10;
}
function precipitationRate(value: unknown): number | null {
  const inchesPerHour = metric(value, 0, 100);
  return inchesPerHour === null ? null : Math.round(inchesPerHour * 25_400) / 1000;
}
function wind(value: unknown): number | null {
  const milesPerHour = metric(value, 0, 300);
  return milesPerHour === null ? null : Math.round(milesPerHour * 16.09344) / 10;
}

export function normalizeGraySky(body: unknown): Forecast {
  if (!record(body) || body.units !== 'us' || !record(body.forecast)) invalid();
  const forecast = body.forecast;
  if (!('currently' in forecast) && !('daily' in forecast)) invalid();
  const zone = timezone(forecast.timezone);
  const daily: EventWeatherForecast[] = [];
  let sourceDays: Record<string, unknown>[] | null = null;
  if (forecast.daily != null) {
    if (!record(forecast.daily) || !Array.isArray(forecast.daily.data) || forecast.daily.data.length > 10) invalid();
    sourceDays = forecast.daily.data;
    for (const day of sourceDays) {
      const date = localDate(unixTime(day.time), zone);
      const minimum = temperature(day.temperatureLow);
      const maximum = temperature(day.temperatureHigh);
      if (minimum !== null && maximum !== null && minimum > maximum) invalid();
      if (daily.some((item) => item.date === date)) invalid();
      daily.push({ date, timezone: zone, weatherCode: condition(day.icon),
        temperatureMinC: minimum, temperatureMaxC: maximum,
        precipitationProbabilityMaxPercent: percentage(day.precipProbability),
        windSpeedKmh: wind(day.windSpeed) });
    }
    daily.sort((a, b) => a.date.localeCompare(b.date));
  }
  let current: CurrentWeather | null = null;
  if (forecast.currently != null) {
    if (!record(forecast.currently)) invalid();
    const data = forecast.currently;
    const at = unixTime(data.time);
    const code = condition(data.icon);
    let isDay: boolean | null = code.endsWith('-day') ? true : code.endsWith('-night') ? false : null;
    if (isDay === null && sourceDays) {
      const day = sourceDays.find((item) => localDate(unixTime(item.time), zone) === localDate(at, zone));
      if (day?.sunriseTime != null && day.sunsetTime != null) {
        const sunrise = unixTime(day.sunriseTime);
        const sunset = unixTime(day.sunsetTime);
        isDay = at >= sunrise && at < sunset;
      }
    }
    current = { timezone: zone, weatherCode: code, isDay,
      temperatureC: temperature(data.temperature), apparentTemperatureC: temperature(data.apparentTemperature),
      humidityPercent: percentage(data.humidity),
      precipitationRateMmHr: precipitationRate(data.precipIntensity), windSpeedKmh: wind(data.windSpeed) };
  }
  return { current, daily };
}

async function load(latitude: unknown, longitude: unknown, fetcher: typeof fetch): Promise<Forecast> {
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    throw new ApiError(422, 'WEATHER_COORDINATES_INVALID', 'Valid location coordinates are required');
  }
  let cache = caches.get(fetcher);
  if (!cache) { cache = new Map(); caches.set(fetcher, cache); }
  const key = `${latitude},${longitude}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.promise;
  for (const [location, entry] of cache) if (entry.expiresAt <= now) cache.delete(location);
  if (cache.size >= MAX_LOCATIONS) cache.delete(cache.keys().next().value!);
  const entry = { expiresAt: now + CACHE_MS, promise: Promise.resolve({ current: null, daily: [] } as Forecast) };
  let failureCooldownMs = 30_000;
  entry.promise = (async () => {
    let response: Response;
    try {
      const url = new URL('https://graysky.net/api/forecast');
      url.searchParams.set('lat', String(latitude));
      url.searchParams.set('lon', String(longitude));
      response = await fetcher(url,
        { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5_000) });
    } catch (error) {
      throw new ApiError(error instanceof Error && error.name === 'TimeoutError' ? 504 : 502,
        error instanceof Error && error.name === 'TimeoutError' ? 'WEATHER_SERVICE_TIMEOUT' : 'WEATHER_SERVICE_UNAVAILABLE', 'Weather temporarily unavailable');
    }
    if (!response.ok) {
      if (response.status === 429 || response.status === 503) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000
          : retryAfter ? Date.parse(retryAfter) - Date.now() : NaN;
        failureCooldownMs = Number.isFinite(delay) ? Math.max(30_000, delay) : CACHE_MS;
      }
      throw new ApiError(502, 'WEATHER_SERVICE_UNAVAILABLE', 'Weather temporarily unavailable');
    }
    let body: unknown;
    try { body = await response.json(); } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') throw new ApiError(504, 'WEATHER_SERVICE_TIMEOUT', 'Weather temporarily unavailable');
      invalid();
    }
    const normalized = normalizeGraySky(body);
    entry.expiresAt = Date.now() + CACHE_MS;
    return normalized;
  })().catch((error: unknown) => {
    // A short negative cache prevents render/retry storms during an outage.
    entry.expiresAt = Date.now() + failureCooldownMs;
    throw error;
  });
  cache.set(key, entry);
  return entry.promise;
}

export async function getCurrentWeather(latitude: unknown, longitude: unknown, fetcher: typeof fetch = fetch): Promise<CurrentWeather> {
  const forecast = await load(latitude, longitude, fetcher);
  if (!forecast.current) throw new ApiError(404, 'WEATHER_FORECAST_NOT_FOUND', 'Weather temporarily unavailable');
  return forecast.current;
}

export async function getEventWeatherForecast(workspaceId: string, eventId: unknown, fetcher: typeof fetch = fetch): Promise<EventWeatherForecast> {
  const event = await getEvent(workspaceId, eventId);
  if (event.latitude === null || event.longitude === null) throw new ApiError(422, 'WEATHER_LOCATION_UNAVAILABLE', 'Add event coordinates to view a forecast');
  const forecast = await load(event.latitude, event.longitude, fetcher);
  const day = forecast.daily.find((item) => item.date === event.date);
  if (day) return day;
  if (!forecast.daily.length) throw new ApiError(404, 'WEATHER_FORECAST_NOT_FOUND', 'No forecast is available for this event');
  throw new ApiError(422, 'WEATHER_DATE_UNAVAILABLE', 'Forecasts are available for up to the next 10 days',
    { dateFrom: forecast.daily[0].date, dateTo: forecast.daily.at(-1)!.date });
}
