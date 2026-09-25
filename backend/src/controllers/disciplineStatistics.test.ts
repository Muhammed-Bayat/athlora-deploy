import express from 'express';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
import { getDisciplineStatistics } from './statistics.js';
import publicRouter from '../routes/publicStatistics.js';
import { disciplineAthleteStatistics } from '../services/disciplineStatistics.js';
import { errorHandler } from '../middleware/errors.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const athleteId = '22222222-2222-4222-8222-222222222222';
const clubId = '33333333-3333-4333-8333-333333333333';
const query = vi.hoisted(() => vi.fn());
vi.mock('../middleware/auth.js', () => ({ getApplicationUserContext: () => ({ workspaceId }) }));
vi.mock('../db/client.js', () => ({ getPool: () => ({ query }) }));
vi.mock('../services/disciplineStatistics.js', () => ({ disciplineAthleteStatistics: vi.fn() }));
const app = express();
app.get('/athletes/:id/statistics/disciplines', getDisciplineStatistics);
app.get('/dashboard/disciplines', getDisciplineStatistics);
app.use('/public', publicRouter);
app.use(errorHandler);
beforeEach(() => { vi.clearAllMocks(); vi.mocked(disciplineAthleteStatistics).mockResolvedValue([]); });

it('routes athlete detail and dashboard/leaderboard consumers to the same finalized statistics', async () => {
  expect((await request(app).get(`/athletes/${athleteId}/statistics/disciplines?year=2026`)).body).toEqual({ data: [] });
  expect(disciplineAthleteStatistics).toHaveBeenLastCalledWith(expect.anything(), workspaceId, athleteId, 2026);
  expect((await request(app).get('/dashboard/disciplines?year=2025')).status).toBe(200);
  expect(disciplineAthleteStatistics).toHaveBeenLastCalledWith(expect.anything(), workspaceId, null, 2025);
});
it('requires club publication for public reports and returns the same discipline-aware statistics', async () => {
  query.mockResolvedValueOnce({ rows: [] });
  expect((await request(app).get(`/public/clubs/${clubId}/disciplines?year=2026`)).status).toBe(404);
  expect(disciplineAthleteStatistics).not.toHaveBeenCalled();
  query.mockResolvedValueOnce({ rows: [{ workspace_id: workspaceId }] });
  expect((await request(app).get(`/public/clubs/${clubId}/disciplines?year=2026`)).body).toEqual({ data: [] });
  expect(disciplineAthleteStatistics).toHaveBeenCalledWith(expect.anything(), workspaceId, null, 2026);
});
