import { ApiError } from '../middleware/errors.js';
import type { CurrentWeather, EventWeatherForecast } from '../types/domain.js';
import { getEvent } from './events.js';

const FORECAST_DAYS = 16;
const WEATHER_CODES = new Set([
  0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67,
  71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99,
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidResponse(): never {
  throw new ApiError(502, 'WEATHER_SERVICE_INVALID_RESPONSE', 'The weather service returned invalid data');
}

function dateEpoch(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}

function numericArray(value: unknown, length: number): Array<number | null> {
  if (!Array.isArray(value) || value.length !== length) invalidResponse();
  if (!value.every((item) =>
    item === null || (typeof item === 'number' && Number.isFinite(item)))) {
    invalidResponse();
  }
  return value as Array<number | null>;
}

export async function getEventWeatherForecast(
  workspaceId: string,
  eventId: unknown,
  fetcher: typeof fetch = fetch,
): Promise<EventWeatherForecast> {
  const event = await getEvent(workspaceId, eventId);
  if (event.latitude === null || event.longitude === null) {
    throw new ApiError(
      422,
      'WEATHER_LOCATION_UNAVAILABLE',
      'Add event coordinates to view a forecast',
    );
  }

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(event.latitude));
  url.searchParams.set('longitude', String(event.longitude));
  url.searchParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
  );
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', String(FORECAST_DAYS));
  url.searchParams.set('temperature_unit', 'celsius');
  url.searchParams.set('wind_speed_unit', 'kmh');

  let response: Response;
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(5_000) });
  } catch (error) {
    if (isTimeout(error)) {
      throw new ApiError(504, 'WEATHER_SERVICE_TIMEOUT', 'The weather service took too long to respond');
    }
    throw new ApiError(502, 'WEATHER_SERVICE_UNAVAILABLE', 'The weather service is temporarily unavailable');
  }
  if (!response.ok) {
    throw new ApiError(502, 'WEATHER_SERVICE_UNAVAILABLE', 'The weather service is temporarily unavailable');
  }

  let body: unknown;
  try {
    body = await response.json() as unknown;
  } catch (error) {
    if (isTimeout(error)) {
      throw new ApiError(504, 'WEATHER_SERVICE_TIMEOUT', 'The weather service took too long to respond');
    }
    invalidResponse();
  }
  if (!isRecord(body) || typeof body.timezone !== 'string' || !validTimezone(body.timezone) ||
      !isRecord(body.daily) || !isRecord(body.daily_units)) {
    invalidResponse();
  }
  const daily = body.daily;
  const units = body.daily_units;
  if (
    units.time !== 'iso8601' || units.weather_code !== 'wmo code' ||
    units.temperature_2m_max !== '°C' || units.temperature_2m_min !== '°C' ||
    units.precipitation_probability_max !== '%' || units.wind_speed_10m_max !== 'km/h' ||
    !Array.isArray(daily.time) || daily.time.length === 0 ||
    !daily.time.every((date) => typeof date === 'string' && dateEpoch(date) !== null)
  ) {
    invalidResponse();
  }
  const dates = daily.time as string[];
  if (dates.some((date, index) =>
    index > 0 && dateEpoch(date)! - dateEpoch(dates[index - 1])! !== 86_400_000)) {
    invalidResponse();
  }
  const length = daily.time.length;
  const weatherCodes = numericArray(daily.weather_code, length);
  const maximums = numericArray(daily.temperature_2m_max, length);
  const minimums = numericArray(daily.temperature_2m_min, length);
  const precipitation = numericArray(daily.precipitation_probability_max, length);
  const wind = numericArray(daily.wind_speed_10m_max, length);
  if (
    weatherCodes.some((code) => code !== null && (!Number.isInteger(code) || !WEATHER_CODES.has(code))) ||
    precipitation.some((chance) => chance !== null && (chance < 0 || chance > 100)) ||
    wind.some((speed) => speed !== null && speed < 0) ||
    minimums.some((minimum, day) =>
      minimum !== null && maximums[day] !== null && minimum > maximums[day]!)
  ) {
    invalidResponse();
  }
  const index = dates.indexOf(event.date);
  if (index < 0) {
    const dateFrom = dates[0];
    const dateTo = dates.at(-1)!;
    if (event.date < dateFrom || event.date > dateTo) {
      throw new ApiError(
        422,
        'WEATHER_DATE_UNAVAILABLE',
        'Forecasts are available for events in the next 16 days',
        { dateFrom, dateTo },
      );
    }
    throw new ApiError(404, 'WEATHER_FORECAST_NOT_FOUND', 'No forecast is available for this event');
  }
  const weatherCode = weatherCodes[index];
  const temperatureMaxC = maximums[index];
  const temperatureMinC = minimums[index];
  const precipitationProbability = precipitation[index];
  const windSpeed = wind[index];
  if (weatherCode === null || temperatureMaxC === null || temperatureMinC === null) {
    throw new ApiError(404, 'WEATHER_FORECAST_NOT_FOUND', 'No forecast is available for this event');
  }
  if (
    !Number.isInteger(weatherCode) || !WEATHER_CODES.has(weatherCode) ||
    temperatureMinC > temperatureMaxC
  ) {
    invalidResponse();
  }

  return {
    date: event.date,
    timezone: body.timezone,
    weatherCode,
    temperatureMinC,
    temperatureMaxC,
    precipitationProbabilityMaxPercent: precipitationProbability,
    windSpeedMaxKmh: windSpeed,
  };
}

