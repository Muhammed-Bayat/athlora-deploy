import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import { type EventRow } from '../db/row-mappers.js';
import { withTransaction } from '../db/transaction.js';
import type { AthleticsEvent } from '../types/domain.js';
import { recomputeEventResults } from './timeline.js';
import {
  assertEventLoggingOpen,
  assertValidTransition,
  cancelEvent,
  createEvent,
  getEvent,
  listEvents,
  replaceEvent,
} from './events.js';

vi.mock('../db/client.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../db/transaction.js', () => ({
  withTransaction: vi.fn(),
}));

vi.mock('./timeline.js', () => ({
  recomputeEventResults: vi.fn(),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const query = vi.fn();

const genericNotFound = {
  status: 404,
  code: 'NOT_FOUND',
  message: 'Resource not found',
  details: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as unknown as ReturnType<typeof getPool>);
  vi.mocked(withTransaction).mockImplementation(async (operation) =>
    operation({ query } as never),
  );
});

function eventRow(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: EVENT_ID,
    created_by: USER_ID,
    type: 'competition',
    discipline: '100m',
    title: 'City Sprint Meet',
    date: '2026-09-01',
    time: null,
    location_name: null,
    latitude: null,
    longitude: null,
    status: 'scheduled',
    created_at: new Date('2026-08-14T10:00:00.000Z'),
    updated_at: new Date('2026-08-14T10:00:00.000Z'),
    ...overrides,
  };
}

function eventBody(overrides: Partial<AthleticsEvent> = {}): AthleticsEvent {
  return {
    id: EVENT_ID,
    createdBy: USER_ID,
    type: 'competition',
    discipline: '100m',
    title: 'City Sprint Meet',
    date: '2026-09-01',
    time: null,
    locationName: null,
    latitude: null,
    longitude: null,
    status: 'scheduled',
    createdAt: '2026-08-14T10:00:00.000Z',
    updatedAt: '2026-08-14T10:00:00.000Z',
    ...overrides,
  };
}

describe('assertValidTransition', () => {
  it('permits forward transitions and no-ops', () => {
    expect(() => assertValidTransition('scheduled', 'in_progress')).not.toThrow();
    expect(() => assertValidTransition('in_progress', 'completed')).not.toThrow();
    expect(() => assertValidTransition('completed', 'cancelled')).not.toThrow();
    expect(() => assertValidTransition('scheduled', 'scheduled')).not.toThrow();
  });

  it('rejects terminal and backward transitions with from/to details', () => {
    for (const [from, to] of [
      ['cancelled', 'scheduled'],
      ['cancelled', 'in_progress'],
      ['cancelled', 'completed'],
      ['in_progress', 'scheduled'],
      ['completed', 'in_progress'],
      ['completed', 'scheduled'],
    ] as const) {
      expect(() => assertValidTransition(from, to)).toThrowError(
        expect.objectContaining({
          status: 409,
          code: 'INVALID_EVENT_TRANSITION',
          details: { from, to },
        }),
      );
    }
  });
});

