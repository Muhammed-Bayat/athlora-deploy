import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import * as dbClient from '../db/client.js';
import * as reportService from '../services/publicStatisticsReport.js';

vi.mock('../services/publicStatisticsReport.js', () => ({ getPublicStatisticsReport: vi.fn() }));
vi.mock('../db/client.js', () => ({ getPool: vi.fn() }));

describe('public statistics report route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns report data without authentication and forwards filters', async () => {
    vi.mocked(dbClient.getPool).mockReturnValue({} as never);
    vi.mocked(reportService.getPublicStatisticsReport).mockResolvedValue([]);
    const response = await request(createApp()).get('/api/v1/public/statistics/report?discipline=100m&season=2026');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta.count).toBe(0);
    expect(reportService.getPublicStatisticsReport).toHaveBeenCalledWith(expect.objectContaining({ discipline: '100m', season: '2026' }), expect.anything());
  });
});
