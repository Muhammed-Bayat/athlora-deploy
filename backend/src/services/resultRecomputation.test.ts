import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { recomputeEventResults } from './timeline.js';
import { recomputeAndUpsertResult } from './resultRecomputation.js';

vi.mock('./timeline.js', () => ({
  recomputeEventResults: vi.fn(),
}));

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const ATHLETE_ID = '22222222-2222-4222-8222-222222222222';
const query = vi.fn();
const client = { query } as unknown as PoolClient;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recomputeAndUpsertResult', () => {
  it('uses canonical whole-event recomputation after locking the event', async () => {
    query.mockResolvedValue({ rows: [{ type: 'competition' }] });

    await recomputeAndUpsertResult(client, EVENT_ID, ATHLETE_ID);

    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/SELECT type[\s\S]*FOR UPDATE/),
      [EVENT_ID],
    );
    expect(recomputeEventResults).toHaveBeenCalledWith(client, EVENT_ID, 'competition');
  });

  it('does nothing when the owned event no longer exists', async () => {
    query.mockResolvedValue({ rows: [] });

    await recomputeAndUpsertResult(client, EVENT_ID, ATHLETE_ID);

    expect(recomputeEventResults).not.toHaveBeenCalled();
  });
});
