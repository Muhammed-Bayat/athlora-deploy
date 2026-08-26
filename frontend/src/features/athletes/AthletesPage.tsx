import { useDeferredValue, useEffect, useRef, useState } from 'react';
import {
  archiveAthlete,
  createAthlete,
  listAthletes,
  unarchiveAthlete,
  updateAthlete,
} from '../../api/athletes';
import { Button, Card, EmptyState, Modal, Select, Toast } from '../../components';
import type { Athlete, AthleteMutationPayload } from '../../types';
import { AthleteDetailPage } from './AthleteDetailPage';
import { AthleteForm } from './AthleteForm';
import { athleteErrorMessage as errorMessage } from './athleteError';
import { useWorkspace } from '../auth/WorkspaceContext';
import styles from './AthletesPage.module.css';

type ArchiveFilter = 'active' | 'archived' | 'all';
type Editor = 'new' | Athlete | null;

export interface AthletesPageProps {
  onActiveCountChange?: (count: number) => void;
  initialAthleteId?: string | null;
}

function sorted(athletes: Athlete[]): Athlete[] {
  return [...athletes].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function formatDate(value: string | null): string {
  if (!value) return 'DOB not recorded';
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function AthletesPage({ onActiveCountChange, initialAthleteId = null }: AthletesPageProps = {}) {
  const { activeWorkspace } = useWorkspace();
  const isCoach = activeWorkspace.role === 'coach';
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [squad, setSquad] = useState('');
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('active');
  const [editor, setEditor] = useState<Editor>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Athlete | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(initialAthleteId);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const performanceButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const returnFocusAthleteId = useRef<string | null>(null);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError(null);
    void listAthletes({ includeArchived: true })
      .then(({ data }) => {
        if (!current) return;
        const next = sorted(data);
        setAthletes(next);
      })
      .catch((error: unknown) => {
        if (current) setLoadError(errorMessage(error));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!loading && !loadError) {
      onActiveCountChange?.(athletes.filter((athlete) => athlete.archivedAt === null).length);
    }
  }, [athletes, loadError, loading, onActiveCountChange]);

  useEffect(() => {
    if (selectedAthleteId !== null || returnFocusAthleteId.current === null) return;
    const athleteId = returnFocusAthleteId.current;
    returnFocusAthleteId.current = null;
    window.setTimeout(() => performanceButtonRefs.current.get(athleteId)?.focus(), 0);
  }, [selectedAthleteId]);

  const storeAthlete = (athlete: Athlete) => {
    setAthletes((current) => {
      const next = sorted([...current.filter((item) => item.id !== athlete.id), athlete]);
      return next;
    });
  };

  const activeQuery = deferredQuery.trim().toLowerCase();
  const visible = athletes.filter((athlete) => {
    const archiveMatches =
      archiveFilter === 'all' ||
      (archiveFilter === 'active' ? athlete.archivedAt === null : athlete.archivedAt !== null);
    const queryMatches = !activeQuery || athlete.name.toLowerCase().includes(activeQuery);
    const squadMatches = !squad || athlete.squad === squad;
    return archiveMatches && queryMatches && squadMatches;
  });
  const squads = [...new Set(athletes.map((athlete) => athlete.squad).filter((value): value is string => Boolean(value)))].sort();
  const hasFilters = Boolean(query || squad || archiveFilter !== 'active');

  const saveEditor = async (payload: AthleteMutationPayload) => {
    const athlete = editor === 'new'
      ? await createAthlete(payload)
      : await updateAthlete(editor!.id, payload);
    storeAthlete(athlete);
    setEditor(null);
    setNotice(editor === 'new' ? `${athlete.name} added to the roster.` : `${athlete.name} updated.`);
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    setPendingId(archiveTarget.id);
    setActionError(null);
    try {
      const archived = await archiveAthlete(archiveTarget.id);
      storeAthlete(archived);
      setArchiveTarget(null);
      setNotice(`${archived.name} archived. Their event history is preserved.`);
      window.setTimeout(() => addButtonRef.current?.focus(), 0);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setPendingId(null);
    }
  };

  const restore = async (athlete: Athlete) => {
    setPendingId(athlete.id);
    setActionError(null);
    try {
      const restored = await unarchiveAthlete(athlete.id);
      storeAthlete(restored);
      setNotice(`${restored.name} restored to the active roster.`);
      window.setTimeout(() => addButtonRef.current?.focus(), 0);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setPendingId(null);
    }
  };

  const clearFilters = () => {
    setQuery('');
    setSquad('');
    setArchiveFilter('active');
  };

  if (selectedAthleteId) {
    return (
      <AthleteDetailPage
        athleteId={selectedAthleteId}
        onBack={() => {
          returnFocusAthleteId.current = selectedAthleteId;
          setSelectedAthleteId(null);
        }}
        onAthleteUpdated={storeAthlete}
      />
    );
  }

  return (
    <section aria-labelledby="athletes-heading" aria-busy={loading}>
      <header className={styles.viewHeader}>
        <div>
          <p className={styles.eyebrow}>Coach-owned roster</p>
          <h1 id="athletes-heading">Athletes</h1>
          <p>{loading ? 'Loading roster...' : `${visible.length} athlete${visible.length === 1 ? '' : 's'} shown`}</p>
        </div>
        <div className={styles.controls}>
          <label className={styles.search}>
            <span aria-hidden="true">⌕</span>
            <span className={styles.srOnly}>Search athletes by name</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search athletes..." />
          </label>
          <label className={styles.srOnly} htmlFor="squad-filter">Filter by squad</label>
          <Select
            id="squad-filter"
            icon="squad"
            value={squad}
            onChange={(event) => setSquad(event.target.value)}
            options={[{ value: '', label: 'All squads' }, ...squads.map((value) => ({ value, label: value }))]}
          />
          <label className={styles.srOnly} htmlFor="archive-filter">Filter by roster status</label>
          <Select
            id="archive-filter"
            icon="status"
            dotColors={{ active: '#0092BC', archived: '#6B8792' }}
            value={archiveFilter}
            onChange={(event) => setArchiveFilter(event.target.value as ArchiveFilter)}
            options={[
              { value: 'active', label: 'Active roster' },
              { value: 'archived', label: 'Archived' },
              { value: 'all', label: 'All athletes' },
            ]}
          />
          {isCoach && <Button
            ref={addButtonRef}
            onClick={() => setEditor('new')}
            disabled={loading || Boolean(loadError) || pendingId !== null}
          >
            Add athlete
          </Button>}
        </div>
      </header>

      {notice && <Toast variant="success" onDismiss={() => setNotice(null)}>{notice}</Toast>}
      {actionError && !archiveTarget && <div className={styles.actionError} role="alert">{actionError}</div>}

      {loading && (
        <div className={styles.loading} role="status" aria-live="polite">
          <span /> <span /> <span />
          <p>Loading your roster...</p>
        </div>
      )}

      {!loading && loadError && (
        <div className={styles.loadError} role="alert">
          <h2>Roster unavailable</h2>
          <p>{loadError}</p>
          <Button onClick={() => setReloadKey((value) => value + 1)}>Try again</Button>
        </div>
      )}

      {!loading && !loadError && athletes.length === 0 && (
        <div className={styles.emptyPanel}>
          <EmptyState title="No athletes yet" description="Add your first athlete to start building the roster." />
           {isCoach && <Button onClick={() => setEditor('new')}>Add your first athlete</Button>}
        </div>
      )}

      {!loading && !loadError && athletes.length > 0 && visible.length === 0 && (
        <div className={styles.emptyPanel}>
          <EmptyState
            title={
              !query && !squad && archiveFilter === 'active'
                ? 'No active athletes'
                : !query && !squad && archiveFilter === 'archived'
                  ? 'No archived athletes'
                  : 'No athletes match your filters'
            }
            description="Adjust the roster filters or clear them to see more athletes."
          />
          {hasFilters && <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>}
        </div>
      )}

      {!loading && !loadError && visible.length > 0 && (
        <div className={styles.grid} aria-label="Athlete roster">
          {visible.map((athlete) => (
            <Card className={styles.card} key={athlete.id}>
              <div className={styles.cardTop}>
                <span className={styles.avatar} aria-hidden="true">{initials(athlete.name)}</span>
                <span className={athlete.archivedAt ? styles.archivedBadge : styles.activeBadge}>
                  {athlete.archivedAt ? 'Archived' : 'Active'}
                </span>
              </div>
              <h2>{athlete.name}</h2>
              <p className={styles.squad}>{athlete.squad ?? 'No squad assigned'}</p>
              <dl className={styles.details}>
                <div><dt>Date of birth</dt><dd>{formatDate(athlete.dob)}</dd></div>
                <div><dt>Gender category</dt><dd>{athlete.gender ?? 'Not recorded'}</dd></div>
              </dl>
              {athlete.notes && <p className={styles.notes}>{athlete.notes}</p>}
              <div className={styles.cardActions}>
                <Button
                  ref={(node) => {
                    if (node) performanceButtonRefs.current.set(athlete.id, node);
                    else performanceButtonRefs.current.delete(athlete.id);
                  }}
                  className={styles.performanceAction}
                  onClick={() => setSelectedAthleteId(athlete.id)}
                  disabled={pendingId !== null}
                >
                  View performance
                </Button>
                {isCoach && <Button
                  variant="secondary"
                  onClick={() => setEditor(athlete)}
                  disabled={pendingId !== null}
                >
                  Edit
                </Button>}
                {isCoach && (athlete.archivedAt ? (
                  <Button onClick={() => void restore(athlete)} disabled={pendingId !== null}>
                    {pendingId === athlete.id ? 'Restoring...' : 'Restore'}
                  </Button>
                ) : (
                  <Button
                    variant="danger"
                    onClick={() => setArchiveTarget(athlete)}
                    disabled={pendingId !== null}
                  >
                    Archive
                  </Button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={editor !== null}
        title={editor === 'new' ? 'Add athlete' : 'Edit athlete'}
        onClose={() => {
          if (!editorBusy) setEditor(null);
        }}
        closeDisabled={editorBusy}
      >
        {editor && (
          <AthleteForm
            key={editor === 'new' ? 'new' : editor.id}
            athlete={editor === 'new' ? undefined : editor}
            onSave={saveEditor}
            onCancel={() => setEditor(null)}
            onSubmittingChange={setEditorBusy}
          />
        )}
      </Modal>

      <Modal
        open={archiveTarget !== null}
        title="Archive athlete"
        onClose={() => {
          setArchiveTarget(null);
          setActionError(null);
        }}
        closeDisabled={pendingId === archiveTarget?.id}
      >
        {archiveTarget && (
          <div className={styles.confirmation}>
            <p>
              Archive <strong>{archiveTarget.name}</strong>? They will leave the active roster,
              but their event assignments, timeline entries, and results will be preserved.
              You can restore them later.
            </p>
            {actionError && <p className={styles.formError} role="alert">{actionError}</p>}
            <div className={styles.formActions}>
              <Button variant="secondary" onClick={() => setArchiveTarget(null)} disabled={pendingId === archiveTarget.id}>Cancel</Button>
              <Button variant="danger" onClick={() => void confirmArchive()} disabled={pendingId === archiveTarget.id}>
                {pendingId === archiveTarget.id ? 'Archiving...' : 'Archive athlete'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
