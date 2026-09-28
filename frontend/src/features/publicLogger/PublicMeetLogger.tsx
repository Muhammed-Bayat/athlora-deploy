import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createPublicMeetLoggerEntry,
  getPublicMeetLoggerSnapshot,
  removePublicMeetLoggerEntry,
} from '../../api/publicLoggers';
import { ApiError } from '../../api/client';
import { Button, Input, OfflineRecoverySurface } from '../../components';
import type { PublicOfflineSyncResult } from '../../hooks/usePublicOfflineSync';
import { cachePublicSession, getCachedPublicSession } from '../../offline/sessionCache';
import type { AthleticsEvent, IncidentType } from '../../types';
import type {
  DisciplineDefinition,
  PublicMeetEntrant,
  PublicMeetLoggerSnapshot,
  PublicSessionEntry,
  SessionEntryInput,
  SessionTarget,
} from '../../types/meets';
import styles from '../events/SessionLivePanel.module.css';
import { incidentButtons } from '../events/disciplineIncidents';
import { standingsTeam } from '../events/standingsDisplay';
import pageStyles from './PublicLoggerPage.module.css';

const DEFAULT_SESSION_CACHE_KEY = 'public-meet';

function formatValue(value: number | null, definition?: DisciplineDefinition): string {
  if (value === null) return '—';
  return `${value.toFixed(definition?.precision ?? 2)} ${definition?.unit === 'metres' || definition?.unit === 'cm' ? definition.unit : 's'}`;
}

function memberSummary(entrant: PublicMeetEntrant | undefined): string {
  if (!entrant || entrant.kind !== 'relay') return '';
  return [...entrant.members]
    .sort((a, b) => a.leg - b.leg)
    .map((member) => member.name)
    .join(' → ');
}

function teamLine(entrant: PublicMeetEntrant): string {
  if (entrant.kind === 'relay') return `Legs: ${memberSummary(entrant) || 'Members not listed'}`;
  if (entrant.kind === 'guest') return entrant.clubName ?? 'Guest';
  return entrant.workspaceName ?? 'Athlete';
}

function standingsMembers(entrant: PublicMeetEntrant | undefined): string {
  if (!entrant) return '';
  if (entrant.kind === 'relay') return memberSummary(entrant);
  return entrant.name;
}

