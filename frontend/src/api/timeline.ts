import type {
  ApiList,
  TimelineEntry,
  TimelineEntryCreatePayload,
  TimelineEntryDeletePayload,
  TimelineEntryPatchPayload,
} from '../types';
import { create, list, request } from './client';

export async function listTimelineEntries(eventId: string): Promise<ApiList<TimelineEntry>> {
  return list<TimelineEntry>(`events/${eventId}/entries`);
}

export async function createTimelineEntry(
  eventId: string,
  payload: TimelineEntryCreatePayload,
): Promise<TimelineEntry> {
  return create<TimelineEntry>(`events/${eventId}/entries`, payload);
}

export async function updateTimelineEntry(
  eventId: string,
  entryId: string,
  payload: TimelineEntryPatchPayload,
): Promise<TimelineEntry> {
  const response = await request<{ data: TimelineEntry }>(`/api/v1/events/${eventId}/entries/${entryId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return response.data;
}

export async function deleteTimelineEntry(
  eventId: string,
  entryId: string,
  payload: TimelineEntryDeletePayload,
): Promise<void> {
  await request<void>(`/api/v1/events/${eventId}/entries/${entryId}`, {
    method: 'DELETE',
    body: JSON.stringify(payload),
  });
}
