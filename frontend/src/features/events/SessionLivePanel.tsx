import { useCallback, useEffect, useRef, useState } from 'react';
import * as meets from '../../api/meets';
import { Button, Input, OfflineRecoverySurface } from '../../components';
import { useWorkspace } from '../auth/WorkspaceContext';
import { useRealtimeRoom } from '../realtime/useRealtimeRoom';
import { useSessionOffline } from '../../hooks/useSessionOffline';
import { useCurrentUser } from '../auth/CurrentUserContext';
import { getOfflineLoggerDesignation, type OfflineLoggerDesignation } from '../../api/eventHelpers';
import { cacheSession, getCachedSession } from '../../offline/sessionCache';
import type { AthleticsEvent, IncidentType } from '../../types';
import type { DisciplineDefinition, DisciplineSession, MeetEntrant, SessionEntry, SessionRegistration, SessionResult } from '../../types/meets';
import { incidentButtons } from './disciplineIncidents';
import { memberSummary, relayLegCell, relayLegLine, relayMembersOf, standingsClub, standingsMembers, standingsTeam } from './standingsDisplay';
import { getIncidentTypeLabel } from '../results/resultPresentation';
import { formatResultUnit } from '../../utils/formatting';
import { sortDisciplines } from '../../utils/disciplineOrder';
import styles from './SessionLivePanel.module.css';

function formatResult(value: number | null, definition?: DisciplineDefinition): string {
  if (value === null) return '—';
  return `${value.toFixed(definition?.precision ?? 2)} ${formatResultUnit(definition?.unit ?? 'seconds')}`;
}

