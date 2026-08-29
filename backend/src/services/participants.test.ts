import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import type { EventParticipantSummaryRow } from '../db/row-mappers.js';
import { withTransaction } from '../db/transaction.js';
import {
  addEventParticipant,
  listEventParticipants,
  removeEventParticipant,
  replaceEventParticipant,
} from './participants.js';

vi.mock('../db/client.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../db/transaction.js', () => ({
  withTransaction: vi.fn(),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const ATHLETE_ID = '33333333-3333-4333-8333-333333333333';
const query = vi.fn();

const participantRow: EventParticipantSummaryRow = {
  event_id: EVENT_ID,
  athlete_id: ATHLETE_ID,
  rsvp_status: 'pending',
  athlete_name: 'Ari Runner',
  athlete_squad_names: [],
  athlete_archived_at: null,
};

const participant = {
  eventId: EVENT_ID,
  athleteId: ATHLETE_ID,
  rsvpStatus: 'pending',
  athlete: {
    id: ATHLETE_ID,
    name: 'Ari Runner',
    squadNames: [],
    archivedAt: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as unknown as ReturnType<typeof getPool>);
  vi.mocked(withTransaction).mockImplementation(async (operation) =>
    operation({ query } as never),
  );
});

describe('event participant service', () => {
  it('lists owned participants with athlete summaries in stable name order', async () => {
    query.mockResolvedValueOnce({ rows: [participantRow] });

    await expect(listEventParticipants(USER_ID, EVENT_ID)).resolves.toEqual([participant]);
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('JOIN events e');
    expect(sql).toContain('JOIN athletes a');
    expect(sql).toContain('ORDER BY lower(a.name) ASC, a.id ASC');
    expect(parameters).toEqual([EVENT_ID, USER_ID]);
  });

  it('assigns an active owned athlete with the pending default', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ archived_at: null, already_assigned: false }] })
      .mockResolvedValueOnce({ rows: [{ event_id: EVENT_ID }] })
      .mockResolvedValueOnce({ rows: [participantRow] });

    await expect(
      addEventParticipant(USER_ID, EVENT_ID, { athleteId: ATHLETE_ID }),
    ).resolves.toEqual(participant);
    expect(query.mock.calls[0]?.[0]).toContain('FOR UPDATE OF e, a');
    expect(query.mock.calls[1]?.[1]).toEqual([EVENT_ID, ATHLETE_ID]);
  });

  it('rejects archived athletes without removing existing historical assignments', async () => {
    query.mockResolvedValueOnce({ rows: [{ archived_at: new Date(), already_assigned: false }] });

    await expect(addEventParticipant(USER_ID, EVENT_ID, { athleteId: ATHLETE_ID })).rejects.toMatchObject({
      status: 409,
      code: 'ATHLETE_ARCHIVED',
      message: 'Archived athletes cannot be assigned to events',
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it('rejects duplicate assignments without creating another row', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ archived_at: null, already_assigned: true }] });

    await expect(addEventParticipant(USER_ID, EVENT_ID, { athleteId: ATHLETE_ID })).rejects.toMatchObject({
      status: 409,
      code: 'PARTICIPANT_ALREADY_ASSIGNED',
    });
  });

  it('reports a duplicate before archival for an existing historical assignment', async () => {
    query.mockResolvedValueOnce({
      rows: [{ archived_at: new Date(), already_assigned: true }],
    });

    await expect(addEventParticipant(USER_ID, EVENT_ID, { athleteId: ATHLETE_ID })).rejects.toMatchObject({
      status: 409,
      code: 'PARTICIPANT_ALREADY_ASSIGNED',
    });
  });

  it('replaces RSVP status idempotently and returns the athlete summary', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...participantRow, rsvp_status: 'yes' }] });

    await expect(
      replaceEventParticipant(USER_ID, EVENT_ID, ATHLETE_ID, { rsvpStatus: 'yes' }),
    ).resolves.toEqual({ ...participant, rsvpStatus: 'yes' });
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('SET rsvp_status = $1');
    expect(parameters).toEqual(['yes', EVENT_ID, ATHLETE_ID, USER_ID]);
  });

  it('removes only the assignment row', async () => {
    query.mockResolvedValueOnce({ rows: [{ event_id: EVENT_ID }] });

    await expect(removeEventParticipant(USER_ID, EVENT_ID, ATHLETE_ID)).resolves.toBeUndefined();
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('DELETE FROM event_participants');
    expect(sql).not.toContain('timeline_entries');
    expect(sql).not.toContain('results');
    expect(parameters).toEqual([EVENT_ID, ATHLETE_ID, USER_ID]);
  });

  it('uses generic not-found behavior for malformed and missing assignments', async () => {
    await expect(listEventParticipants(USER_ID, 'invalid')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(query).not.toHaveBeenCalled();

    query.mockResolvedValueOnce({ rows: [] });
    await expect(removeEventParticipant(USER_ID, EVENT_ID, ATHLETE_ID)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });
});
