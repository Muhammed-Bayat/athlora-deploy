import type { CurrentWeather } from '../types';
import { request } from './client';

export async function getCurrentWeather(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<CurrentWeather> {
  const query = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) });
  const response = await request<{ data: CurrentWeather }>(
    `/api/v1/weather/current?${query.toString()}`,
    { signal },
  );
  return response.data;
}