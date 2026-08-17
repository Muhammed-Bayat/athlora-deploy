import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import { type AthleteRow } from '../db/row-mappers.js';
import type { Athlete } from '../types/domain.js';
import {
  createAthlete,
  getAthlete,
  listAthletes,
  replaceAthlete,
  setAthleteArchived,
} from './athletes.js';

vi.mock('../db/client.js', () => ({
  getPool: vi.fn(),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ATHLETE_ID = '33333333-3333-4333-8333-333333333333';
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

function athleteRow(overrides: Partial<AthleteRow> = {}): AthleteRow {
  return {
    id: ATHLETE_ID,
    coach_id: USER_ID,
    name: 'Ari Runner',
    dob: '2010-04-12',
    gender: null,
    squad: 'Sprint',
    notes: null,
    archived_at: null,
    created_at: new Date('2026-08-01T09:00:00.000Z'),
    updated_at: new Date('2026-08-01T09:00:00.000Z'),
    ...overrides,
  };
}

function athleteBody(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: ATHLETE_ID,
    coachId: USER_ID,
    name: 'Ari Runner',
    dob: '2010-04-12',
    gender: null,
    squad: 'Sprint',
    notes: null,
    archivedAt: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
    ...overrides,
  };
}

describe('listAthletes', () => {
  it('scopes the roster to the coach and excludes archived athletes with stable ordering', async () => {
    query.mockResolvedValue({ rows: [athleteRow()] });

    const athletes = await listAthletes(USER_ID, { includeArchived: false });

    expect(athletes).toEqual([athleteBody()]);
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('coach_id = $1');
    expect(sql).toContain('archived_at IS NULL');
    expect(sql).toMatch(/ORDER BY LOWER\(name\) ASC, created_at ASC, id ASC/);
    expect(parameters).toEqual([USER_ID]);
  });

  it('includes archived athletes when requested', async () => {
    query.mockResolvedValue({ rows: [] });

    await listAthletes(USER_ID, { includeArchived: true });

    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain('archived_at IS NULL');
    expect(parameters).toEqual([USER_ID]);
  });

  it('filters by case-insensitive name substring and exact squad', async () => {
    query.mockResolvedValue({ rows: [] });

    await listAthletes(USER_ID, { includeArchived: true, name: 'ari_%', squad: 'Sprint' });

    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('name ILIKE $2');
    expect(sql).toContain('ILIKE $2 ESCAPE');
    expect(sql).toContain('squad = $3');
    expect(parameters).toEqual([USER_ID, '%ari\\_\\%%', 'Sprint']);
  });

  it('rejects a malformed coach id without querying', async () => {
    await expect(listAthletes('not-a-uuid', { includeArchived: false })).rejects.toMatchObject(
      genericNotFound,
    );
    expect(query).not.toHaveBeenCalled();
  });
});

describe('getAthlete', () => {
  it('returns the owned athlete', async () => {
    query.mockResolvedValue({ rows: [athleteRow()] });

    await expect(getAthlete(USER_ID, ATHLETE_ID)).resolves.toEqual(athleteBody());
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1 AND coach_id = $2'),
      [ATHLETE_ID, USER_ID],
    );
  });

  it('returns the generic not-found error when no owned row exists', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(getAthlete(USER_ID, ATHLETE_ID)).rejects.toMatchObject(genericNotFound);
  });

  it('returns the same error for a malformed id without querying', async () => {
    await expect(getAthlete(USER_ID, 'not-a-uuid')).rejects.toMatchObject(genericNotFound);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('createAthlete', () => {
  it('inserts with the server-derived coach id and returns the mapped row', async () => {
    query.mockResolvedValue({ rows: [athleteRow()] });

    const athlete = await createAthlete(USER_ID, {
      name: 'Ari Runner',
      dob: '2010-04-12',
      gender: null,
      squad: 'Sprint',
      notes: null,
    });

    expect(athlete).toEqual(athleteBody());
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO athletes');
    expect(sql).toContain('coach_id');
    expect(parameters).toEqual([USER_ID, 'Ari Runner', '2010-04-12', null, 'Sprint', null]);
  });
});

describe('replaceAthlete', () => {
  it('replaces the mutable fields without touching the archived state', async () => {
    query.mockResolvedValue({ rows: [athleteRow({ name: 'Ari Two' })] });

    const athlete = await replaceAthlete(USER_ID, ATHLETE_ID, {
      name: 'Ari Two',
      dob: null,
      gender: null,
      squad: null,
      notes: null,
    });

    expect(athlete).toEqual(athleteBody({ name: 'Ari Two' }));
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('UPDATE athletes');
    expect(sql).not.toContain('archived_at =');
    expect(parameters).toEqual(['Ari Two', null, null, null, null, ATHLETE_ID, USER_ID]);
  });

  it('returns the generic not-found error when no owned row exists', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(
      replaceAthlete(USER_ID, ATHLETE_ID, {
        name: 'Ari Two',
        dob: null,
        gender: null,
        squad: null,
        notes: null,
      }),
    ).rejects.toMatchObject(genericNotFound);
  });
});

describe('setAthleteArchived', () => {
  it('archives an owned athlete with an update, never a delete', async () => {
    query.mockResolvedValue({ rows: [athleteRow({ archived_at: new Date('2026-08-03T10:00:00.000Z') })] });

    const athlete = await setAthleteArchived(USER_ID, ATHLETE_ID, true);

    expect(athlete.archivedAt).toBe('2026-08-03T10:00:00.000Z');
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('archived_at = now()');
    expect(sql).not.toContain('DELETE FROM');
    expect(parameters).toEqual([ATHLETE_ID, USER_ID]);
  });

  it('unarchives an owned athlete by clearing archived_at', async () => {
    query.mockResolvedValue({ rows: [athleteRow()] });

    const athlete = await setAthleteArchived(USER_ID, ATHLETE_ID, false);

    expect(athlete.archivedAt).toBeNull();
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('archived_at = NULL');
  });

  it('returns the generic not-found error when no owned row exists', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(setAthleteArchived(USER_ID, ATHLETE_ID, true)).rejects.toMatchObject(
      genericNotFound,
    );
  });

  it('returns the same error for a malformed id without querying', async () => {
    await expect(setAthleteArchived(USER_ID, 'not-a-uuid', true)).rejects.toMatchObject(
      genericNotFound,
    );
    expect(query).not.toHaveBeenCalled();
  });
});
