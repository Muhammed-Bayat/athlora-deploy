import type { TimelineEntry, ApiList } from '../types';
import { list, create, update, remove } from './client';

export async function listTimelineEntries(eventId: string): Promise<ApiList<TimelineEntry>> {
  return list<TimelineEntry>(`events/${eventId}/entries`);
}

export async function createTimelineEntry(eventId: string, payload: unknown): Promise<TimelineEntry> {
  return create<TimelineEntry>(`events/${eventId}/entries`, payload);
}

export async function updateTimelineEntry(
  eventId: string,
  entryId: string,
  payload: unknown,
): Promise<TimelineEntry> {
  return update<TimelineEntry>(`events/${eventId}/entries`, entryId, payload);
}

export async function deleteTimelineEntry(eventId: string, entryId: string): Promise<void> {
  return remove(`events/${eventId}/entries`, entryId);
}
