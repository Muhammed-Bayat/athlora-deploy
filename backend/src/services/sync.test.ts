import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import { processSyncBatch, type SyncActionInput } from './sync.js';

vi.mock('../db/client.js', () => ({ getPool: vi.fn() }));

const EVENT_ID = 'event-1';
const ACTOR_ID = 'actor-1';
const DEVICE_ID = 'device-1';

function createAction(actionId = 'action-create'): SyncActionInput {
  return {
    actionId,
    actionType: 'create_entry',
    payload: {
      athleteId: 'athlete-1',
      discipline: '100m',
      entryType: 'attempt',
      value: 12.34,
      unit: 'seconds',
    },
    clientTimestamp: '2026-09-05T10:00:00.000Z',
  };
}

describe('processSyncBatch', () => {
  const query = vi.fn();
  const release = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPool).mockReturnValue({
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as unknown as ReturnType<typeof getPool>);
  });

  it('accepts a new entry and persists an idempotency receipt', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // receipt lookup
      .mockResolvedValueOnce({ rows: [{ id: 'entry-1', version: 1 }] })
      .mockResolvedValueOnce({ rows: [] }) // accepted receipt
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await expect(processSyncBatch(EVENT_ID, ACTOR_ID, DEVICE_ID, [createAction()])).resolves.toEqual({
      receipts: [{ actionId: 'action-create', status: 'accepted', entryId: 'entry-1', serverVersion: 1 }],
      recomputedResults: true,
    });

    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO timeline_entries'),
      ['action-create', EVENT_ID, 'athlete-1', '100m', 'attempt', 12.34, 'seconds', null, null, ACTOR_ID, DEVICE_ID],
    );
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('INSERT INTO sync_action_receipts'),
      ['action-create', EVENT_ID, ACTOR_ID, DEVICE_ID, 'create_entry', 'entry-1', 1],
    );
    expect(query).toHaveBeenLastCalledWith('COMMIT');
    expect(release).toHaveBeenCalledOnce();
  });

  it('returns the original receipt for a duplicate action without mutating the entry', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ entry_id: 'entry-existing', server_version: 4 }] })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await expect(processSyncBatch(EVENT_ID, ACTOR_ID, DEVICE_ID, [createAction('action-duplicate')])).resolves.toEqual({
      receipts: [{ actionId: 'action-duplicate', status: 'duplicate', entryId: 'entry-existing', serverVersion: 4 }],
      recomputedResults: false,
    });

    expect(query).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenLastCalledWith('COMMIT');
    expect(release).toHaveBeenCalledOnce();
  });

  it('rejects an edit whose expected version is stale and records the conflict', async () => {
    const action: SyncActionInput = {
      actionId: 'action-conflict',
      actionType: 'edit_entry',
      payload: { entryId: 'entry-1', value: 12.5, expectedVersion: 2 },
      expectedVersion: 1,
      clientTimestamp: '2026-09-05T10:01:00.000Z',
    };
    query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // receipt lookup
      .mockResolvedValueOnce({ rows: [] }) // conditional update
      .mockResolvedValueOnce({ rows: [] }) // rejected receipt
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await expect(processSyncBatch(EVENT_ID, ACTOR_ID, DEVICE_ID, [action])).resolves.toEqual({
      receipts: [{ actionId: 'action-conflict', status: 'rejected', code: 'VERSION_CONFLICT' }],
      recomputedResults: false,
    });

    expect(query).toHaveBeenNthCalledWith(3, expect.stringContaining('UPDATE timeline_entries'), [12.5, null, null, 'entry-1', EVENT_ID, 2]);
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("'VERSION_CONFLICT'"),
      ['action-conflict', EVENT_ID, ACTOR_ID, DEVICE_ID, 'edit_entry'],
    );
  });

  it('rejects a malformed action when its entry mutation fails internally', async () => {
    const malformedAction = createAction('action-malformed');
    malformedAction.payload = { athleteId: 'athlete-1' };
    query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // receipt lookup
      .mockRejectedValueOnce(new Error('null value in column "discipline"'))
      .mockResolvedValueOnce({ rows: [] }) // internal-error receipt
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await expect(processSyncBatch(EVENT_ID, ACTOR_ID, DEVICE_ID, [malformedAction])).resolves.toEqual({
      receipts: [{ actionId: 'action-malformed', status: 'rejected', code: 'INTERNAL_ERROR' }],
      recomputedResults: false,
    });

    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("'INTERNAL_ERROR'"),
      ['action-malformed', EVENT_ID, ACTOR_ID, DEVICE_ID, 'create_entry'],
    );
    expect(query).toHaveBeenLastCalledWith('COMMIT');
  });

  it('keeps processing a mixed batch and recomputes when any action is accepted', async () => {
    const undoAction: SyncActionInput = {
      actionId: 'action-undo',
      actionType: 'undo_entry',
      payload: { entryId: 'entry-2', expectedVersion: 3 },
      clientTimestamp: '2026-09-05T10:02:00.000Z',
    };
    const duplicateAction = createAction('action-duplicate');
    const conflictAction: SyncActionInput = {
      actionId: 'action-conflict',
      actionType: 'edit_entry',
      payload: { entryId: 'entry-3', expectedVersion: 5 },
      clientTimestamp: '2026-09-05T10:03:00.000Z',
    };
    query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // undo receipt lookup
      .mockResolvedValueOnce({ rows: [{ id: 'entry-2', version: 4 }] })
      .mockResolvedValueOnce({ rows: [] }) // accepted undo receipt
      .mockResolvedValueOnce({ rows: [{ entry_id: 'entry-old', server_version: 2 }] })
      .mockResolvedValueOnce({ rows: [] }) // edit receipt lookup
      .mockResolvedValueOnce({ rows: [] }) // stale edit update
      .mockResolvedValueOnce({ rows: [] }) // rejected edit receipt
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await expect(processSyncBatch(EVENT_ID, ACTOR_ID, DEVICE_ID, [undoAction, duplicateAction, conflictAction])).resolves.toEqual({
      receipts: [
        { actionId: 'action-undo', status: 'accepted', entryId: 'entry-2', serverVersion: 4 },
        { actionId: 'action-duplicate', status: 'duplicate', entryId: 'entry-old', serverVersion: 2 },
        { actionId: 'action-conflict', status: 'rejected', code: 'VERSION_CONFLICT' },
      ],
      recomputedResults: true,
    });

    expect(query).toHaveBeenNthCalledWith(3, expect.stringContaining('SET deleted_at = now()'), ['entry-2', EVENT_ID, 3]);
    expect(query).toHaveBeenLastCalledWith('COMMIT');
    expect(release).toHaveBeenCalledOnce();
  });
});
