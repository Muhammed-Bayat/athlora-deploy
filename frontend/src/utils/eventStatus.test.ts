import { describe, expect, it } from 'vitest';
import {
  EVENT_OVERDUE_GRACE_MS,
  eventDisplayStatus,
  isEventOverdue,
  isLiveListable,
} from './eventStatus';

function scheduled(overrides: { date?: string; time?: string | null; status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' } = {}) {
  return {
    date: overrides.date ?? '2026-08-20',
    time: overrides.time === undefined ? '10:00:00' : overrides.time,
    status: overrides.status ?? 'scheduled' as const,
  };
}

describe('eventStatus', () => {
  it('exposes a one-hour grace period', () => {
    expect(EVENT_OVERDUE_GRACE_MS).toBe(60 * 60 * 1000);
  });

  describe('timed events', () => {
    it('stays scheduled before the start time', () => {
      expect(isEventOverdue(scheduled(), 'UTC', new Date('2026-08-20T09:00:00Z'))).toBe(false);
      expect(eventDisplayStatus(scheduled(), 'UTC', new Date('2026-08-20T10:59:59Z'))).toBe('scheduled');
    });

    it('turns overdue exactly one hour after the start time', () => {
      expect(eventDisplayStatus(scheduled(), 'UTC', new Date('2026-08-20T11:00:00Z'))).toBe('overdue');
      expect(isEventOverdue(scheduled(), 'UTC', new Date('2026-08-21T00:00:00Z'))).toBe(true);
    });

    it('holds its grace across midnight', () => {
      const lateNight = scheduled({ date: '2026-08-20', time: '23:30:00' });
      expect(eventDisplayStatus(lateNight, 'UTC', new Date('2026-08-21T00:29:59Z'))).toBe('scheduled');
      expect(eventDisplayStatus(lateNight, 'UTC', new Date('2026-08-21T00:30:00Z'))).toBe('overdue');
    });

    it('compares against the workspace wall clock', () => {
      const joburg = scheduled({ time: '09:00:00' });
      expect(eventDisplayStatus(joburg, 'Africa/Johannesburg', new Date('2026-08-20T07:59:00Z'))).toBe('scheduled');
      expect(eventDisplayStatus(joburg, 'Africa/Johannesburg', new Date('2026-08-20T08:00:00Z'))).toBe('overdue');
      expect(eventDisplayStatus(joburg, 'UTC', new Date('2026-08-20T08:00:00Z'))).toBe('scheduled');
    });
  });

  describe('untimed events', () => {
    const untimed = () => scheduled({ time: null });

    it('stays scheduled through the end of its local date', () => {
      expect(eventDisplayStatus(untimed(), 'UTC', new Date('2026-08-20T23:59:59Z'))).toBe('scheduled');
      expect(eventDisplayStatus(untimed(), 'UTC', new Date('2026-08-21T00:00:00Z'))).toBe('overdue');
    });

    it('rolls over at local midnight in the workspace timezone', () => {
      expect(eventDisplayStatus(untimed(), 'Pacific/Auckland', new Date('2026-08-20T11:59:00Z'))).toBe('scheduled');
      expect(eventDisplayStatus(untimed(), 'Pacific/Auckland', new Date('2026-08-20T12:00:00Z'))).toBe('overdue');
      expect(eventDisplayStatus(untimed(), 'UTC', new Date('2026-08-20T12:00:00Z'))).toBe('scheduled');
    });
  });

  it('never marks non-scheduled statuses overdue', () => {
    const past = { date: '2026-08-10', time: '09:00:00' };
    expect(eventDisplayStatus({ ...past, status: 'in_progress' }, 'UTC', new Date('2026-08-20T12:00:00Z'))).toBe('in_progress');
    expect(eventDisplayStatus({ ...past, status: 'completed' }, 'UTC', new Date('2026-08-20T12:00:00Z'))).toBe('completed');
    expect(eventDisplayStatus({ ...past, status: 'cancelled' }, 'UTC', new Date('2026-08-20T12:00:00Z'))).toBe('cancelled');
  });

  it('falls back to UTC for an unusable timezone', () => {
    expect(() => eventDisplayStatus(scheduled(), 'Not/AZone', new Date('2026-08-20T11:00:00Z'))).not.toThrow();
    expect(eventDisplayStatus(scheduled(), 'Not/AZone', new Date('2026-08-20T11:00:00Z'))).toBe('overdue');
    expect(eventDisplayStatus(scheduled(), '', new Date('2026-08-20T11:00:00Z'))).toBe('overdue');
  });

  it('keeps events scheduled until an unparsable start time passes its date', () => {
    const broken = scheduled({ time: 'not-a-time' });
    expect(eventDisplayStatus(broken, 'UTC', new Date('2026-08-20T23:00:00Z'))).toBe('scheduled');
    expect(eventDisplayStatus(broken, 'UTC', new Date('2026-08-21T00:00:00Z'))).toBe('overdue');
  });

  describe('isLiveListable', () => {
    const now = new Date('2026-08-20T11:30:00Z');

    it('lists upcoming and grace-period scheduled events', () => {
      expect(isLiveListable(scheduled({ date: '2026-08-21' }), 'UTC', now)).toBe(true);
      expect(isLiveListable(scheduled({ time: '11:00:00' }), 'UTC', now)).toBe(true);
    });

    it('hides scheduled events once overdue', () => {
      expect(isLiveListable(scheduled({ time: '10:00:00' }), 'UTC', now)).toBe(false);
      expect(isLiveListable(scheduled({ date: '2026-08-19', time: null }), 'UTC', now)).toBe(false);
    });

    it('always lists in-progress events, even from a previous day', () => {
      expect(isLiveListable(scheduled({ date: '2026-08-18', status: 'in_progress' }), 'UTC', now)).toBe(true);
    });

    it('hides completed and cancelled events', () => {
      expect(isLiveListable(scheduled({ status: 'completed' }), 'UTC', now)).toBe(false);
      expect(isLiveListable(scheduled({ status: 'cancelled' }), 'UTC', now)).toBe(false);
    });
  });
});