export function PublicMeetLogger({
  event,
  sessionToken,
  offlineSync,
}: {
  event: Pick<AthleticsEvent, 'id' | 'title' | 'status' | 'discipline'>;
  sessionToken: string;
  offlineSync: PublicOfflineSyncResult;
}) {
  const [snapshot, setSnapshot] = useState<PublicMeetLoggerSnapshot | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [fouls, setFouls] = useState<Record<string, boolean>>({});
  const [heights, setHeights] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheFreshness, setCacheFreshness] = useState<number | null>(null);
  const sessionTabRefs = useRef(new Map<string, HTMLButtonElement>());

  const load = useCallback(async () => {
    try {
      const fresh = await getPublicMeetLoggerSnapshot(sessionToken, event.id);
      setSnapshot(fresh);
      setSessionId((current) => current && fresh.sessions.some((item) => item.id === current)
        ? current
        : fresh.sessions.find((item) => item.status === 'in_progress')?.id ?? '');
      await Promise.all([
        cachePublicSession(sessionToken, event.id, DEFAULT_SESSION_CACHE_KEY, fresh as unknown as Record<string, unknown>),
        ...fresh.sessions.map((item) => cachePublicSession(sessionToken, event.id, item.id, fresh as unknown as Record<string, unknown>)),
      ]);
      setCacheFreshness(Date.now());
    } catch (reason) {
      const cached = await getCachedPublicSession(sessionToken, event.id, DEFAULT_SESSION_CACHE_KEY);
      if (!cached) throw reason;
      const recovered = cached.snapshot as unknown as PublicMeetLoggerSnapshot;
      setSnapshot(recovered);
      setSessionId((current) => current && recovered.sessions.some((item) => item.id === current)
        ? current
        : recovered.sessions.find((item) => item.status === 'in_progress')?.id ?? '');
      setCacheFreshness(cached.cachedAt);
    }
  }, [event.id, sessionToken]);

  useEffect(() => {
    void load().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Unable to load this meet logger.');
    });
  }, [load]);

  useEffect(() => {
    if (!offlineSync.isOnline) return;
    const timer = window.setInterval(() => {
      void load().catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [load, offlineSync.isOnline]);

  const definitions = snapshot?.disciplines ?? [];
  const sessions = snapshot?.sessions ?? [];
  const entrants = snapshot?.entrants ?? [];
  const timedSessions = sessions.filter((item) => definitions.some((candidate) => candidate.id === item.disciplineDefinitionId));
  const session = sessions.find((item) => item.id === sessionId);
  const definition = definitions.find((item) => item.id === session?.disciplineDefinitionId);
  const live = event.status === 'in_progress' && session?.status === 'in_progress' && session.resultState !== 'final';
  const timed = definition?.defaultRules.aggregation === 'timed';
  const vertical = definition?.kind === 'vertical';
  const entries = session?.entries ?? [];
  const results = session?.results ?? [];
  const registeredEntrantIds = new Set(session?.entrantIds ?? []);
  const loggableEntrants = definition
    ? entrants
      .filter((item) => (item.kind === 'relay') === (definition.defaultRules.entrantType === 'relay'))
      .filter((item) => item.attending)
      .filter((item) => registeredEntrantIds.has(item.id))
    : [];
  const sessionTabRefsMap = sessionTabRefs.current;

  useEffect(() => {
    if (timedSessions.some((item) => item.id === sessionId)) return;
    setSessionId(timedSessions[0]?.id ?? '');
  }, [sessionId, timedSessions]);

  const showError = (reason: unknown, fallback: string) => {
    if (reason instanceof ApiError && reason.code === 'PUBLIC_LOGGER_SESSION_INVALID') {
      setError('This public logger link is no longer available.');
      return;
    }
    setError(reason instanceof Error ? reason.message : fallback);
  };

  const refresh = async () => {
    try {
      await load();
    } catch (reason) {
      showError(reason, 'Unable to load this meet logger.');
    }
  };

  const selectSession = (nextSessionId: string, focus = false) => {
    setSessionId(nextSessionId);
    setValues({});
    setFouls({});
    setHeights({});
    if (focus) window.requestAnimationFrame(() => sessionTabRefs.current.get(nextSessionId)?.focus());
  };

  const moveSessionTab = (currentId: string, offset: number) => {
    const currentIndex = timedSessions.findIndex((item) => item.id === currentId);
    const next = timedSessions[(currentIndex + offset + timedSessions.length) % timedSessions.length];
    if (next) selectSession(next.id, true);
  };

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (offlineSync.isOnline) await load();
    } catch (reason) {
      showError(reason, 'Unable to save this entry.');
    } finally {
      setBusy(false);
    }
  };

  const targetFor = (entrantId: string): SessionTarget => ({ disciplineSessionId: sessionId, entrantId });

  const submitEntry = async (target: SessionTarget, payload: SessionEntryInput) => {
    if (!offlineSync.isOnline) await offlineSync.enqueue({ target, actionType: 'create_entry', payload: { ...payload } });
    else await createPublicMeetLoggerEntry(sessionToken, event.id, target, payload);
  };

  const logAttempt = (entrantId: string) => run(async () => {
    if (!sessionId || !entrantId || !definition) return;
    const raw = values[entrantId] ?? '';
    const numeric = Number(raw);
    if (!raw.trim() || !Number.isFinite(numeric) || numeric <= 0) {
      setError(`Enter a valid ${definition.unit === 'seconds' ? 'time' : 'measurement'} before recording.`);
      return;
    }
    await submitEntry(targetFor(entrantId), {
      entryType: 'attempt', value: numeric, unit: definition.unit,
      isFoul: fouls[entrantId] ?? false,
      incidentType: null, noteText: null, deviceId: null,
    });
    setValues((prev) => ({ ...prev, [entrantId]: '' }));
    setFouls((prev) => ({ ...prev, [entrantId]: false }));
  });

  const logIncident = (entrantId: string, incidentType: IncidentType) => run(async () => {
    if (!sessionId || !entrantId) return;
    await submitEntry(targetFor(entrantId), {
      entryType: 'penalty', value: null, unit: null, isFoul: false,
      incidentType, noteText: null, deviceId: null,
    });
  });

  const logVerticalAttempt = (entrantId: string, verticalState: 'clearance' | 'failure' | 'pass') => run(async () => {
    if (!sessionId || !entrantId || !definition) return;
    const height = heights[entrantId] ?? String(session?.verticalConfig?.startingHeight ?? '');
    if (height === '') return;
    await submitEntry(targetFor(entrantId), {
      entryType: 'attempt', value: Number(height), unit: definition.unit, verticalState,
      isFoul: false, incidentType: null, noteText: null, deviceId: null,
    });
  });

  const undoEntry = (entrantId: string, entry: PublicSessionEntry) => run(async () => {
    if (!sessionId) return;
    const target = targetFor(entrantId);
    const payload = { expectedVersion: entry.version };
    if (!offlineSync.isOnline) await offlineSync.enqueue({ target, actionType: 'undo_entry', payload, entryId: entry.id, expectedVersion: entry.version });
    else await removePublicMeetLoggerEntry(sessionToken, event.id, target, entry.id, payload);
  });

  function exportResults() {
    const quote = (cell: unknown) => `"${String(cell ?? '').replaceAll('"', '""')}"`;
    const rows = vertical
      ? [
        ['Place', 'Team / club', 'Members', 'Highest clearance', 'Failures at best', 'Failures through best', 'Status'],
        ...results.map((row) => {
          const entrant = entrants.find((item) => item.id === row.entrantId);
          return [
            row.placing ?? '',
            standingsTeam(entrant),
            standingsMembers(entrant),
            row.value === null ? 'NH' : row.value.toFixed(definition?.precision ?? 2),
            row.vertical?.failuresAtBest ?? '',
            row.vertical?.totalFailuresToBest ?? '',
            row.vertical?.eliminated ? 'Eliminated' : row.outcome,
          ];
        }),
      ]
      : [
        ['Place', 'Team / club', 'Members', 'Result', 'Outcome', 'Official entry'],
        ...results.map((row) => {
          const entrant = entrants.find((item) => item.id === row.entrantId);
          return [
            row.placing ?? '',
            standingsTeam(entrant),
            standingsMembers(entrant),
            row.value === null ? '' : row.value.toFixed(definition?.precision ?? 2),
            row.outcome,
            row.selectedEntryId ? 'selected' : '',
          ];
        }),
      ];
    const url = URL.createObjectURL(new Blob([rows.map((row) => row.map(quote).join(',')).join('\n')], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${session?.label ?? 'session'}-results.csv`.replaceAll(/\s+/g, '-').toLowerCase();
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!snapshot) {
    return <main className={pageStyles.page}><section className={pageStyles.join} aria-busy="true"><p>Loading meet sessions...</p>{error && <p role="alert">{error}</p>}</section></main>;
  }

  const recoveryActions = offlineSync.queueActions.map((action) => {
    const actionSession = action.target ? sessions.find((item) => item.id === action.target?.disciplineSessionId) : null;
    const actionEntrant = action.target ? entrants.find((item) => item.id === action.target?.entrantId) : null;
    return {
      id: action.id,
      actionType: action.actionType,
      status: action.status,
      createdAt: action.createdAt,
      syncedAt: action.syncedAt,
      deviceId: action.deviceId,
      subject: actionEntrant ? `Entrant: ${actionEntrant.name}` : action.entryId ? `Session entry: ${action.entryId}` : 'Session entry',
      target: actionSession ? `Session: ${actionSession.label}` : 'Meet session',
      error: action.error,
    };
  });

  return (
    <main className={pageStyles.page}>
      <header className={pageStyles.header}>
        <div>
          <p className={pageStyles.kicker}>Athlora public meet logger</p>
          <h1>{event.title}</h1>
          <p>Anyone with this link sees the same live logger as the coaches and can record for any registered entrant while a session is in progress.</p>
        </div>
        <Button variant="secondary" onClick={() => void refresh()} disabled={busy}>{busy ? 'Refreshing...' : 'Refresh'}</Button>
      </header>
      <OfflineRecoverySurface
        isOnline={offlineSync.isOnline}
        actions={recoveryActions}
        cacheFreshness={cacheFreshness}
        isSyncing={offlineSync.isSyncing}
        onRefresh={refresh}
        onSyncNow={offlineSync.syncNow}
        onRetryAction={async (actionId) => {
          await offlineSync.retryFailedAction(actionId);
          await offlineSync.syncNow();
        }}
      />
      {error && <p className={pageStyles.error} role="alert">{error}</p>}

      <section aria-label="Session live logging" aria-busy={busy}>
        <h2>Session live logger</h2>
        <p>Each discipline shows only its own roster — athletes registered for that session across all teams who are marked as attending. Timed results, jumps, and throws use a coach-selected official attempt. High jump and pole vault progress by height with countback rankings and are made official as a complete result set. Offline attempts queue and sync when reconnecting.</p>
        {timedSessions.length === 0 && <p>No timed discipline sessions have been added to this event yet.</p>}
        {timedSessions.length > 0 && (
          <div className={styles.sessionTabs} role="tablist" aria-label="Discipline sessions">
            {timedSessions.map((item) => {
              const active = item.id === sessionId;
              return (
                <button
                  key={item.id}
                  ref={(node) => { if (node) sessionTabRefsMap.set(item.id, node); else sessionTabRefsMap.delete(item.id); }}
                  type="button"
                  role="tab"
                  id={`live-session-${item.id}-tab`}
                  aria-selected={active}
                  aria-controls={`live-session-${item.id}-panel`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => selectSession(item.id)}
                  onKeyDown={(keyboardEvent) => {
                    if (keyboardEvent.key === 'ArrowRight' || keyboardEvent.key === 'ArrowDown') { keyboardEvent.preventDefault(); moveSessionTab(item.id, 1); }
                    if (keyboardEvent.key === 'ArrowLeft' || keyboardEvent.key === 'ArrowUp') { keyboardEvent.preventDefault(); moveSessionTab(item.id, -1); }
                    if (keyboardEvent.key === 'Home') { keyboardEvent.preventDefault(); selectSession(timedSessions[0]!.id, true); }
                    if (keyboardEvent.key === 'End') { keyboardEvent.preventDefault(); selectSession(timedSessions[timedSessions.length - 1]!.id, true); }
                  }}
                >
                  <span>{item.label}</span>
                  <small>{item.status.replace('_', ' ')}</small>
                </button>
              );
            })}
          </div>
        )}
        {session && definition && (
          <div className={styles.sessionPanel} role="tabpanel" id={`live-session-${session.id}-panel`} aria-labelledby={`live-session-${session.id}-tab`} tabIndex={0}>
            <p>{definition.presentation.label}: {session.status} — {session.resultState ?? 'provisional'}</p>
            {vertical && session.verticalConfig && (
              <p>{session.verticalConfig.round}: starts at {session.verticalConfig.startingHeight.toFixed(2)} m, then +{session.verticalConfig.heightIncrement.toFixed(2)} m per height. {session.verticalConfig.failureLimit} consecutive failures eliminate an entrant.</p>
            )}
            <h3>{definition.defaultRules.entrantType === 'relay' ? 'Relay teams' : 'Athletes'} ({loggableEntrants.length})</h3>
            {loggableEntrants.length === 0 && <p>{entrants.length === 0 ? 'No entrants have been added to this event yet.' : registeredEntrantIds.size === 0 ? 'No one is registered for this session yet.' : 'No registered athletes are marked as attending.'}</p>}
            {loggableEntrants.length > 0 && (
              <div className={styles.athleteList} tabIndex={0} aria-label={definition.defaultRules.entrantType === 'relay' ? 'Scrollable relay teams' : 'Scrollable athletes'}>
                {loggableEntrants.map((entrant) => {
                  const result = results.find((row) => row.entrantId === entrant.id);
                  const eliminated = Boolean(result?.vertical?.eliminated);
                  const controlsDisabled = busy || !live || (vertical && eliminated);
                  const entrantEntries = entries.filter((entry) => entry.entrantId === entrant.id && (entry.entryType === 'attempt' || entry.entryType === 'penalty'));
                  const currentRecord = !result
                    ? '—'
                    : vertical
                      ? result.vertical?.eliminated ? 'Eliminated' : result.value === null ? 'NH' : formatValue(result.value, definition)
                      : `${formatValue(result.value, definition)}${result.outcome !== 'valid' ? ` ${result.outcome.toUpperCase()}` : ''}`;
                  const height = heights[entrant.id] ?? String(session.verticalConfig?.startingHeight ?? '');
                  return (
                    <div key={entrant.id} className={styles.athleteRow} role="group" aria-label={entrant.name}>
                      <div className={styles.athleteInfo}>
                        <b>{entrant.name}</b>
                        <small aria-label={entrant.kind === 'relay' ? 'Team members' : undefined}>{teamLine(entrant)}</small>
                      </div>
                      <div className={styles.controlsGroup}>
                        {vertical ? (
                          <div className={styles.finishInputGroup}>
                            <Input
                              aria-label={`Target height (m) for ${entrant.name}`}
                              type="number"
                              inputMode="decimal"
                              min={session.verticalConfig?.startingHeight ?? 0.01}
                              step={session.verticalConfig?.heightIncrement ?? 0.01}
                              value={height}
                              onChange={(input) => setHeights((prev) => ({ ...prev, [entrant.id]: input.target.value }))}
                              disabled={controlsDisabled}
                            />
                            <Button
                              variant="secondary"
                              disabled={controlsDisabled}
                              onClick={() => setHeights((prev) => ({ ...prev, [entrant.id]: (Number(height || session.verticalConfig?.startingHeight || 0) + (session.verticalConfig?.heightIncrement ?? 0)).toFixed(2) }))}
                            >
                              Next height
                            </Button>
                            <span className={styles.currentRecord} aria-label={`Current result for ${entrant.name}`}>{currentRecord}</span>
                          </div>
                        ) : (
                          <div className={styles.finishInputGroup}>
                            <Input
                              aria-label={`${timed ? 'Time (s)' : `Mark (${definition.unit})`} for ${entrant.name}`}
                              type="number"
                              inputMode="decimal"
                              min="0.01"
                              step="0.01"
                              placeholder={timed ? '10.25' : '0.00'}
                              value={values[entrant.id] ?? ''}
                              onChange={(input) => setValues((prev) => ({ ...prev, [entrant.id]: input.target.value }))}
                              disabled={controlsDisabled}
                            />
                            {!timed && (
                              <Button
                                variant={fouls[entrant.id] ? 'danger' : 'secondary'}
                                aria-label={`Foul for ${entrant.name}`}
                                aria-pressed={fouls[entrant.id] ?? false}
                                onClick={() => setFouls((prev) => ({ ...prev, [entrant.id]: !(prev[entrant.id] ?? false) }))}
                                disabled={controlsDisabled}
                                style={{ minHeight: '44px', minWidth: '44px' }}
                                title="Foul"
                              >
                                Foul
                              </Button>
                            )}
                            <Button
                              disabled={controlsDisabled || !(values[entrant.id] ?? '').trim()}
                              onClick={() => void logAttempt(entrant.id)}
                              style={{ minHeight: '44px', minWidth: '44px' }}
                            >
                              Record
                            </Button>
                            <span className={styles.currentRecord} aria-label={`Current result for ${entrant.name}`}>{currentRecord}</span>
                          </div>
                        )}
                        {vertical ? (
                          <div className={styles.incidentButtonGroup}>
                            {(['clearance', 'failure', 'pass'] as const).map((state) => (
                              <Button
                                key={state}
                                disabled={controlsDisabled}
                                onClick={() => void logVerticalAttempt(entrant.id, state)}
                                style={{ minHeight: '44px', minWidth: '44px' }}
                              >
                                {state === 'clearance' ? 'Clearance' : state === 'failure' ? 'Failure' : 'Pass'}
                              </Button>
                            ))}
                          </div>
                        ) : (
                          <div className={styles.incidentButtonGroup}>
                            {incidentButtons(definition).map((incident) => (
                              <Button
                                key={incident.value}
                                variant="secondary"
                                disabled={controlsDisabled}
                                onClick={() => void logIncident(entrant.id, incident.value)}
                                style={{ minHeight: '44px', minWidth: '44px' }}
                                title={incident.title}
                              >
                                {incident.label}
                              </Button>
                            ))}
                          </div>
                        )}
                        {vertical && eliminated && <p>{entrant.name} is eliminated.</p>}
                      </div>
                      {entrantEntries.length > 0 && (
                        <ol className={styles.attemptsList} aria-label={`Attempts for ${entrant.name}`}>
                          {entrantEntries.map((entry, index) => (
                            <li key={entry.id}>
                              {entry.entryType === 'penalty'
                                ? `${entry.incidentType?.toUpperCase() ?? 'Penalty'}`
                                : `#${entry.attemptOrder ?? index + 1} ${vertical
                                ? `${entry.value === null ? '—' : entry.value.toFixed(definition.precision)} ${definition.unit} — ${entry.verticalState ?? entry.incidentType ?? ''}`
                                : `${formatValue(entry.value, definition)} ${entry.incidentType ?? ''} ${entry.isFoul ? 'Foul' : ''}`}`}
                              {entry.recorderName && ` · by ${entry.recorderName}`}
                              {!vertical && result?.selectedEntryId === entry.id && ' · official'}
                              {live && entry.canUndo && (
                                <>
                                  {' '}
                                  <Button variant="secondary" disabled={busy} onClick={() => void undoEntry(entrant.id, entry)}>Undo</Button>
                                </>
                              )}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <h3>Standings ({session.resultState === 'final' ? 'final' : session.resultState === 'reopened' ? 'reopened — provisional' : 'provisional'})</h3>
            <div className={styles.standingsScroll}>
              <table className={styles.standingsTable}>
                <thead>
                  <tr>
                    <th scope="col" className={styles.numeric}>Place</th>
                    <th scope="col">Team / club</th>
                    <th scope="col">Members</th>
                    <th scope="col" className={styles.numeric}>Result</th>
                    {vertical && <th scope="col" className={styles.numeric}>Countback</th>}
                    <th scope="col">Status</th>
                    {!vertical && <th scope="col">Official entry</th>}
                  </tr>
                </thead>
                <tbody>
                  {[...results]
                    .sort((a, b) => (a.placing ?? 999) - (b.placing ?? 999))
                    .map((row) => {
                      const entrant = entrants.find((item) => item.id === row.entrantId);
                      return (
                        <tr key={row.entrantId}>
                          <td className={styles.numeric}>{row.placing ?? '—'}</td>
                          <td>{standingsTeam(entrant)}</td>
                          <td>{standingsMembers(entrant)}</td>
                          <td className={styles.numeric}>{vertical && row.value === null ? 'NH' : formatValue(row.value, definition)}</td>
                          {vertical && <td className={styles.numeric}>{row.vertical ? `${row.vertical.failuresAtBest} / ${row.vertical.totalFailuresToBest}` : '—'}</td>}
                          <td>{row.vertical?.eliminated ? 'Eliminated' : row.outcome}</td>
                          {!vertical && <td>{row.selectedEntryId ? 'Selected' : 'Awaiting selection'}</td>}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <Button variant="secondary" onClick={exportResults} disabled={results.length === 0}>Export results CSV</Button>
          </div>
        )}
      </section>
    </main>
  );
}
