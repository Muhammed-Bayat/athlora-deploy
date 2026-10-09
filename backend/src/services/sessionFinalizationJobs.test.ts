import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import { withTransaction } from '../db/transaction.js';
import { changeSessionState } from './meets.js';
import { processSessionFinalizationJobs, queueSessionFinalization } from './sessionFinalizationJobs.js';

vi.mock('../db/client.js', () => ({ getPool: vi.fn() }));
vi.mock('../db/transaction.js', () => ({ withTransaction: vi.fn() }));
vi.mock('./meets.js', () => ({ changeSessionState: vi.fn(), getSession: vi.fn() }));
vi.mock('./meetAccess.js', () => ({ meetAccess: vi.fn(), meetConflict: vi.fn(), meetIds: vi.fn(), meetNotFound: vi.fn() }));

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

describe('queueSessionFinalization', () => {
  it('requeues a completed job after its session has been reopened', async () => {
    const { meetAccess } = await import('./meetAccess.js');
    const { getSession } = await import('./meets.js');
    vi.mocked(meetAccess).mockResolvedValue({ host: true, event: { status: 'in_progress', workspace_id: 'workspace-1' } } as never);
    vi.mocked(getSession).mockResolvedValue({ status: 'in_progress', version: 4 } as never);
    query.mockResolvedValue({ rows: [{ ...job, status: 'pending', attempts: 0, expected_version: 4 }] });

    await expect(queueSessionFinalization({ userId: 'coach-1', workspaceId: 'workspace-1', role: 'coach' }, 'event-1', 'session-1', 4)).resolves.toMatchObject({ status: 'pending', attempts: 0 });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status IN ('failed', 'completed')"), ['event-1', 'session-1', 'workspace-1', 'coach-1', 4]);
  });
});
