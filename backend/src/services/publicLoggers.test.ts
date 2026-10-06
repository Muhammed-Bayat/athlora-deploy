import { describe, expect, it, vi } from 'vitest';
import type { DbExecutor } from '../db/client.js';
import type { TimelineEntryRow } from '../db/row-mappers.js';
import type { TimelineEntryCreatePayload } from '../validation/payloads.js';
import { createPublicLoggerEntry, createPublicLoggerLink, publicLoggerSnapshot } from './publicLoggers.js';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const ENTRY_ID = '55555555-5555-4555-8555-555555555555';
const ATHLETE_ID = '44444444-4444-4444-8444-444444444444';

const entryPayload: TimelineEntryCreatePayload = {
  athleteId: ATHLETE_ID,
  discipline: '100m',
  entryType: 'attempt',
  value: 11.4,
  unit: 'seconds',
  isFoul: false,
  incidentType: null,
  noteText: null,
  deviceId: null,
};

function insertRow(discipline: string): TimelineEntryRow {
  return {
    id: ENTRY_ID,
    event_id: EVENT_ID,
    athlete_id: ATHLETE_ID,
    discipline,
    entry_type: 'attempt',
    value: '11.400',
    unit: 'seconds',
    is_foul: false,
    incident_type: null,
    note_text: null,
    recorded_by: null,
    public_logger_session_id: SESSION_ID,
    version: 1,
    device_id: null,
    created_at: new Date('2026-09-01T10:00:00.000Z'),
    updated_at: new Date('2026-09-01T10:00:00.000Z'),
    deleted_at: null,
  };
}

describe('public logger service', () => {
  it('stores only a hash when creating a link', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      id: '33333333-3333-4333-8333-333333333333', event_id: EVENT_ID, status: 'active',
      created_at: new Date('2026-09-01T10:00:00.000Z'), revoked_at: null,
    }] });

    const result = await createPublicLoggerLink(WORKSPACE_ID, EVENT_ID, WORKSPACE_ID, { query } as unknown as DbExecutor);

    const storedHash = query.mock.calls[0][1][2];
    expect(result.token).toHaveLength(43);
    expect(storedHash).not.toBe(result.token);
    expect(storedHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not disclose data when the supplied session is no longer valid', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(publicLoggerSnapshot('expired-session', EVENT_ID, { query } as unknown as DbExecutor))
      .rejects.toMatchObject({ status: 401, code: 'PUBLIC_LOGGER_SESSION_INVALID' });
    expect(query.mock.calls[0][1][0]).not.toBe('expired-session');
  });

  it('marks generic meet snapshots so clients select the multi-discipline logger', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{
        id: '33333333-3333-4333-8333-333333333333', event_id: EVENT_ID, title: 'Combined Meet',
        status: 'in_progress', discipline: null, expires_at: new Date('2026-09-01T10:00:00.000Z'),
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(publicLoggerSnapshot('active-session', EVENT_ID, { query } as unknown as DbExecutor))
      .resolves.toMatchObject({ event: { id: EVENT_ID, discipline: null }, participants: [], timeline: [] });
  });

  it('reports the event discipline for a single-discipline event', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{
        id: SESSION_ID, event_id: EVENT_ID, title: '100m Night',
        status: 'in_progress', discipline: '100m', expires_at: new Date('2026-09-01T10:00:00.000Z'),
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(publicLoggerSnapshot('active-session', EVENT_ID, { query } as unknown as DbExecutor))
      .resolves.toMatchObject({ event: { id: EVENT_ID, discipline: '100m' } });
  });

  it('refuses to log an entry for a multi-discipline event', async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{ id: SESSION_ID, type: 'competition', status: 'in_progress', discipline: null }],
    });

    await expect(
      createPublicLoggerEntry('active-session', EVENT_ID, entryPayload, (operation) => operation({ query } as unknown as DbExecutor)),
    ).rejects.toMatchObject({ status: 409, code: 'DISCIPLINE_UNSUPPORTED' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('stamps the event discipline on the entry it writes', async () => {
    let insertedDiscipline: unknown;
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('FROM public_logger_sessions')) {
        return { rows: [{ id: SESSION_ID, type: 'competition', status: 'in_progress', discipline: '100m' }] };
      }
      if (sql.includes('FROM event_participants')) return { rows: [{ '?column?': 1 }] };
      if (sql.includes('INSERT INTO timeline_entries')) {
        insertedDiscipline = params[2];
        return { rows: [insertRow('100m')] };
      }
      return { rows: [] };
    });

    const entry = await createPublicLoggerEntry(
      'active-session',
      EVENT_ID,
      entryPayload,
      (operation) => operation({ query } as unknown as DbExecutor),
    );

    expect(insertedDiscipline).toBe('100m');
    expect(entry.discipline).toBe('100m');
  });
});
