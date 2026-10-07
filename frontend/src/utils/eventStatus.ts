import type { EventDisplayStatus, EventStatus } from '../types';

export const EVENT_OVERDUE_GRACE_MS = 60 * 60 * 1000;

export interface EventTiming {
  date: string;
  time: string | null;
  status: EventStatus;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function wallClockFormatter(timeZone: string): Intl.DateTimeFormat {
  const zone = timeZone || 'UTC';
  const cached = formatterCache.get(zone);
  if (cached) return cached;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  }
  formatterCache.set(zone, formatter);
  return formatter;
}

function localWallClock(timeZone: string, now: Date): { dateKey: string; wallMs: number } {
  const parts = wallClockFormatter(timeZone).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  const dateKey = `${part('year')}-${part('month')}-${part('day')}`;
  const wallMs = Date.UTC(
    Number(part('year')),
    Number(part('month')) - 1,
    Number(part('day')),
    Number(part('hour')),
    Number(part('minute')),
    Number(part('second')),
  );
  return { dateKey, wallMs };
}

export function isEventOverdue(event: EventTiming, timeZone: string, now: Date = new Date()): boolean {
  if (event.status !== 'scheduled') return false;
  const { dateKey, wallMs } = localWallClock(timeZone, now);
  if (event.time === null || event.time === '') return dateKey > event.date;
  const startWallMs = Date.parse(`${event.date}T${event.time}Z`);
  if (Number.isNaN(startWallMs)) return dateKey > event.date;
  return wallMs >= startWallMs + EVENT_OVERDUE_GRACE_MS;
}

export function eventDisplayStatus(event: EventTiming, timeZone: string, now: Date = new Date()): EventDisplayStatus {
  return isEventOverdue(event, timeZone, now) ? 'overdue' : event.status;
}

export function isLiveListable(event: EventTiming, timeZone: string, now: Date = new Date()): boolean {
  const status = eventDisplayStatus(event, timeZone, now);
  return status === 'scheduled' || status === 'in_progress';
}