function finiteMetric(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalidResponse();
  return value;
}

function finiteMetricRange(value: unknown, minimum: number, maximum: number): number {
  const metric = finiteMetric(value);
  if (metric < minimum || metric > maximum) invalidResponse();
  return metric;
}

export async function getCurrentWeather(
  latitude: unknown,
  longitude: unknown,
  fetcher: typeof fetch = fetch,
): Promise<CurrentWeather> {
  if (
    typeof latitude !== 'number' || !Number.isFinite(latitude) ||
    typeof longitude !== 'number' || !Number.isFinite(longitude) ||
    latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
  ) {
    throw new ApiError(
      422,
      'WEATHER_COORDINATES_INVALID',
      'Latitude must be from -90 to 90 and longitude from -180 to 180',
    );
  }

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
  );
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '1');
  url.searchParams.set('temperature_unit', 'celsius');
  url.searchParams.set('wind_speed_unit', 'kmh');

  let response: Response;
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(5_000) });
  } catch (error) {
    if (isTimeout(error)) {
      throw new ApiError(504, 'WEATHER_SERVICE_TIMEOUT', 'The weather service took too long to respond');
    }
    throw new ApiError(502, 'WEATHER_SERVICE_UNAVAILABLE', 'The weather service is temporarily unavailable');
  }
  if (!response.ok) {
    throw new ApiError(502, 'WEATHER_SERVICE_UNAVAILABLE', 'The weather service is temporarily unavailable');
  }

  let body: unknown;
  try {
    body = await response.json() as unknown;
  } catch (error) {
    if (isTimeout(error)) {
      throw new ApiError(504, 'WEATHER_SERVICE_TIMEOUT', 'The weather service took too long to respond');
    }
    invalidResponse();
  }
  if (!isRecord(body) || typeof body.timezone !== 'string' || !validTimezone(body.timezone) ||
      !isRecord(body.current_units) || !isRecord(body.current)) {
    invalidResponse();
  }
  const units = body.current_units;
  if (
    units.time !== 'iso8601' || units.interval !== 'seconds' ||
    units.temperature_2m !== '°C' || units.relative_humidity_2m !== '%' ||
    units.apparent_temperature !== '°C' || units.is_day !== '' ||
    units.precipitation !== 'mm' || units.weather_code !== 'wmo code' ||
    units.wind_speed_10m !== 'km/h'
  ) {
    invalidResponse();
  }
  const current = body.current;
  if (typeof current.time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(current.time)) {
    invalidResponse();
  }
  const weatherCode = finiteMetric(current.weather_code);
  if (!Number.isInteger(weatherCode) || !WEATHER_CODES.has(weatherCode)) invalidResponse();
  const isDay = current.is_day;
  if (isDay !== 0 && isDay !== 1) invalidResponse();

  return {
    timezone: body.timezone,
    temperatureC: finiteMetric(current.temperature_2m),
    apparentTemperatureC: finiteMetric(current.apparent_temperature),
    humidityPercent: finiteMetricRange(current.relative_humidity_2m, 0, 100),
    isDay: isDay === 1,
    precipitationMm: finiteMetricRange(current.precipitation, 0, 500),
    weatherCode,
    windSpeedKmh: finiteMetricRange(current.wind_speed_10m, 0, 600),
  };
}
