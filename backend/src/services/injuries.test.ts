import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import {
  createInjury,
  listActiveInjurySummaries,
  listInjuries,
} from './injuries.js';

vi.mock('../db/client.js', () => ({
  getPool: vi.fn(),
}));

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const ATHLETE_ID = '22222222-2222-4222-8222-222222222222';
const INJURY_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const query = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as unknown as ReturnType<typeof getPool>);
});

describe('injury service', () => {
  it('creates an injury when athlete belongs to workspace and is not archived', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: ATHLETE_ID }] });
    query.mockResolvedValueOnce({ rows: [{ archived_at: null }] });
    query.mockResolvedValueOnce({
      rows: [
        {
          id: INJURY_ID,
          workspace_id: WORKSPACE_ID,
          athlete_id: ATHLETE_ID,
          body_region: 'Leg',
          area: 'Knee',
          side: 'Left',
          severity: 'Moderate',
          notes: 'Soreness after sprint',
          occurrence_date: '2026-08-30',
          expected_return_date: '2026-09-06',
          resolved_date: null,
          resolution_notes: null,
          created_by: USER_ID,
          updated_by: USER_ID,
          created_at: new Date('2026-08-30T10:00:00.000Z'),
          updated_at: new Date('2026-08-30T10:00:00.000Z'),
          deleted_at: null,
          deleted_by: null,
        },
      ],
    });

    const injury = await createInjury(WORKSPACE_ID, ATHLETE_ID, USER_ID, {
      bodyRegion: 'Leg',
      area: 'Knee',
      side: 'Left',
      severity: 'Moderate',
      notes: 'Soreness after sprint',
      occurrenceDate: '2026-08-30',
      expectedReturnDate: '2026-09-06',
    });

    expect(injury.id).toBe(INJURY_ID);
    expect(injury.bodyRegion).toBe('Leg');
    expect(injury.area).toBe('Knee');
  });

  it('rejects creation if athlete is archived', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: ATHLETE_ID }] });
    query.mockResolvedValueOnce({ rows: [{ archived_at: new Date() }] });

    await expect(
      createInjury(WORKSPACE_ID, ATHLETE_ID, USER_ID, {
        bodyRegion: 'Leg',
        area: 'Knee',
        side: 'Left',
        severity: 'Moderate',
        notes: null,
        occurrenceDate: '2026-08-30',
        expectedReturnDate: null,
      }),
    ).rejects.toMatchObject({ code: 'ATHLETE_ARCHIVED' });
  });

  it('lists injuries for an athlete', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: ATHLETE_ID }] });
    query.mockResolvedValueOnce({ rows: [] });

    const injuries = await listInjuries(WORKSPACE_ID, ATHLETE_ID);
    expect(injuries).toEqual([]);
  });

  it('groups active injuries by athlete and retains the highest severity', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { athlete_id: ATHLETE_ID, body_region: 'Arm', area: 'Forearm', side: 'Left', severity: 'Minor' },
        { athlete_id: ATHLETE_ID, body_region: 'Arm', area: 'Forearm', side: 'Left', severity: 'Severe' },
        { athlete_id: '55555555-5555-4555-8555-555555555555', body_region: 'Leg', area: 'Knee', side: 'Both', severity: 'Moderate' },
      ],
    });

    await expect(listActiveInjurySummaries(WORKSPACE_ID)).resolves.toEqual([
      expect.objectContaining({ athleteId: ATHLETE_ID, activeInjuryCount: 2, highestSeverity: 'Severe' }),
      expect.objectContaining({ athleteId: '55555555-5555-4555-8555-555555555555', activeInjuryCount: 1, highestSeverity: 'Moderate' }),
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('deleted_at IS NULL AND resolved_date IS NULL'), [WORKSPACE_ID]);
  });
});
