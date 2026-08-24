import type { NextFunction, Request, Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import { recomputeAndUpsertResult } from '../services/resultRecomputation.js';
import { overrideResult } from './results.js';

vi.mock('../db/client.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../services/resultRecomputation.js', () => ({
  recomputeAndUpsertResult: vi.fn(),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const ATHLETE_ID = '33333333-3333-4333-8333-333333333333';
const TIMESTAMP = new Date('2026-08-17T10:00:00.000Z');
const query = vi.fn();
const release = vi.fn();
const client = { query, release } as unknown as PoolClient;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool);
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('UNION')) {
      return { rows: [{ athlete_id: ATHLETE_ID }] };
    }
    if (sql.includes('SELECT * FROM results')) {
      return {
        rows: [{
          event_id: EVENT_ID,
          athlete_id: ATHLETE_ID,
          discipline: '100m',
          outcome: 'valid',
          final_result: '11.20',
          unit: 'seconds',
          placing: 1,
          is_pb: true,
          is_sb: true,
          manual_override: '11.10',
          override_reason: 'Official correction',
          overridden_by: USER_ID,
          override_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        }],
      };
    }
    return { rows: [] };
  });
});

describe('overrideResult', () => {
  it('locks event then athlete and always updates the 100m result', async () => {
    const request = {
      auth: { userId: USER_ID, auth0Id: 'auth0|coach', role: 'coach' },
      params: { eventId: EVENT_ID, athleteId: ATHLETE_ID },
      body: { manualOverride: 11.1, overrideReason: 'Official correction' },
    } as unknown as Request;
    const json = vi.fn();
    const response = { json } as unknown as Response;
    const next = vi.fn() as NextFunction;

    await overrideResult(request, response, next);

    expect(next).not.toHaveBeenCalled();
    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(statements[0]).toBe('BEGIN');
    expect(statements[1]).toMatch(/FROM events[\s\S]*FOR UPDATE/);
    expect(statements[2]).toMatch(/FROM timeline_entries[\s\S]*UNION[\s\S]*FROM results/);
    expect(statements[3]).toMatch(/FROM athletes[\s\S]*ORDER BY id ASC[\s\S]*FOR UPDATE/);
    expect(statements[4]).toContain('INSERT INTO results');
    expect(query.mock.calls[4]?.[1]).toEqual([
      EVENT_ID,
      ATHLETE_ID,
      '100m',
      11.1,
      'Official correction',
      USER_ID,
    ]);
    expect(recomputeAndUpsertResult).toHaveBeenCalledWith(
      client,
      EVENT_ID,
      ATHLETE_ID,
      '100m',
    );
    expect(json).toHaveBeenCalledWith({ data: expect.objectContaining({ manualOverride: 11.1 }) });
  });
});
