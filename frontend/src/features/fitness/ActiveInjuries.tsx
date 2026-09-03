import { useState } from 'react';
import { injuryLabel, type Injury } from './injuryRegions';
import { Button } from '../../components';
import styles from './FitnessView.module.css';

interface ActiveInjuriesProps {
  injuries: Injury[];
  isCoach: boolean;
  isArchived: boolean;
  onResolve: (id: string, notes?: string) => void;
  onReopen: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ActiveInjuries({ injuries, isCoach, isArchived, onResolve, onReopen, onDelete }: ActiveInjuriesProps) {
  const [filter, setFilter] = useState<'active' | 'resolved' | 'all'>('active');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  const filtered = injuries.filter((injury) => {
    if (injury.deletedAt) return false;
    if (filter === 'active') return injury.resolvedDate === null;
    if (filter === 'resolved') return injury.resolvedDate !== null;
    return true;
  });

  return (
    <section className={styles.activeInjuries} aria-labelledby="active-injuries-heading">
      <header>
        <div>
          <p className={styles.eyebrow}>Recovery history</p>
          <h2 id="active-injuries-heading">Injuries & recovery</h2>
        </div>
        <div className={styles.historyFilters}>
          <button type="button" className={filter === 'active' ? styles.activeFilter : ''} onClick={() => setFilter('active')}>Active</button>
          <button type="button" className={filter === 'resolved' ? styles.activeFilter : ''} onClick={() => setFilter('resolved')}>Resolved</button>
          <button type="button" className={filter === 'all' ? styles.activeFilter : ''} onClick={() => setFilter('all')}>All</button>
        </div>
      </header>
      {filtered.length === 0 ? (
        <p className={styles.emptyInjuries}>No {filter} injuries recorded.</p>
      ) : (
        <ol>
          {[...filtered].reverse().map((injury) => {
            const isResolved = injury.resolvedDate !== null;
            return (
              <li key={injury.id} className={styles.injuryItem} data-severity={injury.severity.toLowerCase()}>
                <i aria-hidden="true" />
                <div>
                  <strong>{injuryLabel(injury)}</strong>
                  <span>
                    {injury.bodyRegion} · {injury.severity} · {injury.occurrenceDate ? `Occurred ${injury.occurrenceDate}` : 'Date not recorded'}
                    {injury.expectedReturnDate && ` · Expected return ${injury.expectedReturnDate}`}
                    {isResolved && ` · Resolved ${new Date(injury.resolvedDate!).toLocaleDateString()}`}
                  </span>
                  {injury.notes && <p>Notes: {injury.notes}</p>}
                  {injury.resolutionNotes && <p>Resolution: {injury.resolutionNotes}</p>}
                </div>
                <div className={styles.injuryActions}>
                  {isCoach && !isArchived && (
                    <>
                      {!isResolved ? (
                        <>
                          {resolvingId === injury.id ? (
                            <div className={styles.resolveForm}>
                              <input
                                type="text"
                                placeholder="Resolution notes (optional)..."
                                value={resolutionNotes}
                                onChange={(e) => setResolutionNotes(e.target.value)}
                              />
                              <Button onClick={() => { onResolve(injury.id, resolutionNotes); setResolvingId(null); setResolutionNotes(''); }}>Confirm resolve</Button>
                              <Button variant="ghost" onClick={() => setResolvingId(null)}>Cancel</Button>
                            </div>
                          ) : (
                            <Button variant="secondary" onClick={() => setResolvingId(injury.id)}>Resolve</Button>
                          )}
                        </>
                      ) : (
                        <Button variant="ghost" onClick={() => onReopen(injury.id)}>Reopen</Button>
                      )}
                      <Button variant="ghost" onClick={() => onDelete(injury.id)}>Delete</Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
