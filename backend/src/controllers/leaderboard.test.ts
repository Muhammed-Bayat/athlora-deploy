import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import { getPublicLeaderboard } from '../services/leaderboard.js';
import { leaderboard } from './leaderboard.js';

vi.mock('../db/client.js', () => ({ getPool: vi.fn() }));
vi.mock('../services/leaderboard.js', () => ({ getPublicLeaderboard: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query: vi.fn() } as never);
});

describe('leaderboard controller', () => {
  it('passes string filters to the public leaderboard and returns a count', async () => {
    const entries = [{ athleteId: 'athlete-1' }];
    vi.mocked(getPublicLeaderboard).mockResolvedValue(entries as never);
    const json = vi.fn();
    const next = vi.fn();

    await leaderboard({ query: { discipline: '200m', season: '2026', age: 'u18', gender: 'female', club: 'club-1' } } as unknown as Request, { json } as unknown as Response, next);

    expect(getPublicLeaderboard).toHaveBeenCalledWith(
      { discipline: '200m', season: '2026', age: 'u18', gender: 'female', club: 'club-1' },
      expect.anything(),
    );
    expect(json).toHaveBeenCalledWith({ data: entries, meta: { count: 1 } });
    expect(next).not.toHaveBeenCalled();
  });

  it('drops non-string filters and forwards service errors', async () => {
    const error = new Error('unavailable');
    vi.mocked(getPublicLeaderboard).mockRejectedValue(error);
    const next = vi.fn();

    await leaderboard({ query: { discipline: ['100m'], season: 2026 } } as unknown as Request, { json: vi.fn() } as unknown as Response, next);

    expect(getPublicLeaderboard).toHaveBeenCalledWith(
      { discipline: undefined, season: undefined, age: undefined, gender: undefined, club: undefined },
      expect.anything(),
    );
    expect(next).toHaveBeenCalledWith(error);
  });
});
