import { useState } from 'react';
import { ConsoleDialog } from './ConsoleDialog';
import {
  DASHBOARD_CARDS,
  isHideableCard,
  moveCardOrder,
} from './dashboardCards';
import type { DashboardCardId, UserPreferences } from '../../types';
import styles from './DashboardPage.module.css';

export interface CustomizeDashboardDialogProps {
  preferences: UserPreferences;
  saving: boolean;
  error: string | null;
  onSave: (next: UserPreferences) => Promise<boolean> | boolean;
  onReset: () => Promise<boolean> | boolean;
  onClose: () => void;
}

export function CustomizeDashboardDialog({
  preferences,
  saving,
  error,
  onSave,
  onReset,
  onClose,
}: CustomizeDashboardDialogProps) {
  const [order, setOrder] = useState<DashboardCardId[]>([...preferences.dashboardCardOrder]);
  const [hidden, setHidden] = useState<DashboardCardId[]>([...preferences.dashboardHiddenCards]);
  const [message, setMessage] = useState<string | null>(null);
  const hiddenSet = new Set(hidden);

  const toggleHidden = (id: DashboardCardId) => {
    setMessage(null);
    setHidden((current) => (
      current.includes(id) ? current.filter((card) => card !== id) : [...current, id]
    ));
  };

  const move = (id: DashboardCardId, direction: -1 | 1) => {
    setMessage(null);
    setOrder((current) => moveCardOrder(current, id, direction));
  };

  const handleSave = async () => {
    const ok = await onSave({
      dashboardCardOrder: order,
      dashboardHiddenCards: hidden,
      dashboardSavedFilters: preferences.dashboardSavedFilters,
    });
    setMessage(ok ? 'Dashboard preferences saved.' : null);
  };

  const handleReset = async () => {
    const ok = await onReset();
    if (ok) {
      setOrder(DASHBOARD_CARDS.map((card) => card.id));
      setHidden([]);
      setMessage('Dashboard restored to defaults.');
    }
  };

  return (
    <ConsoleDialog
      title="Customize dashboard"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className={styles.dialogSecondary} onClick={() => { void handleReset(); }} disabled={saving}>
            Reset to defaults
          </button>
          <button type="button" className={styles.dialogPrimary} onClick={() => { void handleSave(); }} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </>
      )}
    >
      <p className={styles.dialogLead}>
        Reorder cards and hide optional sections. Required cards always stay visible.
      </p>
      {error && <p className={styles.dialogError} role="alert">{error}</p>}
      {message && <p className={styles.dialogSuccess} role="status">{message}</p>}
      <ul className={styles.customizeList}>
        {order.map((id, index) => {
          const meta = DASHBOARD_CARDS.find((card) => card.id === id);
          if (!meta) return null;
          const hideable = isHideableCard(id);
          return (
            <li key={id} className={styles.customizeRow}>
              <div className={styles.customizeMeta}>
                <strong>{meta.label}</strong>
                <small>{meta.description}</small>
              </div>
              <div className={styles.customizeControls}>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => move(id, -1)}
                  disabled={index === 0 || saving}
                  aria-label={`Move ${meta.label} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => move(id, 1)}
                  disabled={index === order.length - 1 || saving}
                  aria-label={`Move ${meta.label} down`}
                >
                  ↓
                </button>
                {hideable ? (
                  <label className={styles.hideToggle}>
                    <input
                      type="checkbox"
                      checked={!hiddenSet.has(id)}
                      onChange={() => toggleHidden(id)}
                      disabled={saving}
                    />
                    <span>Show</span>
                  </label>
                ) : (
                  <span className={styles.requiredBadge}>Always shown</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </ConsoleDialog>
  );
}
