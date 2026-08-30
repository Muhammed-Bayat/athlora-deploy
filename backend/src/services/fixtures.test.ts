import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ getPool: vi.fn() }));

import { getPool } from '../db/client.js';
import { listFixtureInvitations, listGuestFixtures } from './fixtures.js';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const query = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as unknown as ReturnType<typeof getPool>);
});

describe('fixtures', () => {
  it('fully qualifies event columns when listing guest fixtures', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(listGuestFixtures(WORKSPACE_ID)).resolves.toEqual([]);

    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('e.id, e.created_by, e.type');
    expect(sql).toContain('e.status, e.created_at, e.updated_at');
    expect(sql).toContain('fw.status AS fixture_status');
    expect(query).toHaveBeenCalledWith(expect.any(String), [WORKSPACE_ID]);
  });

  it('uses the event ID rather than the workspace ID for host invitations', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(listFixtureInvitations(WORKSPACE_ID, EVENT_ID)).resolves.toEqual([]);

    expect(query).toHaveBeenCalledWith(expect.any(String), [EVENT_ID, WORKSPACE_ID]);
  });
});
