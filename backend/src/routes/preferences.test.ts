import request from 'supertest';
import { jwtVerify } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { getPool } from '../db/client.js';
import * as preferenceService from '../services/preferences.js';
import { DEFAULT_DASHBOARD_CARD_ORDER, type UserPreferences } from '../types/domain.js';

vi.mock('jose', () => ({ createRemoteJWKSet: vi.fn(() => 'keyset'), jwtVerify: vi.fn() }));
vi.mock('../db/client.js', () => ({ getPool: vi.fn(), pool: null }));
vi.mock('../services/preferences.js', () => ({
  getDashboardPreferences: vi.fn(),
  replaceDashboardPreferences: vi.fn(),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const query = vi.fn();
const app = createApp();

const DEFAULT_PREFERENCES: UserPreferences = {
  dashboardCardOrder: [...DEFAULT_DASHBOARD_CARD_ORDER],
  dashboardHiddenCards: [],
  dashboardSavedFilters: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as never);
  process.env.AUTH0_DOMAIN = 'example.auth0.com';
  process.env.AUTH0_AUDIENCE = 'https://api.example.com';
  vi.mocked(jwtVerify).mockResolvedValue({ payload: { sub: 'auth0|user-1' } } as never);
  query.mockResolvedValueOnce({
    rows: [{ user_id: USER_ID, auth0_id: 'auth0|user-1', role: 'coach', deletion_status: null, workspace_id: WORKSPACE_ID, workspace_role: 'assistant' }],
  });
});

describe('preferences routes', () => {
  it('returns preferences for the active application user without requiring coach', async () => {
    vi.mocked(preferenceService.getDashboardPreferences).mockResolvedValue(DEFAULT_PREFERENCES);

    const response = await request(app).get('/api/v1/preferences').set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: DEFAULT_PREFERENCES });
    expect(preferenceService.getDashboardPreferences).toHaveBeenCalledWith(USER_ID, WORKSPACE_ID);
  });

  it('accepts a full-replacement PUT from an assistant', async () => {
    const payload: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      dashboardHiddenCards: ['pb-trend'],
      dashboardSavedFilters: [{ id: 'p1', surface: 'dashboard', name: 'Home', filters: {} }],
    };
    vi.mocked(preferenceService.replaceDashboardPreferences).mockResolvedValue(payload);

    const response = await request(app)
      .put('/api/v1/preferences')
      .set('Authorization', 'Bearer valid')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: payload });
    expect(preferenceService.replaceDashboardPreferences).toHaveBeenCalledWith(USER_ID, WORKSPACE_ID, payload);
  });

  it('rejects an invalid body with validation issues', async () => {
    const response = await request(app)
      .put('/api/v1/preferences')
      .set('Authorization', 'Bearer valid')
      .send({ dashboardCardOrder: [] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(preferenceService.replaceDashboardPreferences).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    const response = await request(app).get('/api/v1/preferences');
    expect(response.status).toBe(401);
  });
});
