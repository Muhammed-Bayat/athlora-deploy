import type { Result, ApiList } from '../types';
import { list, update } from './client';

export async function listResults(eventId: string): Promise<ApiList<Result>> {
  return list<Result>(`events/${eventId}/results`);
}

export async function overrideResult(
  eventId: string,
  athleteId: string,
  payload: unknown,
): Promise<Result> {
  return update<Result>(`events/${eventId}/results`, athleteId, payload);
}
