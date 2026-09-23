import { useState } from 'react';
import type { SavedFilterPreset, UserPreferences } from '../../types';
import { normalizeSeason, type SeasonValue } from '../../utils/season';
import styles from './DashboardPage.module.css';

export interface SavedDashboardFiltersProps {
  preferences: UserPreferences;
  season: string;
  saving: boolean;
  onApply: (season: SeasonValue) => void;
  onSaveCurrent: (name: string) => Promise<boolean>;
  onDelete: (presetId: string) => Promise<boolean>;
}

function presetSeason(preset: SavedFilterPreset): SeasonValue {
  const value = preset.filters.season;
  return typeof value === 'string' && value ? normalizeSeason(value) : normalizeSeason(null);
}

export function SavedDashboardFilters({
  preferences,
  season,
  saving,
  onApply,
  onSaveCurrent,
  onDelete,
}: SavedDashboardFiltersProps) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const presets = preferences.dashboardSavedFilters.filter((preset) => preset.surface === 'dashboard');

  const saveCurrent = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setMessage('Enter a name for this view.');
      return;
    }
    const ok = await onSaveCurrent(trimmed);
    if (ok) {
      setName('');
      setMessage('View saved.');
    }
  };

  return (
    <section className={styles.savedFilters} aria-label="Saved dashboard views">
      <div className={styles.savedFiltersList}>
        {presets.length === 0 ? (
          <p className={styles.emptyCopy}>No saved views yet.</p>
        ) : (
          <ul className={styles.presetChips}>
            {presets.map((preset) => (
              <li key={preset.id}>
                <button
                  type="button"
                  className={styles.presetChip}
                  onClick={() => { onApply(presetSeason(preset)); setMessage(null); }}
                  disabled={saving}
                >
                  {preset.name}
                </button>
                <button
                  type="button"
                  className={styles.presetDelete}
                  onClick={() => { void onDelete(preset.id); }}
                  aria-label={`Delete saved view ${preset.name}`}
                  disabled={saving}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={styles.savedFiltersForm}>
        <label className={styles.srOnly} htmlFor="save-dashboard-view">Save current view</label>
        <input
          id="save-dashboard-view"
          type="text"
          value={name}
          maxLength={60}
          placeholder="Name this view"
          onChange={(event) => { setName(event.target.value); setMessage(null); }}
          disabled={saving}
        />
        <button type="button" onClick={() => { void saveCurrent(); }} disabled={saving}>
          Save view
        </button>
      </div>
      {message && <p className={styles.dialogSuccess} role="status">{message}</p>}
      <p className={styles.srOnly}>Current season scope: {season}</p>
    </section>
  );
}
