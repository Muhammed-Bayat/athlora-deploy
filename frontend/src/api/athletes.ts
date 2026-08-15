import type { Athlete, ApiList } from '../types';
import { list, get, create, update, remove } from './client';

export async function listAthletes(): Promise<ApiList<Athlete>> {
  return list<Athlete>('athletes');
}

export async function getAthlete(id: string): Promise<Athlete> {
  return get<Athlete>('athletes', id);
}

export async function createAthlete(payload: unknown): Promise<Athlete> {
  return create<Athlete>('athletes', payload);
}

export async function updateAthlete(id: string, payload: unknown): Promise<Athlete> {
  return update<Athlete>('athletes', id, payload);
}

export async function deleteAthlete(id: string): Promise<void> {
  return remove('athletes', id);
}
