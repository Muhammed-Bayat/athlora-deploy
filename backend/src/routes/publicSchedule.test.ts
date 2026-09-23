import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { ApiError } from '../middleware/errors.js';
import * as publicScheduleService from '../services/publicSchedule.js';

vi.mock('../services/publicSchedule.js', () => ({
  getPublicClubSchedule: vi.fn(),
  listPublicScheduleClubs: vi.fn(),
}));

const CLUB_ID = '33333333-3333-4333-8333-333333333333';
const app = createApp();

beforeEach(() => vi.clearAllMocks());

describe('public schedule routes', () => {
  it('lists only the clubs supplied by the public schedule service without authentication', async () => {
    vi.mocked(publicScheduleService.listPublicScheduleClubs).mockResolvedValue([{
      id: CLUB_ID,
      name: 'Open Track Club',
      branding: {
        description: null,
        primaryColor: null,
        accentColor: null,
        logoUrl: null,
        coverUrl: null,
      },
    }]);

    const response = await request(app).get('/api/v1/public/schedule/clubs?q=track');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [{
        id: CLUB_ID,
        name: 'Open Track Club',
        branding: {
          description: null,
          primaryColor: null,
          accentColor: null,
          logoUrl: null,
          coverUrl: null,
        },
      }],
      meta: { count: 1 },
    });
    expect(publicScheduleService.listPublicScheduleClubs).toHaveBeenCalledWith('track');
  });

  it('returns an upcoming club schedule without authentication', async () => {
    vi.mocked(publicScheduleService.getPublicClubSchedule).mockResolvedValue({
      club: {
        id: CLUB_ID,
        name: 'Open Track Club',
        branding: {
          description: null,
          primaryColor: null,
          accentColor: null,
          logoUrl: null,
          coverUrl: null,
        },
      },
      events: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          title: 'Spring Open',
          date: '2026-10-01',
          time: '10:00:00',
          type: 'competition',
          discipline: '100m',
          locationName: 'City Track',
          status: 'scheduled',
        },
      ],
    });

    const response = await request(app).get(`/api/v1/public/schedule/clubs/${CLUB_ID}`);

    expect(response.status).toBe(200);
    expect(response.body.data.club).toEqual({
      id: CLUB_ID,
      name: 'Open Track Club',
      branding: {
        description: null,
        primaryColor: null,
        accentColor: null,
        logoUrl: null,
        coverUrl: null,
      },
    });
    expect(response.body.data.events[0]).toEqual(expect.objectContaining({ title: 'Spring Open', date: '2026-10-01' }));
    expect(publicScheduleService.getPublicClubSchedule).toHaveBeenCalledWith(CLUB_ID);
  });

  it('propagates the generic 404 for unknown or unpublished clubs', async () => {
    vi.mocked(publicScheduleService.getPublicClubSchedule).mockRejectedValue(
      new ApiError(404, 'NOT_FOUND', 'Resource not found'),
    );

    const response = await request(app).get(`/api/v1/public/schedule/clubs/${CLUB_ID}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
