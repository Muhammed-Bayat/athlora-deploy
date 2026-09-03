import { useEffect, useState } from 'react';
import { Button } from '../../components';
import { ActiveInjuries } from './ActiveInjuries';
import { BodyViewer } from './BodyViewer';
import { InjuryEditor } from './InjuryEditor';
import type { Injury, InjuryDraft } from './injuryRegions';
import { listInjuries, createInjury, resolveInjury, reopenInjury, deleteInjury } from '../../api/injuries';
import styles from './FitnessView.module.css';

interface FitnessViewProps {
  athleteId: string;
  athleteName: string;
  athleteSquad: string | null;
  athleteStatus: string;
  isCoach: boolean;
  onBack: () => void;
  onSetInactive: () => void;
}

export function FitnessView({
  athleteId,
  athleteName,
  athleteSquad,
  athleteStatus,
  isCoach,
  onBack,
  onSetInactive,
}: FitnessViewProps) {
  const [injuries, setInjuries] = useState<Injury[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [preview, setPreview] = useState<InjuryDraft | null>(null);

  const isArchived = athleteStatus === 'archived';

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    listInjuries(athleteId)
      .then((data) => {
        if (current) setInjuries(data);
      })
      .catch((err: unknown) => {
        if (current) setError(err instanceof Error ? err.message : 'Failed to load injuries');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [athleteId, retry]);

  const handleAdd = async (payload: {
    bodyRegion: string;
    area: string;
    side: string;
    severity: string;
    notes: string | null;
    occurrenceDate: string | null;
    expectedReturnDate: string | null;
  }) => {
    try {
      const created = await createInjury(athleteId, payload);
      setInjuries((prev) => [created, ...prev]);
      setPreview(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save injury');
    }
  };

  const handleResolve = async (id: string, notes?: string) => {
    try {
      const resolved = await resolveInjury(athleteId, id, { resolutionNotes: notes });
      setInjuries((prev) => prev.map((inj) => (inj.id === id ? resolved : inj)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resolve injury');
    }
  };

  const handleReopen = async (id: string) => {
    try {
      const reopened = await reopenInjury(athleteId, id);
      setInjuries((prev) => prev.map((inj) => (inj.id === id ? reopened : inj)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reopen injury');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteInjury(athleteId, id);
      setInjuries((prev) => prev.filter((inj) => inj.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete injury');
    }
  };

  const hasSevereActive = injuries.some((inj) => !inj.resolvedDate && !inj.deletedAt && inj.severity === 'Severe');
  const initials = athleteName.split(/\s+/).filter(Boolean).slice(0, 2).map((name) => name[0]).join('').toUpperCase();

  return (
    <section className={styles.fitness} aria-labelledby="fitness-heading">
      <header className={styles.header}>
        <div className={styles.headerIdentity}>
          <span aria-hidden="true">{initials}</span>
          <div>
            <p className={styles.eyebrow}>Athlete performance</p>
            <h1 id="fitness-heading">Fitness & injury map</h1>
            <small>{athleteName} · {athleteSquad ?? 'Athletics'} squad</small>
          </div>
        </div>
        <div className={styles.headerActions}>
          <span>{injuries.filter((i) => !i.resolvedDate && !i.deletedAt).length} active injuries</span>
          <Button variant="secondary" onClick={onBack}>Back to performance</Button>
        </div>
      </header>

      {isArchived && (
        <div className={styles.warningBanner} role="status">
          <p><strong>Archived athlete:</strong> Injury records are read-only.</p>
        </div>
      )}

      {hasSevereActive && athleteStatus !== 'inactive' && (
        <div className={styles.severeWarningBanner} role="alert">
          <p><strong>Warning:</strong> Severe injury recorded. This athlete may need to be set inactive.</p>
          <Button onClick={onSetInactive}>Set inactive</Button>
        </div>
      )}

      {error && (
        <div className={styles.errorBanner} role="alert">
          <p>{error}</p>
          <Button onClick={() => setRetry((c) => c + 1)}>Retry</Button>
        </div>
      )}

      {loading ? (
        <p className={styles.loadingState} role="status">Loading injury history...</p>
      ) : (
        <div className={styles.layout}>
          {isCoach && !isArchived && (
            <InjuryEditor onPreview={setPreview} onSave={handleAdd} />
          )}
          <BodyViewer injuries={injuries.filter((i) => !i.resolvedDate && !i.deletedAt)} preview={preview} />
          <ActiveInjuries
            injuries={injuries}
            isCoach={isCoach}
            isArchived={isArchived}
            onResolve={handleResolve}
            onReopen={handleReopen}
            onDelete={handleDelete}
          />
        </div>
      )}
    </section>
  );
}
