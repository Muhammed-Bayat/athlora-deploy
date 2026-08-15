import type { AthleteStatistics, RosterSnapshotEntry, ApiList } from '../types';
import { list, get } from './client';

export async function listAthleteStatistics(athleteId: string): Promise<ApiList<AthleteStatistics>> {
  return list<AthleteStatistics>(`athletes/${athleteId}/statistics`);
}

export async function getAthleteStatistics(
  athleteId: string,
  discipline: string,
): Promise<AthleteStatistics> {
  return get<AthleteStatistics>(`athletes/${athleteId}/statistics`, discipline);
}

export async function listRosterSnapshot(): Promise<ApiList<RosterSnapshotEntry>> {
  return list<RosterSnapshotEntry>('roster/snapshot');
}
