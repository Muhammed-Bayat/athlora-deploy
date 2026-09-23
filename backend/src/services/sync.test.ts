import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import { recomputeEventResults } from './timeline.js';
import { processSyncBatch, type SyncActionInput } from './sync.js';

vi.mock('../db/client.js', () => ({ getPool: vi.fn() }));
vi.mock('./timeline.js', () => ({ recomputeEventResults: vi.fn() }));

const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const DEVICE_ID = 'device-1';
const ACTION_CREATE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTION_DUP = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTION_CONFLICT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ACTION_UNDO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ACTION_MALFORMED = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ACTION_INVALID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function createAction(actionId = ACTION_CREATE): SyncActionInput {
  return {
    actionId,
    actionType: 'create_entry',
    payload: {
      athleteId: '33333333-3333-4333-8333-333333333333',
      discipline: '100m',
      entryType: 'attempt',
      value: 12.34,
      unit: 'seconds',
    },
    clientTimestamp: '2026-09-05T10:00:00.000Z',
  };
}

function eventOpenRow() {
  return { rows: [{ type: 'competition', status: 'in_progress' }] };
}

describe('processSyncBatch', () => {
  const query = vi.fn();
  const release = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPool).mockReturnValue({
      connect: vi.fn().mockResolvedValue({ query, release }),
      query,
    } as unknown as ReturnType<typeof getPool>);
  });

  it('accepts a new entry and persists an idempotency receipt', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce(eventOpenRow()) // event status
      .mockResolvedValueOnce({ rows: [] }) // receipt lookup
      .mockResolvedValueOnce({ rows: [{ id: '44444444-4444-4444-8444-444444444444', version: 1 }] })
      .mockResolvedValueOnce({ rows: [] }) // accepted receipt
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await expect(processSyncBatch(EVENT_ID, ACTOR_ID, DEVICE_ID, [createAction()])).resolves.toEqual({
      receipts: [{ actionId: ACTION_CREATE, status: 'accepted', entryId: '44444444-4444-4444-8444-444444444444', serverVersion: 1 }],
      recomputedResults: true,
    });

    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('INSERT INTO timeline_entries'),
      [ACTION_CREATE, EVENT_ID, '33333333-3333-4333-8333-333333333333', '100m', 'attempt', 12.34, 'seconds', null, null, ACTOR_ID, DEVICE_ID],
    );
    expect(query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('INSERT INTO sync_action_receipts'),
      [ACTION_CREATE, EVENT_ID, ACTOR_ID, DEVICE_ID, 'create_entry', '44444444-4444-4444-8444-444444444444', 1],
    );
    expect(recomputeEventResults).toHaveBeenCalledWith(expect.anything(), EVENT_ID, 'competition');
    expect(query).toHaveBeenLastCalledWith('COMMIT');
    expect(release).toHaveBeenCalledOnce();
  });

  it('returns the original receipt for a duplicate accepted action without mutating the entry', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce(eventOpenRow()) // event status
      .mockResolvedValueOnce({
        rows: [{
          status: 'accepted',
          entry_id: '44444444-4444-4444-8444-444444444444',
          server_version: 4,
          error_code: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await expect(processSyncBatch(EVENT_ID, ACTOR_ID, DEVICE_ID, [createAction(ACTION_DUP)])).resolves.toEqual({
      receipts: [{
        actionId: ACTION_DUP,
        status: 'duplicate',
        entryId: '44444444-4444-4444-8444-444444444444',
        serverVersion: 4,
      }],
      recomputedResults: false,
    });

    expect(recomputeEventResults).not.toHaveBeenCalled();
    expect(query).toHaveBeenLastCalledWith('COMMIT');
    expect(release).toHaveBeenCalledOnce();
  });

  it('returns rejected with the stored code when retrying a previously rejected action', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce(eventOpenRow()) // event status
      .mockResolvedValueOnce({
        rows: [{ status: 'rejected', entry_id: null, server_version: null, error_code: 'VERSION_CONFLICT' }],
      })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await expect(processSyncBatch(EVENT_ID, ACTOR_ID, DEVICE_ID, [createAction(ACTION_CONFLICT)])).resolves.toEqual({
      receipts: [{ actionId: ACTION_CONFLICT, status: 'rejected', code: 'VERSION_CONFLICT' }],
      recomputedResults: false,
    });

    expect(recomputeEventResults).not.toHaveBeenCalled();
  });

  it('rejects an edit whose expected version is stale and records the conflict', async () => {
    const action: SyncActionInput = {
      actionId: ACTION_CONFLICT,
      actionType: 'edit_entry',
      payload: { entryId: '44444444-4444-4444-8444-444444444444', value: 12.5, expectedVersion: 2 },
      expectedVersion: 1,
      clientTimestamp: '2026-09-05T10:01:00.000Z',
    };
    query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce(eventOpenRow()) // event status
      .mockResolvedValueOnce({ rows: [] }) // receipt lookup
      .mockResolvedValueOnce({ rows: [] }) // conditional update
      .mockResolvedValueOnce({ rows: [] }) // rejected receipt
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await expect(processSyncBatch(EVENT_ID, ACTOR_ID, DEVICE_ID, [action])).resolves.toEqual({
      receipts: [{ actionId: ACTION_CONFLICT, status: 'rejected', code: 'VERSION_CONFLICT' }],
      recomputedResults: false,
    });

    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('UPDATE timeline_entries'),
      [12.5, null, null, '44444444-4444-4444-8444-444444444444', EVENT_ID, 2],
    );
    expect(query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining("'VERSION_CONFLICT'"),
      [ACTION_CONFLICT, EVENT_ID, ACTOR_ID, DEVICE_ID, 'edit_entry'],
    );
  });

  it('rejects a malformed action when its entry mutation fails internally', async () => {
    const malformedAction = createAction(ACTION_MALFORMED);
    malformedAction.payload = { athleteId: '33333333-3333-4333-8333-333333333333' };
    query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce(eventOpenRow()) // event status
      .mockResolvedValueOnce({ rows: [] }) // receipt lookup
      .mockRejectedValueOnce(new Error('null value in column "discipline"'))
      .mockResolvedValueOnce({ rows: [] }) // internal-error receipt
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await expect(processSyncBatch(EVENT_ID, ACTOR_ID, DEVICE_ID, [malformedAction])).resolves.toEqual({
      receipts: [{ actionId: ACTION_MALFORMED, status: 'rejected', code: 'INTERNAL_ERROR' }],
      recomputedResults: false,
    });

    expect(query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining("'INTERNAL_ERROR'"),
      [ACTION_MALFORMED, EVENT_ID, ACTOR_ID, DEVICE_ID, 'create_entry'],
    );
    expect(query).toHaveBeenLastCalledWith('COMMIT');
  });

  it('rejects unknown action types with INVALID_ACTION', async () => {
    const unknown = {
      actionId: ACTION_INVALID,
      actionType: 'drop_entry' as unknown as SyncActionInput['actionType'],
      payload: {},
      clientTimestamp: '2026-09-05T10:00:00.000Z',
    };
    query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce(eventOpenRow()) // event status
      .mockResolvedValueOnce({ rows: [] }) // invalid receipt insert
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await expect(processSyncBatch(EVENT_ID, ACTOR_ID, DEVICE_ID, [unknown])).resolves.toEqual({
      receipts: [{ actionId: ACTION_INVALID, status: 'rejected', code: 'INVALID_ACTION' }],
      recomputedResults: false,
    });

    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("'INVALID_ACTION'"),
      [ACTION_INVALID, EVENT_ID, ACTOR_ID, DEVICE_ID, 'drop_entry'],
    );
  });

  it('rejects every action when the event is not in progress', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ type: 'competition', status: 'completed' }] })
      .mockResolvedValueOnce({ rows: [] }) // receipt insert
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await expect(processSyncBatch(EVENT_ID, ACTOR_ID, DEVICE_ID, [createAction()])).resolves.toEqual({
      receipts: [{ actionId: ACTION_CREATE, status: 'rejected', code: 'EVENT_NOT_IN_PROGRESS' }],
      recomputedResults: false,
    });
  });

  it('keeps processing a mixed batch and recomputes when any action is accepted', async () => {
    const undoAction: SyncActionInput = {
      actionId: ACTION_UNDO,
      actionType: 'undo_entry',
      payload: { entryId: '44444444-4444-4444-8444-444444444444', expectedVersion: 3 },
      clientTimestamp: '2026-09-05T10:02:00.000Z',
    };
    const duplicateAction = createAction(ACTION_DUP);
    const conflictAction: SyncActionInput = {
      actionId: ACTION_CONFLICT,
      actionType: 'edit_entry',
      payload: { entryId: '55555555-5555-4555-8555-555555555555', expectedVersion: 5 },
      clientTimestamp: '2026-09-05T10:03:00.000Z',
    };
    query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce(eventOpenRow()) // event status
      .mockResolvedValueOnce({ rows: [] }) // undo receipt lookup
      .mockResolvedValueOnce({ rows: [{ id: '44444444-4444-4444-8444-444444444444', version: 4 }] })
      .mockResolvedValueOnce({ rows: [] }) // accepted undo receipt
      .mockResolvedValueOnce({
        rows: [{
          status: 'accepted',
          entry_id: '66666666-6666-4666-8666-666666666666',
          server_version: 2,
          error_code: null,
        }],
      }) // duplicate receipt lookup
      .mockResolvedValueOnce({ rows: [] }) // edit receipt lookup
      .mockResolvedValueOnce({ rows: [] }) // stale edit update
      .mockResolvedValueOnce({ rows: [] }) // rejected edit receipt
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await expect(processSyncBatch(EVENT_ID, ACTOR_ID, DEVICE_ID, [undoAction, duplicateAction, conflictAction])).resolves.toEqual({
      receipts: [
        { actionId: ACTION_UNDO, status: 'accepted', entryId: '44444444-4444-4444-8444-444444444444', serverVersion: 4 },
        {
          actionId: ACTION_DUP,
          status: 'duplicate',
          entryId: '66666666-6666-4666-8666-666666666666',
          serverVersion: 2,
        },
        { actionId: ACTION_CONFLICT, status: 'rejected', code: 'VERSION_CONFLICT' },
      ],
      recomputedResults: true,
    });

    expect(recomputeEventResults).toHaveBeenCalledWith(expect.anything(), EVENT_ID, 'competition');
    expect(query).toHaveBeenLastCalledWith('COMMIT');
    expect(release).toHaveBeenCalledOnce();
  });
});