export function SessionLivePanel({ event, canOperate, isCoach }: { event: AthleticsEvent; canOperate: boolean; isCoach: boolean }) {
  const currentUser = useCurrentUser();
  const { activeWorkspace } = useWorkspace();
  const [definitions, setDefinitions] = useState<DisciplineDefinition[]>([]);
  const [sessions, setSessions] = useState<DisciplineSession[]>([]);
  const [entrants, setEntrants] = useState<MeetEntrant[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const [results, setResults] = useState<SessionResult[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fouls, setFouls] = useState<Record<string, boolean>>({});
  const [heights, setHeights] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [cacheFreshness, setCacheFreshness] = useState<number | null>(null);
  const [offlineDesignation, setOfflineDesignation] = useState<OfflineLoggerDesignation | null>(null);
  const [registrations, setRegistrations] = useState<{ sessionId: string; rows: SessionRegistration[] }>({ sessionId: '', rows: [] });
  const [finalization, setFinalization] = useState<meets.SessionFinalizationJob | null>(null);
  const offline = useSessionOffline(currentUser?.id ?? 'anonymous', event.id, activeWorkspace.id);
  const sessionTabRefs = useRef(new Map<string, HTMLButtonElement>());

  const timedSessions = sortDisciplines(
    sessions.filter((item) => definitions.some((candidate) => candidate.id === item.disciplineDefinitionId)),
    (item) => definitions.find((candidate) => candidate.id === item.disciplineDefinitionId)?.code ?? item.disciplineDefinitionId,
  );
  const session = sessions.find((item) => item.id === sessionId);
  const definition = definitions.find((item) => item.id === session?.disciplineDefinitionId);
  const live = canOperate && session?.status === 'in_progress' && (event.status === 'in_progress' || (isCoach && session.resultState === 'reopened' && event.status === 'completed'));
  const timed = definition?.defaultRules.aggregation === 'timed';
  const vertical = definition?.kind === 'vertical';
  const relay = definition?.defaultRules.entrantType === 'relay';
  const selectable = definition?.defaultRules.aggregation === 'timed' || definition?.defaultRules.aggregation === 'best';

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    const refresh = async () => {
      const response = await meets.getSessionFinalizationStatus(event.id, sessionId);
      if (!active) return;
      setFinalization(response.data);
      if (response.data?.status === 'completed') setReloadKey((key) => key + 1);
    };
    void refresh().catch(() => undefined);
    const timer = window.setInterval(() => void refresh().catch(() => undefined), 3_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [event.id, sessionId]);
  const canFinalize = isCoach && canOperate && session?.workspaceId === activeWorkspace.id;
  const sessionRegistrations = registrations.sessionId === sessionId ? registrations.rows : [];
  const registeredEntrantIds = new Set(sessionRegistrations.filter((registration) => !registration.withdrawnAt).map((registration) => registration.entrantId));
  const loggableEntrants = definition
    ? entrants
      .filter((item) => (item.kind === 'relay') === (definition.defaultRules.entrantType === 'relay'))
      .filter((item) => item.kind === 'relay' || !item.athleteId || item.rsvpStatus === 'yes')
      .filter((item) => registeredEntrantIds.has(item.id))
    : [];

  const reload = useCallback(async () => {
    try {
      const [catalogue, nextSessions, nextEntrants] = await Promise.all([
        meets.listDisciplines(), meets.listSessions(event.id), meets.listEntrants(event.id),
      ]);
      setDefinitions(catalogue.data);
      setSessions(nextSessions.data);
      const normalizedEntrants = nextEntrants.data.map((item) => ({ ...item, memberIds: item.memberIds ?? [] }));
      setEntrants(normalizedEntrants);
      if (sessionId) {
        const [history, board, registrationList] = await Promise.all([
          meets.listSessionEntries(event.id, sessionId),
          meets.listSessionResults(event.id, sessionId),
          meets.listRegistrations(event.id, sessionId),
        ]);
        setRegistrations({ sessionId, rows: registrationList.data });
        setEntries(history.data);
        setResults(board.data);
        void cacheSession(currentUser?.id ?? 'anonymous', activeWorkspace.id, event.id, sessionId, {
          definitions: catalogue.data,
          sessions: nextSessions.data,
          entrants: normalizedEntrants,
          entries: history.data,
          results: board.data,
        }).then(() => {
          setCacheFreshness(Date.now());
        }).catch(() => {
          // A session can still be logged when browser storage is unavailable.
        });
      }
    } catch (reason) {
      if (!sessionId) throw reason;
      const cached = await getCachedSession(currentUser?.id ?? 'anonymous', activeWorkspace.id, event.id, sessionId);
      if (!cached) throw reason;
      const data = cached.data as {
        definitions: DisciplineDefinition[];
        sessions: DisciplineSession[];
        entrants: MeetEntrant[];
        entries: SessionEntry[];
        results: SessionResult[];
      };
      setDefinitions(data.definitions);
      setSessions(data.sessions);
      setEntrants(data.entrants);
      setEntries(data.entries);
      setResults(data.results);
      setCacheFreshness(cached.cachedAt);
    }
  }, [activeWorkspace.id, currentUser?.id, event.id, sessionId]);

  useEffect(() => {
    void reload().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load session logging'));
  }, [reload, event.status, reloadKey]);

  useEffect(() => {
    if (!offline.isOnline) return;
    void getOfflineLoggerDesignation(event.id)
      .then(setOfflineDesignation)
      .catch(() => setOfflineDesignation(null));
  }, [event.id, offline.isOnline]);

  useRealtimeRoom({
    workspaceId: activeWorkspace.id,
    eventId: event.id,
    disciplineSessionId: sessionId || undefined,
    onInvalidate: () => setReloadKey((key) => key + 1),
  });

  useEffect(() => {
    if (offline.isOnline && offline.queueStatus.pending > 0) {
      void offline.syncPending(event.id).then(() => setReloadKey((key) => key + 1));
    }
  }, [event.id, offline, offline.isOnline, offline.queueStatus.pending]);

  useEffect(() => {
    if (timedSessions.some((item) => item.id === sessionId)) return;
    setSessionId(timedSessions[0]?.id ?? '');
  }, [sessionId, timedSessions]);

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
    setError('');
    try {
      await action();
      await offline.refreshQueueStatus(event.id);
      await reload();
    } catch (reason) {
      if (offline.isOnline) setError(reason instanceof Error ? reason.message : 'Unable to save entry');
    } finally {
      setBusy(false);
    }
  };

  const splitKey = (entrantId: string, relayMemberId?: string | null) => (relayMemberId ? `${entrantId}:${relayMemberId}` : entrantId);

  const logAttempt = (entrantId: string, relayMemberId: string | null = null) => run(async () => {
    if (!sessionId || !entrantId || !definition) return;
    const raw = values[splitKey(entrantId, relayMemberId)] ?? '';
    const payload = {
      entryType: 'attempt' as const,
      value: raw === '' ? null : Number(raw),
      unit: raw === '' ? null : definition.unit,
      isFoul: relay ? false : (fouls[entrantId] ?? false),
      incidentType: null,
      noteText: null,
      deviceId: null,
      ...(relayMemberId ? { relayMemberId } : {}),
    };
    const target = { disciplineSessionId: sessionId, entrantId };
    const queued = await offline.enqueueCreateEntry(event.id, activeWorkspace.id, target, payload);
    if (!queued) await meets.createSessionEntry(event.id, target, payload);
    setValues((prev) => ({ ...prev, [splitKey(entrantId, relayMemberId)]: '' }));
    if (!relay) setFouls((prev) => ({ ...prev, [entrantId]: false }));
  });

  const logIncident = (entrantId: string, incidentType: IncidentType) => run(async () => {
    if (!sessionId || !entrantId) return;
    const payload = {
      entryType: 'penalty' as const,
      value: null,
      unit: null,
      isFoul: false,
      incidentType,
      noteText: null,
      deviceId: null,
    };
    const target = { disciplineSessionId: sessionId, entrantId };
    const queued = await offline.enqueueCreateEntry(event.id, activeWorkspace.id, target, payload);
    if (!queued) await meets.createSessionEntry(event.id, target, payload);
  });

  const selectOfficial = (entrantId: string, entryId: string | null, relayMemberId: string | null = null) => run(async () => {
    const result = results.find((row) => row.entrantId === entrantId);
    if (!sessionId || !result) return;
    await meets.selectSessionResultEntry(event.id, { disciplineSessionId: sessionId, entrantId },
      { entryId, expectedVersion: result.version, ...(relayMemberId ? { relayMemberId } : {}) });
  });

  const undoEntry = (entrantId: string, entry: SessionEntry) => run(async () => {
    if (!sessionId) return;
    const target = { disciplineSessionId: sessionId, entrantId };
    const queued = await offline.enqueueUndoEntry(event.id, activeWorkspace.id, target, entry.id, entry.version);
    if (!queued) await meets.undoSessionEntry(event.id, target, entry.id, entry.version);
  });

  const logVerticalAttempt = (entrantId: string, verticalState: 'clearance' | 'failure' | 'pass') => run(async () => {
    if (!sessionId || !entrantId || !definition) return;
    const height = heights[entrantId] ?? String(session?.verticalConfig?.startingHeight ?? '');
    if (height === '') return;
    const target = { disciplineSessionId: sessionId, entrantId };
    await meets.createSessionEntry(event.id, target, {
      entryType: 'attempt',
      value: Number(height),
      unit: definition.unit,
      verticalState,
      isFoul: false,
      incidentType: null,
      noteText: null,
      deviceId: null,
    });
  });

  const voidEntry = (entrantId: string, entry: SessionEntry) => run(async () => {
    if (!sessionId) return;
    await meets.replaceSessionEntry(event.id, { disciplineSessionId: sessionId, entrantId }, entry.id, {
      entryType: entry.entryType,
      value: entry.value,
      unit: entry.unit,
      isFoul: entry.isFoul,
      incidentType: entry.incidentType,
      noteText: entry.noteText,
      deviceId: null,
      verticalState: 'void',
      expectedVersion: entry.version,
    });
  });

  const startSession = () => run(() => meets.changeSessionState(event.id, sessionId, 'in_progress', session!.version));
  const completeSession = () => run(async () => {
    const job = await meets.queueSessionFinalization(event.id, sessionId, session!.version);
    setFinalization(job);
  });

  const recoveryActions = (offline.queueActions ?? []).map((action) => {
    const targetEntrant = action.target?.entrantId ? entrants.find((entrant) => entrant.id === action.target?.entrantId) : null;
    const targetSession = action.target?.disciplineSessionId ? sessions.find((item) => item.id === action.target?.disciplineSessionId) : null;
    return {
      id: action.id,
      actionType: action.actionType,
      status: action.status,
      createdAt: action.createdAt,
      syncedAt: action.syncedAt,
      deviceId: action.deviceId,
      subject: targetEntrant ? `Entrant: ${targetEntrant.name}` : action.entryId ? `Session entry: ${action.entryId}` : 'Session entry',
      target: targetSession ? `Session: ${targetSession.label}` : 'Meet session',
      error: action.error,
    };
  });
  const designation = offlineDesignation ? {
    label: offlineDesignation.name ?? 'Designated helper',
    deviceId: offlineDesignation.deviceId,
    isCurrentDevice: offlineDesignation.deviceId === offline.deviceId,
  } : null;
  const syncOfflineChanges = async () => {
    try {
      await offline.syncPending(event.id);
      await reload();
    } catch {
      setError('Unable to sync queued actions. Check the action history and retry when connected.');
    }
  };

  function exportResults() {
    const quote = (cell: unknown) => `"${String(cell ?? '').replaceAll('"', '""')}"`;
    const rows = vertical
      ? [
        ['Place', 'Team / club', 'Members', 'Highest clearance', 'Failures at best', 'Total failures', 'Status'],
        ...results.map((row) => {
          const entrant = entrants.find((item) => item.id === row.entrantId);
          return [
            row.placing ?? '',
            standingsTeam(entrant),
            standingsMembers(entrant, entrants),
            row.effectiveResult === null ? 'NH' : row.effectiveResult.toFixed(definition?.precision ?? 2),
            row.vertical?.failuresAtBest ?? '',
            row.vertical?.totalFailures ?? '',
            row.vertical?.eliminated ? 'Eliminated' : row.effectiveOutcome,
          ];
        }),
      ]
      : relay
        ? [
          ['Place', 'Club', 'Relay team', 'Athletes', 'Legs', 'Result', 'Status'],
          ...results.map((row) => {
            const entrant = entrants.find((item) => item.id === row.entrantId);
            const final = session?.resultState === 'final';
            return [
              final ? (row.placing ?? '') : '',
              standingsClub(entrant),
              entrant?.name ?? '',
              memberSummary(entrant, entrants),
              relayLegCell(row.relayLegs, definition),
              final
                ? (row.effectiveResult === null ? row.effectiveOutcome.toUpperCase() : row.effectiveResult.toFixed(definition?.precision ?? 2))
                : 'Awaiting selection',
              row.effectiveOutcome,
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
            standingsMembers(entrant, entrants),
            row.effectiveResult === null ? '' : row.effectiveResult.toFixed(definition?.precision ?? 2),
            row.effectiveOutcome,
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

  function teamLine(entrant: MeetEntrant): string {
    if (entrant.kind === 'relay') return `Legs: ${memberSummary(entrant, entrants) || 'Members not listed'}`;
    if (entrant.kind === 'guest') return entrant.clubName ?? 'Guest';
    return entrant.workspaceName || 'Athlete';
  }

  if (event.discipline !== null) return null;

  return (
    <section aria-label="Session live logging" aria-busy={busy}>
      <h2>Session live logger</h2>
      <p>Each discipline shows only its own roster — athletes registered for that session across all teams who are marked as attending. Timed results, jumps, and throws use a coach-selected official attempt. High jump progresses by height with countback rankings and is made official as a complete result set. Offline attempts queue and sync when reconnecting.</p>
      <OfflineRecoverySurface
        isOnline={offline.isOnline}
        actions={recoveryActions}
        cacheFreshness={cacheFreshness}
        designation={designation}
        onRefresh={reload}
        onSyncNow={syncOfflineChanges}
        onRetryAction={async (actionId) => {
          await offline.retryFailedAction(actionId, event.id);
          await syncOfflineChanges();
        }}
      />
      {error && <p role="alert">{error}</p>}
      {timedSessions.length === 0 && <p>No timed discipline sessions have been added to this event yet.</p>}
      {timedSessions.length > 0 && (
        <div className={styles.sessionTabs} role="tablist" aria-label="Discipline sessions">
          {timedSessions.map((item) => {
            const active = item.id === sessionId;
            return (
              <button
                key={item.id}
                ref={(node) => { if (node) sessionTabRefs.current.set(item.id, node); else sessionTabRefs.current.delete(item.id); }}
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
          {finalization?.status === 'pending' || finalization?.status === 'running' ? <p role="status">Calculating final results</p> : null}
          {finalization?.status === 'completed' ? <p role="status">Final results ready</p> : null}
          {finalization?.status === 'failed' ? <p role="alert">Finalization failed: {finalization.errorMessage ?? 'Correct entries and try again.'}</p> : null}
          {canFinalize && session.status === 'scheduled' && event.status === 'in_progress' && (
            <Button onClick={() => void startSession()} disabled={busy}>Start session</Button>
          )}
          {canFinalize && session.status === 'in_progress' && (
            <Button variant="secondary" onClick={() => void completeSession()} disabled={busy || !offline.isOnline || offline.queueStatus.pending > 0}>{vertical ? 'Make results official' : 'Finalize session'}</Button>
          )}
          {canFinalize && session.status === 'completed' && event.status !== 'cancelled' && <Button onClick={() => void startSession()} disabled={busy || !offline.isOnline}>Reopen session</Button>}
          {vertical && session.verticalConfig && (
            <p>{session.verticalConfig.round}: starts at {session.verticalConfig.startingHeight.toFixed(2)} m, then +{session.verticalConfig.heightIncrement.toFixed(2)} m per height. {session.verticalConfig.failureLimit} consecutive failures eliminate an entrant.</p>
          )}
          <h3>{definition.defaultRules.entrantType === 'relay' ? 'Relay teams' : 'Athletes'} ({loggableEntrants.length})</h3>
          {loggableEntrants.length === 0 && <p>{entrants.length === 0 ? 'No entrants have been added to this event yet.' : registeredEntrantIds.size === 0 ? 'No one is registered for this session yet. Add entrants from the meet roster.' : 'No registered athletes are marked as attending. Update RSVPs on the event roster.'}</p>}
          {loggableEntrants.length > 0 && (
            <div className={styles.athleteList} tabIndex={0} aria-label={definition.defaultRules.entrantType === 'relay' ? 'Scrollable relay teams' : 'Scrollable athletes'}>
              {loggableEntrants.map((entrant) => {
                const result = results.find((row) => row.entrantId === entrant.id);
                const ownsEntrant = entrant.workspaceId === activeWorkspace.id;
                const eliminated = Boolean(result?.vertical?.eliminated);
                const controlsDisabled = busy || !live || (vertical && eliminated);
                const entrantEntries = entries.filter((entry) => entry.entrantId === entrant.id && (entry.entryType === 'attempt' || entry.entryType === 'penalty') && !entry.deletedAt);
                const relayMembers = relay ? relayMembersOf(entrant, result?.relayLegs) : [];
                const teamEntries = relay ? entrantEntries.filter((entry) => !entry.relayMemberId) : entrantEntries;
                const currentRecord = !result
                  ? '—'
                  : vertical
                    ? result.vertical?.eliminated ? 'Eliminated' : result.effectiveResult === null ? 'NH' : formatResult(result.effectiveResult, definition)
                    : relay
                      ? result.effectiveResult !== null
                        ? formatResult(result.effectiveResult, definition)
                        : result.effectiveOutcome !== 'valid' ? result.effectiveOutcome.toUpperCase() : 'Awaiting selection'
                      : `${formatResult(result.effectiveResult, definition)}${result.isPb ? ' PB' : ''}${result.isSb ? ' SB' : ''}${result.effectiveOutcome !== 'valid' ? ` ${result.effectiveOutcome.toUpperCase()}` : ''}`;
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
                      ) : relay ? (
                        <div className={styles.finishInputGroup}>
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
                              {state === 'clearance' ? 'Clear' : state === 'failure' ? 'Fail' : 'Skip'}
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
                    {relay && (
                      <div className={styles.relayLegList}>
                        {relayMembers.map((member) => {
                          const key = splitKey(entrant.id, member.relayMemberId);
                          const leg = result?.relayLegs?.find((item) => item.relayMemberId === member.relayMemberId);
                          const splits = entrantEntries.filter((entry) => entry.relayMemberId === member.relayMemberId);
                          return (
                            <div key={member.relayMemberId} className={styles.finishInputGroup}>
                              <label htmlFor={`relay-split-${entrant.id}-${member.relayMemberId}`}>Relay splits - {member.name}</label>
                              <Input
                                id={`relay-split-${entrant.id}-${member.relayMemberId}`}
                                aria-label={`Relay splits for ${member.name} (leg ${member.leg})`}
                                type="number"
                                inputMode="decimal"
                                min="0.01"
                                step="0.01"
                                placeholder="13.42"
                                value={values[key] ?? ''}
                                onChange={(input) => setValues((prev) => ({ ...prev, [key]: input.target.value }))}
                                disabled={controlsDisabled}
                              />
                              <Button
                                disabled={controlsDisabled || !(values[key] ?? '').trim()}
                                onClick={() => void logAttempt(entrant.id, member.relayMemberId)}
                                style={{ minHeight: '44px', minWidth: '44px' }}
                              >
                                Record
                              </Button>
                              <span className={styles.currentRecord} aria-label={`Official split for ${member.name}`}>
                                {leg && leg.value !== null ? `${formatResult(leg.value, definition)}${leg.isPb ? ' PB' : ''}${leg.isSb ? ' SB' : ''}` : 'Awaiting selection'}
                              </span>
                              {splits.length > 0 && (
                                <ol className={styles.attemptsList} aria-label={`Relay splits for ${member.name}`}>
                                      {splits.map((entry, index) => (
                                        <li key={entry.id}>
                                          #{index + 1} {formatResult(entry.value, definition)}
                                          {entry.recorderName && ` · by ${entry.recorderName}`}
                                          {leg?.selectedEntryId === entry.id && ' · official'}
                                          {isCoach && live && (
                                        <>
                                          {' '}
                                          {ownsEntrant && (
                                            <Button
                                              variant="secondary"
                                              disabled={busy || !offline.isOnline || leg?.selectedEntryId === entry.id || entry.value === null || entry.isFoul}
                                              onClick={() => void selectOfficial(entrant.id, entry.id, member.relayMemberId)}
                                            >
                                              Make official
                                            </Button>
                                          )}
                                          {entry.canUndo !== false && (
                                            <Button variant="secondary" disabled={busy} onClick={() => void undoEntry(entrant.id, entry)}>Undo</Button>
                                          )}
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
                    {teamEntries.length > 0 && (
                      <ol className={styles.attemptsList} aria-label={`Entries for ${entrant.name}`}>
                        {teamEntries.map((entry, index) => (
                          <li key={entry.id}>
                            #{entry.attemptOrder ?? index + 1} {vertical
                              ? `${entry.value === null ? '—' : entry.value.toFixed(definition.precision)} ${definition.unit} — ${entry.verticalState === 'pass' ? 'skip' : entry.verticalState ?? (entry.incidentType ? getIncidentTypeLabel(entry.incidentType) : '')}`
                              : `${formatResult(entry.value, definition)} ${entry.incidentType ? getIncidentTypeLabel(entry.incidentType) : ''} ${entry.isFoul ? 'Foul' : ''}`}
                            {entry.recorderName && ` · by ${entry.recorderName}`}
                            {!vertical && result?.selectedEntryId === entry.id && ' · official'}
                            {isCoach && live && (
                              <>
                                {' '}
                                {selectable && ownsEntrant && (
                                  <Button
                                    variant="secondary"
                                    disabled={busy || !offline.isOnline || result?.selectedEntryId === entry.id || entry.value === null || !!entry.incidentType || entry.isFoul}
                                    onClick={() => void selectOfficial(entrant.id, entry.id)}
                                  >
                                    Make official
                                  </Button>
                                )}
                                {vertical && entry.verticalState && entry.verticalState !== 'void' && entry.canEdit !== false && (
                                  <Button variant="secondary" disabled={busy} onClick={() => void voidEntry(entrant.id, entry)}>Void attempt {entry.attemptOrder}</Button>
                                )}
                                {entry.canUndo !== false && (
                                  <Button variant="secondary" disabled={busy} onClick={() => void undoEntry(entrant.id, entry)}>Undo</Button>
                                )}
                              </>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                    {isCoach && live && ownsEntrant && selectable && !relay && result?.selectedEntryId && teamEntries.length > 0 && (
                      <Button variant="secondary" disabled={busy} onClick={() => void selectOfficial(entrant.id, null)}>Clear official selection</Button>
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
                {relay ? (
                  <tr>
                    <th scope="col" className={styles.numeric}>Place</th>
                    <th scope="col">Club</th>
                    <th scope="col">Relay team</th>
                    <th scope="col">Athletes</th>
                    <th scope="col">Legs</th>
                    <th scope="col" className={styles.numeric}>Result</th>
                    <th scope="col">Status</th>
                  </tr>
                ) : (
                  <tr>
                    <th scope="col" className={styles.numeric}>Place</th>
                    <th scope="col">Team / club</th>
                    <th scope="col">Members</th>
                    <th scope="col" className={styles.numeric}>Result</th>
                    {vertical && <th scope="col" className={styles.numeric}>Countback</th>}
                    <th scope="col">Status</th>
                    {!vertical && <th scope="col">Official entry</th>}
                  </tr>
                )}
              </thead>
              <tbody>
                {[...results]
                  .sort((a, b) => (a.placing ?? 999) - (b.placing ?? 999))
                  .map((row) => {
                    const entrant = entrants.find((item) => item.id === row.entrantId);
                    if (relay) {
                      const final = session.resultState === 'final';
                      return (
                        <tr key={row.entrantId}>
                          <td className={styles.numeric}>{final ? (row.placing ?? '—') : '—'}</td>
                          <td>{standingsClub(entrant)}</td>
                          <td>{standingsTeam(entrant)}</td>
                          <td>{memberSummary(entrant, entrants)}</td>
                          <td>{relayLegLine(row.relayLegs, definition)}</td>
                          <td className={styles.numeric}>
                            {final
                              ? (row.effectiveResult === null ? row.effectiveOutcome.toUpperCase() : formatResult(row.effectiveResult, definition))
                              : 'Awaiting selection'}
                          </td>
                          <td>{row.effectiveOutcome}</td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={row.entrantId}>
                        <td className={styles.numeric}>{row.placing ?? '—'}</td>
                        <td>{standingsTeam(entrant)}</td>
                        <td>{standingsMembers(entrant, entrants)}</td>
                        <td className={styles.numeric}>{vertical && row.effectiveResult === null ? 'NH' : formatResult(row.effectiveResult, definition)} {row.isPb && 'PB'} {row.isSb && 'SB'}</td>
                        {vertical && <td className={styles.numeric}>{row.vertical ? `${row.vertical.failuresAtBest} / ${row.vertical.totalFailures}` : '—'}</td>}
                        <td>{row.vertical?.eliminated ? 'Eliminated' : row.effectiveOutcome}</td>
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
  );
}
