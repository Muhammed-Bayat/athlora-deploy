import { list, request } from './client';
import type { ApiList, EventReminder } from '../types';

export async function listEventReminders(): Promise<ApiList<EventReminder>> {
  return list<EventReminder>('reminders');
}

export async function getUnreadEventReminderCount(): Promise<number> {
  const result = await request<{ data: { count: number } }>('/api/v1/reminders/unread-count');
  return result.data.count;
}

export async function markEventReminderRead(reminderId: string): Promise<void> {
  await request<void>(`/api/v1/reminders/${reminderId}/read`, { method: 'POST' });
}
