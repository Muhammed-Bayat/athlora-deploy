import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import {
  assertAthleteOwnership,
  assertEventAthleteOwnership,
  assertEventOwnership,
  assertParticipantOwnership,
  assertResultOwnership,
  assertTimelineEntryOwnership,
} from './ownership.js';

vi.mock('../db/client.js', () => ({
  getPool: vi.fn(),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const ATHLETE_ID = '33333333-3333-4333-8333-333333333333';
const ENTRY_ID = '44444444-4444-4444-8444-444444444444';
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
});

describe('ownership checks', () => {
  it('checks athlete ownership through workspace_id', async () => {
    query.mockResolvedValue({ rows: [{ '?column?': 1 }] });

    await expect(assertAthleteOwnership(USER_ID, ATHLETE_ID)).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/FROM athletes[\s\S]*workspace_id = \$2/),
      [ATHLETE_ID, USER_ID],
    );
  });

  it('checks event ownership through workspace_id', async () => {
    query.mockResolvedValue({ rows: [{ '?column?': 1 }] });

    await expect(assertEventOwnership(USER_ID, EVENT_ID)).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/FROM events[\s\S]*workspace_id = \$2/),
      [EVENT_ID, USER_ID],
    );
  });

  it('can run an ownership check through a transaction client', async () => {
    const transactionQuery = vi.fn().mockResolvedValue({ rows: [{ owned: 1 }] });

    await expect(
      assertEventOwnership(USER_ID, EVENT_ID, { query: transactionQuery }),
    ).resolves.toBeUndefined();

    expect(transactionQuery).toHaveBeenCalledWith(expect.any(String), [EVENT_ID, USER_ID]);
    expect(query).not.toHaveBeenCalled();
  });

  it('requires both event and athlete ownership for an event-athlete scope', async () => {
    query.mockResolvedValue({ rows: [{ '?column?': 1 }] });

    await expect(
      assertEventAthleteOwnership(USER_ID, EVENT_ID, ATHLETE_ID),
    ).resolves.toBeUndefined();

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toMatch(/e\.workspace_id = \$3/);
    expect(sql).toMatch(/a\.workspace_id = \$3/);
    expect(query).toHaveBeenCalledWith(expect.any(String), [EVENT_ID, ATHLETE_ID, USER_ID]);
  });

  it('checks timeline parentage plus event and athlete ownership, not the audit actor', async () => {
    query.mockResolvedValue({ rows: [{ '?column?': 1 }] });

    await expect(
      assertTimelineEntryOwnership(USER_ID, EVENT_ID, ENTRY_ID),
    ).resolves.toBeUndefined();

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toMatch(/te\.event_id = \$2/);
    expect(sql).toMatch(/e\.workspace_id = \$3/);
    expect(sql).toMatch(/a\.workspace_id = \$3/);
    expect(sql).not.toContain('recorded_by');
    expect(query).toHaveBeenCalledWith(expect.any(String), [ENTRY_ID, EVENT_ID, USER_ID]);
  });

  it('checks participant parentage plus event and athlete ownership', async () => {
    query.mockResolvedValue({ rows: [{ '?column?': 1 }] });

    await expect(
      assertParticipantOwnership(USER_ID, EVENT_ID, ATHLETE_ID),
    ).resolves.toBeUndefined();

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain('JOIN event_participants');
    expect(sql).toMatch(/e\.workspace_id = \$3/);
    expect(sql).toMatch(/a\.workspace_id = \$3/);
    expect(query).toHaveBeenCalledWith(expect.any(String), [EVENT_ID, ATHLETE_ID, USER_ID]);
  });

  it('checks result parentage plus event and athlete ownership, not the audit actor', async () => {
    query.mockResolvedValue({ rows: [{ '?column?': 1 }] });

    await expect(assertResultOwnership(USER_ID, EVENT_ID, ATHLETE_ID)).resolves.toBeUndefined();

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain('FROM results');
    expect(sql).toMatch(/e\.workspace_id = \$3/);
    expect(sql).toMatch(/a\.workspace_id = \$3/);
    expect(sql).toMatch(/r\.discipline = \$4/);
    expect(sql).not.toContain('overridden_by');
    expect(query).toHaveBeenCalledWith(expect.any(String), [EVENT_ID, ATHLETE_ID, USER_ID, '100m']);
  });
});

describe('ownership non-disclosure', () => {
  const checks = [
    ['athlete', () => assertAthleteOwnership(USER_ID, ATHLETE_ID)],
    ['event', () => assertEventOwnership(USER_ID, EVENT_ID)],
    ['event-athlete', () => assertEventAthleteOwnership(USER_ID, EVENT_ID, ATHLETE_ID)],
    ['timeline entry', () => assertTimelineEntryOwnership(USER_ID, EVENT_ID, ENTRY_ID)],
    ['participant', () => assertParticipantOwnership(USER_ID, EVENT_ID, ATHLETE_ID)],
    ['result', () => assertResultOwnership(USER_ID, EVENT_ID, ATHLETE_ID)],
  ] as const;

  it.each(checks)('returns the generic not-found error for an unavailable %s', async (_name, check) => {
    query.mockResolvedValue({ rows: [] });

    await expect(check()).rejects.toMatchObject(genericNotFound);
  });

  it.each([
    ['malformed', 'not-a-uuid'],
    ['missing', undefined],
  ])('returns the same error for a %s resource ID without querying', async (_name, id) => {
    await expect(assertEventOwnership(USER_ID, id)).rejects.toMatchObject(genericNotFound);
    expect(query).not.toHaveBeenCalled();
  });

  it('uses the same error for a child attached to the wrong parent', async () => {
    query.mockResolvedValue({ rows: [] });

    const error = assertTimelineEntryOwnership(USER_ID, EVENT_ID, ENTRY_ID);

    await expect(error).rejects.toMatchObject(genericNotFound);
  });
});
