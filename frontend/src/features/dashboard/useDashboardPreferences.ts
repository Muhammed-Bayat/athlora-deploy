import { useCallback, useEffect, useRef, useState } from 'react';
import { getDashboardPreferences, putDashboardPreferences } from '../../api/preferences';
import type { DashboardCardId, SavedFilterPreset, UserPreferences } from '../../types';
import {
  defaultUserPreferences,
  normalizeCardOrder,
  normalizeHiddenCards,
} from './dashboardCards';

function normalizePreferences(value: UserPreferences): UserPreferences {
  return {
    dashboardCardOrder: normalizeCardOrder(value.dashboardCardOrder),
    dashboardHiddenCards: normalizeHiddenCards(value.dashboardHiddenCards),
    dashboardSavedFilters: Array.isArray(value.dashboardSavedFilters)
      ? value.dashboardSavedFilters.filter((preset): preset is SavedFilterPreset => (
        typeof preset?.id === 'string'
        && typeof preset?.name === 'string'
        && typeof preset?.surface === 'string'
        && typeof preset?.filters === 'object'
        && preset.filters !== null
      ))
      : [],
  };
}

export interface UseDashboardPreferencesResult {
  preferences: UserPreferences;
  ready: boolean;
  saving: boolean;
  error: string | null;
  save: (next: UserPreferences) => Promise<boolean>;
  reset: () => Promise<boolean>;
}

export function useDashboardPreferences(): UseDashboardPreferencesResult {
  const [preferences, setPreferences] = useState<UserPreferences>(() => defaultUserPreferences());
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    let cancelled = false;
    void getDashboardPreferences().then((value) => {
      if (cancelled || id !== requestId.current) return;
      setPreferences(normalizePreferences(value));
      setReady(true);
      setError(null);
    }).catch(() => {
      if (cancelled || id !== requestId.current) return;
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  const persist = useCallback(async (next: UserPreferences) => {
    const id = ++requestId.current;
    setSaving(true);
    setError(null);
    try {
      const saved = await putDashboardPreferences(next);
      if (id !== requestId.current) return false;
      setPreferences(normalizePreferences(saved));
      return true;
    } catch {
      if (id !== requestId.current) return false;
      setError('Could not save dashboard preferences. Please try again.');
      return false;
    } finally {
      if (id === requestId.current) setSaving(false);
    }
  }, []);

  const save = useCallback(async (next: UserPreferences) => persist(next), [persist]);
  const reset = useCallback(async () => persist(defaultUserPreferences()), [persist]);

  return { preferences, ready, saving, error, save, reset };
}

export function visibleCards(
  order: readonly DashboardCardId[],
  hidden: readonly DashboardCardId[],
): DashboardCardId[] {
  const hiddenSet = new Set(hidden);
  return order.filter((card) => !hiddenSet.has(card));
}
