import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ getPool: vi.fn() }));

import { getPool } from '../db/client.js';
import {
  DEFAULT_DASHBOARD_CARD_ORDER,
  type UserPreferences,
} from '../types/domain.js';
import { getDashboardPreferences, replaceDashboardPreferences } from './preferences.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const query = vi.fn();

const DEFAULTS: UserPreferences = {
  dashboardCardOrder: [...DEFAULT_DASHBOARD_CARD_ORDER],
  dashboardHiddenCards: [],
  dashboardSavedFilters: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as unknown as ReturnType<typeof getPool>);
});

describe('user preferences service', () => {
  it('returns product defaults when no row exists', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(getDashboardPreferences(USER_ID, WORKSPACE_ID)).resolves.toEqual(DEFAULTS);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM user_preferences'),
      [USER_ID, WORKSPACE_ID],
    );
  });

  it('strips unknown card ids and reinserts missing known cards on read', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        dashboard_card_order: ['hero', 'retired-card', 'season-selector'],
        dashboard_hidden_cards: ['pb-trend', 'ghost-card', 'hero'],
        dashboard_saved_filters: [{ id: 'a', surface: 'dashboard', name: 'A', filters: {} }],
      }],
    });

    const preferences = await getDashboardPreferences(USER_ID, WORKSPACE_ID);
    const order = preferences.dashboardCardOrder;
    expect(order).not.toContain('retired-card');
    expect(order[0]).toBe('hero');
    expect(order[1]).toBe('season-selector');
    for (const card of DEFAULT_DASHBOARD_CARD_ORDER) {
      expect(order).toContain(card);
    }
    expect(preferences.dashboardHiddenCards).toEqual(['pb-trend']);
    expect(preferences.dashboardSavedFilters).toEqual([
      { id: 'a', surface: 'dashboard', name: 'A', filters: {} },
    ]);
  });

  it('upserts a full replacement scoped to the user and workspace', async () => {
    const payload: UserPreferences = {
      ...DEFAULTS,
      dashboardCardOrder: ['stats', ...DEFAULT_DASHBOARD_CARD_ORDER.filter((id) => id !== 'stats')],
      dashboardHiddenCards: ['recent-pbs'],
      dashboardSavedFilters: [{ id: 'p1', surface: 'events', name: 'Upcoming', filters: { status: 'scheduled' } }],
    };
    query.mockResolvedValueOnce({ rows: [{}] });

    await expect(replaceDashboardPreferences(USER_ID, WORKSPACE_ID, payload)).resolves.toEqual(payload);
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO user_preferences');
    expect(sql).toContain('ON CONFLICT (user_id, workspace_id)');
    expect(sql).toContain('updated_at = now()');
    expect(parameters).toEqual([
      USER_ID,
      WORKSPACE_ID,
      JSON.stringify(payload.dashboardCardOrder),
      JSON.stringify(payload.dashboardHiddenCards),
      JSON.stringify(payload.dashboardSavedFilters),
    ]);
  });

  it('returns the stored row after a successful upsert', async () => {
    const stored: UserPreferences = {
      ...DEFAULTS,
      dashboardHiddenCards: ['stats'],
      dashboardSavedFilters: [{ id: 'p1', surface: 'dashboard', name: 'Home', filters: { year: '2026' } }],
    };
    query.mockResolvedValueOnce({
      rows: [{
        dashboard_card_order: stored.dashboardCardOrder,
        dashboard_hidden_cards: stored.dashboardHiddenCards,
        dashboard_saved_filters: stored.dashboardSavedFilters,
      }],
    });

    await expect(replaceDashboardPreferences(USER_ID, WORKSPACE_ID, stored)).resolves.toEqual(stored);
  });
});
