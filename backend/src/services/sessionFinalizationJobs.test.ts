import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import { withTransaction } from '../db/transaction.js';
import { changeSessionState } from './meets.js';
import { processSessionFinalizationJobs } from './sessionFinalizationJobs.js';

vi.mock('../db/client.js', () => ({ getPool: vi.fn() }));
vi.mock('../db/transaction.js', () => ({ withTransaction: vi.fn() }));
vi.mock('./meets.js', () => ({ changeSessionState: vi.fn(), getSession: vi.fn() }));

const query = vi.fn();
const job = {
  id: 'job-1', event_id: 'event-1', session_id: 'session-1', status: 'pending', attempts: 0, error_message: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as never);
  vi.mocked(withTransaction).mockImplementation(async (operation) => operation({ query } as never));
});

describe('processSessionFinalizationJobs', () => {
  it('marks a claimed job complete after finalizing its session', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [job] })
      .mockResolvedValueOnce({ rows: [{ ...job, status: 'running', attempts: 1 }] })
      .mockResolvedValueOnce({ rows: [{ requested_by: 'coach-1', workspace_id: 'workspace-1', expected_version: 3 }] })
      .mockResolvedValueOnce({ rows: [{ ...job, status: 'completed', attempts: 1 }] });

    await expect(processSessionFinalizationJobs()).resolves.toMatchObject({ status: 'completed', attempts: 1 });
    expect(changeSessionState).toHaveBeenCalledWith(
      { userId: 'coach-1', workspaceId: 'workspace-1', role: 'coach' },
      'event-1',
      'session-1',
      { status: 'completed', expectedVersion: 3 },
    );
  });

  it('persists a failed status when finalization rejects', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [job] })
      .mockResolvedValueOnce({ rows: [{ ...job, status: 'running', attempts: 1 }] })
      .mockResolvedValueOnce({ rows: [{ requested_by: 'coach-1', workspace_id: 'workspace-1', expected_version: 3 }] })
      .mockResolvedValueOnce({ rows: [{ ...job, status: 'failed', attempts: 1, error_message: 'Version conflict' }] });
    vi.mocked(changeSessionState).mockRejectedValueOnce(new Error('Version conflict'));

    await expect(processSessionFinalizationJobs()).resolves.toMatchObject({ status: 'failed', errorMessage: 'Version conflict' });
  });
});
