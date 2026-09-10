import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import * as publicStatisticsService from '../services/publicStatistics.js';

vi.mock('../services/publicStatistics.js', () => ({
  getPublicClubStatistics: vi.fn(),
  listPublicClubs: vi.fn(),
}));

const CLUB_ID = '33333333-3333-4333-8333-333333333333';
const app = createApp();

beforeEach(() => vi.clearAllMocks());

describe('public statistics routes', () => {
  it('lists only the clubs supplied by the public service without authentication', async () => {
    vi.mocked(publicStatisticsService.listPublicClubs).mockResolvedValue([{ id: CLUB_ID, name: 'Open Track Club' }]);

    const response = await request(app).get('/api/v1/public/statistics/clubs?q=track');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [{ id: CLUB_ID, name: 'Open Track Club' }], meta: { count: 1 } });
    expect(publicStatisticsService.listPublicClubs).toHaveBeenCalledWith('track');
  });

  it('returns a sanitised public club performance detail without authentication', async () => {
    vi.mocked(publicStatisticsService.getPublicClubStatistics).mockResolvedValue({
      club: { id: CLUB_ID, name: 'Open Track Club' },
      roster: { active: 2, inactive: 0, archived: 0, total: 2 },
      distinctAthletesWithValidResults: 2,
      total100mResultCount: 5,
      valid100mResultCount: 5,
      fastestValidTime: 10.91,
      latestValidTime: 11.22,
      averageValidTime: 11.4,
      medianValidTime: 11.35,
      populationStandardDeviation: 0.18,
      athletes: [{ athlete: { id: '44444444-4444-4444-8444-444444444444', name: 'Ari Runner' }, pb: 10.91, latestEffectiveResult: 11.02, validResultCount: 3, totalResultCount: 3, average: 11.1, consistency: 0.13, improvement: 0.24 }],
    });

    const response = await request(app).get(`/api/v1/public/statistics/clubs/${CLUB_ID}`);

    expect(response.status).toBe(200);
    expect(response.body.data.athletes[0]).toEqual(expect.objectContaining({ athlete: { id: '44444444-4444-4444-8444-444444444444', name: 'Ari Runner' }, pb: 10.91 }));
    expect(publicStatisticsService.getPublicClubStatistics).toHaveBeenCalledWith(CLUB_ID);
  });
});
