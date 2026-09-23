import { getPool, type DbExecutor } from '../db/client.js';
import {
  DASHBOARD_CARD_IDS,
  DEFAULT_DASHBOARD_CARD_ORDER,
  HIDEABLE_DASHBOARD_CARD_IDS,
  PREFERENCE_SURFACES,
  type DashboardCardId,
  type PreferenceSurface,
  type SavedFilterPreset,
  type UserPreferences,
} from '../types/domain.js';

interface PreferencesRow {
  dashboard_card_order: unknown;
  dashboard_hidden_cards: unknown;
  dashboard_saved_filters: unknown;
}

const KNOWN_CARD_IDS = new Set<string>(DASHBOARD_CARD_IDS);
const HIDEABLE_CARD_IDS = new Set<string>(HIDEABLE_DASHBOARD_CARD_IDS);
const SURFACE_VALUES = new Set<string>(PREFERENCE_SURFACES);

function defaultPreferences(): UserPreferences {
  return {
    dashboardCardOrder: [...DEFAULT_DASHBOARD_CARD_ORDER],
    dashboardHiddenCards: [],
    dashboardSavedFilters: [],
  };
}

function readCardIds(value: unknown, allowed: ReadonlySet<string>): DashboardCardId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const cards: DashboardCardId[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !allowed.has(entry) || seen.has(entry)) continue;
    seen.add(entry);
    cards.push(entry as DashboardCardId);
  }
  return cards;
}

function readSavedFilters(value: unknown): SavedFilterPreset[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const presets: SavedFilterPreset[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const id = row.id;
    const surface = row.surface;
    const name = row.name;
    const filters = row.filters;
    if (
      typeof id !== 'string' || id.trim().length === 0 || id.length > 128 || seen.has(id)
      || typeof surface !== 'string' || !SURFACE_VALUES.has(surface)
      || typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 60
      || typeof filters !== 'object' || filters === null || Array.isArray(filters)
    ) {
      continue;
    }
    seen.add(id);
    presets.push({
      id: id.trim(),
      surface: surface as PreferenceSurface,
      name: name.trim(),
      filters: filters as Record<string, unknown>,
    });
  }
  return presets;
}

function normalizePreferences(row: Partial<PreferencesRow> | undefined): UserPreferences {
  const defaults = defaultPreferences();
  if (!row) return defaults;

  const storedOrder = readCardIds(row.dashboard_card_order, KNOWN_CARD_IDS);
  const orderIndex = new Map(storedOrder.map((card, index) => [card, index] as const));
  const dashboardCardOrder = [...DEFAULT_DASHBOARD_CARD_ORDER].sort((left, right) => {
    const leftIndex = orderIndex.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = orderIndex.get(right) ?? Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return DEFAULT_DASHBOARD_CARD_ORDER.indexOf(left) - DEFAULT_DASHBOARD_CARD_ORDER.indexOf(right);
  });

  const hidden = readCardIds(row.dashboard_hidden_cards, HIDEABLE_CARD_IDS);
  return {
    dashboardCardOrder,
    dashboardHiddenCards: hidden,
    dashboardSavedFilters: readSavedFilters(row.dashboard_saved_filters),
  };
}

export async function getDashboardPreferences(
  userId: string,
  workspaceId: string,
  executor: DbExecutor = getPool(),
): Promise<UserPreferences> {
  const result = await executor.query<PreferencesRow>(
    `SELECT dashboard_card_order, dashboard_hidden_cards, dashboard_saved_filters
     FROM user_preferences
     WHERE user_id = $1 AND workspace_id = $2`,
    [userId, workspaceId],
  );
  return normalizePreferences(result.rows[0]);
}

export async function replaceDashboardPreferences(
  userId: string,
  workspaceId: string,
  preferences: UserPreferences,
  executor: DbExecutor = getPool(),
): Promise<UserPreferences> {
  await executor.query(
    `INSERT INTO user_preferences (user_id, workspace_id, dashboard_card_order, dashboard_hidden_cards, dashboard_saved_filters, updated_at)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, now())
     ON CONFLICT (user_id, workspace_id)
     DO UPDATE SET
       dashboard_card_order = EXCLUDED.dashboard_card_order,
       dashboard_hidden_cards = EXCLUDED.dashboard_hidden_cards,
       dashboard_saved_filters = EXCLUDED.dashboard_saved_filters,
       updated_at = now()`,
    [
      userId,
      workspaceId,
      JSON.stringify(preferences.dashboardCardOrder),
      JSON.stringify(preferences.dashboardHiddenCards),
      JSON.stringify(preferences.dashboardSavedFilters),
    ],
  );
  return preferences;
}