describe('listEvents', () => {
  it('scopes to the coach and applies optional filters with stable ordering', async () => {
    query.mockResolvedValue({ rows: [eventRow({ status: 'completed' })] });

    const events = await listEvents(USER_ID, { type: 'competition', status: 'completed' });

    expect(events).toEqual([eventBody({ status: 'completed' })]);
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('workspace_id = $1');
    expect(sql).toContain('type = $2');
    expect(sql).toContain('status = $3');
    expect(sql).toMatch(/ORDER BY date ASC, time ASC NULLS LAST, created_at ASC, id ASC/);
    expect(parameters).toEqual([USER_ID, 'competition', 'completed']);
  });

  it('filters by the inclusive date range', async () => {
    query.mockResolvedValue({ rows: [] });

    await listEvents(USER_ID, { dateFrom: '2026-08-01', dateTo: '2026-08-31' });

    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('date >= $2');
    expect(sql).toContain('date <= $3');
    expect(parameters).toEqual([USER_ID, '2026-08-01', '2026-08-31']);
  });

  it('rejects a malformed coach id without querying', async () => {
    await expect(listEvents('not-a-uuid', {})).rejects.toMatchObject(genericNotFound);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('getEvent', () => {
  it('returns the owned event', async () => {
    query.mockResolvedValue({ rows: [eventRow()] });

    await expect(getEvent(USER_ID, EVENT_ID)).resolves.toEqual(eventBody());
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1 AND workspace_id = $2'),
      [EVENT_ID, USER_ID],
    );
  });

  it('returns the generic not-found error when no owned row exists', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(getEvent(USER_ID, EVENT_ID)).rejects.toMatchObject(genericNotFound);
  });

  it('returns the same error for a malformed id without querying', async () => {
    await expect(getEvent(USER_ID, 'not-a-uuid')).rejects.toMatchObject(genericNotFound);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('createEvent', () => {
  it('inserts with the server-derived owner and fixed 100m discipline', async () => {
    query.mockResolvedValue({ rows: [eventRow()] });

    const event = await createEvent(USER_ID, {
      type: 'competition',
      discipline: '100m',
      title: 'City Sprint Meet',
      date: '2026-09-01',
      time: null,
      locationName: null,
      latitude: null,
      longitude: null,
      status: 'scheduled',
    });

    expect(event).toEqual(eventBody());
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO events');
    expect(parameters).toEqual([
      USER_ID, USER_ID,
      'competition',
      '100m',
      'City Sprint Meet',
      '2026-09-01',
      null,
      null,
      null,
      null,
      'scheduled',
    ]);
  });
});

describe('replaceEvent', () => {
  it('locks the row, validates the transition, and replaces the mutable fields', async () => {
    query
      .mockResolvedValueOnce({ rows: [eventRow()] })
      .mockResolvedValueOnce({ rows: [eventRow({ status: 'in_progress', title: 'Renamed' })] });

    const event = await replaceEvent(USER_ID, EVENT_ID, {
      type: 'competition',
      discipline: '100m',
      title: 'Renamed',
      date: '2026-09-01',
      time: null,
      locationName: null,
      latitude: null,
      longitude: null,
      status: 'in_progress',
    });

    expect(event).toEqual(eventBody({ status: 'in_progress', title: 'Renamed' }));
    const [lockSql, lockParameters] = query.mock.calls[0] as [string, unknown[]];
    expect(lockSql).toContain('FOR UPDATE');
    expect(lockParameters).toEqual([EVENT_ID, USER_ID]);
    const [updateSql, updateParameters] = query.mock.calls[1] as [string, unknown[]];
    expect(updateSql).toContain('UPDATE events');
    expect(updateParameters[8]).toBe('in_progress');
    expect(recomputeEventResults).toHaveBeenCalledWith(expect.anything(), EVENT_ID, 'competition');
  });

  it('rejects an invalid transition before writing', async () => {
    query.mockResolvedValueOnce({ rows: [eventRow({ status: 'cancelled' })] });

    await expect(
      replaceEvent(USER_ID, EVENT_ID, {
        type: 'competition',
        discipline: '100m',
        title: 'City Sprint Meet',
        date: '2026-09-01',
        time: null,
        locationName: null,
        latitude: null,
        longitude: null,
        status: 'scheduled',
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'INVALID_EVENT_TRANSITION',
      details: { from: 'cancelled', to: 'scheduled' },
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it('returns the generic not-found error when no owned row exists', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(
      replaceEvent(USER_ID, EVENT_ID, {
        type: 'competition',
        discipline: '100m',
        title: 'City Sprint Meet',
        date: '2026-09-01',
        time: null,
        locationName: null,
        latitude: null,
        longitude: null,
        status: 'scheduled',
      }),
    ).rejects.toMatchObject(genericNotFound);
  });
});

describe('cancelEvent', () => {
  it('cancels an owned event with an update, never a delete', async () => {
    query
      .mockResolvedValueOnce({ rows: [eventRow({ status: 'in_progress' })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [eventRow({ status: 'cancelled' })] });

    const event = await cancelEvent(USER_ID, EVENT_ID);

    expect(event.status).toBe('cancelled');
    const [lockSql] = query.mock.calls[0] as [string, unknown[]];
    expect(lockSql).toContain('FOR UPDATE');
    const [sql, parameters] = query.mock.calls[2] as [string, unknown[]];
    expect(sql).toContain("status = 'cancelled'");
    expect(sql).not.toContain('DELETE FROM');
    expect(parameters).toEqual([EVENT_ID, USER_ID]);
    expect(recomputeEventResults).toHaveBeenCalledWith(expect.anything(), EVENT_ID, 'competition');
  });

  it('rejects a non-host workspace when active guest teams exist', async () => {
    query
      .mockResolvedValueOnce({ rows: [eventRow({ status: 'in_progress' })] })
      .mockResolvedValueOnce({ rows: [{ workspace_id: '99999999-9999-9999-8999-999999999999' }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(cancelEvent(USER_ID, EVENT_ID)).rejects.toMatchObject({
      code: 'FIXTURE_HOST_ONLY',
    });
    expect(recomputeEventResults).not.toHaveBeenCalled();
  });

  it('allows the host workspace to cancel when active guest teams exist', async () => {
    query
      .mockResolvedValueOnce({ rows: [eventRow({ status: 'in_progress' })] })
      .mockResolvedValueOnce({ rows: [{ workspace_id: USER_ID }] })
      .mockResolvedValueOnce({ rows: [{ '1': 1 }] })
      .mockResolvedValueOnce({ rows: [eventRow({ status: 'cancelled' })] });

    const event = await cancelEvent(USER_ID, EVENT_ID);

    expect(event.status).toBe('cancelled');
    const [lockSql] = query.mock.calls[0] as [string, unknown[]];
    expect(lockSql).toContain('FOR UPDATE');
    const hasGuestsSql = query.mock.calls[1][0] as string;
    expect(hasGuestsSql).toContain('role');
    const hostCheckSql = query.mock.calls[2][0] as string;
    expect(hostCheckSql).toContain('role');
    expect(hostCheckSql).toContain("'host'");
    expect(recomputeEventResults).toHaveBeenCalled();
  });

  it('returns the generic not-found error when no owned row exists', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(cancelEvent(USER_ID, EVENT_ID)).rejects.toMatchObject(genericNotFound);
  });
});

describe('assertEventLoggingOpen', () => {
  it('passes for an in-progress event', async () => {
    query.mockResolvedValue({ rows: [eventRow({ status: 'in_progress' })] });

    await expect(assertEventLoggingOpen(USER_ID, EVENT_ID)).resolves.toBeUndefined();
  });

  it('rejects any non-in-progress status with the status detail', async () => {
    for (const status of ['scheduled', 'completed', 'cancelled'] as const) {
      query.mockResolvedValue({ rows: [eventRow({ status })] });
      await expect(assertEventLoggingOpen(USER_ID, EVENT_ID)).rejects.toMatchObject({
        status: 409,
        code: 'EVENT_NOT_IN_PROGRESS',
        details: { status },
      });
    }
  });

  it('returns the generic not-found error for an unknown event', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(assertEventLoggingOpen(USER_ID, EVENT_ID)).rejects.toMatchObject(genericNotFound);
  });
});
