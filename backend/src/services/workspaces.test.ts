import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ getPool: vi.fn() }));

import { getPool } from '../db/client.js';
import { listWorkspaces, resolveWorkspace } from './workspaces.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const query = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as unknown as ReturnType<typeof getPool>);
});

describe('workspaces', () => {
  it('lists only the authenticated user memberships in stable order', async () => {
    query.mockResolvedValue({ rows: [{ id: WORKSPACE_ID, name: 'Sprinters', timezone: 'UTC', role: 'assistant' }] });

    await expect(listWorkspaces(USER_ID)).resolves.toEqual([
      { id: WORKSPACE_ID, name: 'Sprinters', timezone: 'UTC', role: 'assistant' },
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE wm.user_id = $1'), [USER_ID]);
  });

  it('does not resolve a workspace without a membership', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(resolveWorkspace(USER_ID, WORKSPACE_ID)).rejects.toMatchObject({
      status: 403,
      code: 'WORKSPACE_ACCESS_DENIED',
    });
  });
});
