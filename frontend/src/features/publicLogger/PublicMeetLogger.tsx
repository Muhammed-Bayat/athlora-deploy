import { useCallback, useEffect, useState } from 'react';
import {
  createPublicMeetLoggerEntry,
  getPublicMeetLoggerSnapshot,
  removePublicMeetLoggerEntry,
  updatePublicMeetLoggerEntry,
} from '../../api/publicLoggers';
import { ApiError } from '../../api/client';
import { Button, Input, Modal, OfflineRecoverySurface } from '../../components';
import type { PublicOfflineSyncResult } from '../../hooks/usePublicOfflineSync';
import { cachePublicSession, getCachedPublicSession } from '../../offline/sessionCache';
import type { AthleticsEvent } from '../../types';
import type {
  DisciplineDefinition,
  PublicMeetLoggerSnapshot,
  PublicMeetSession,
  PublicSessionEntry,
  SessionEntryInput,
  SessionEntryReplacement,
  SessionTarget,
} from '../../types/meets';
import { getIncidentTypeLabel } from '../results/resultPresentation';
import styles from '../timeline/LiveLoggingPage.module.css';
import pageStyles from './PublicLoggerPage.module.css';

const DEFAULT_SESSION_CACHE_KEY = 'public-meet';

function formatValue(value: number | null, definition: DisciplineDefinition): string {
  if (value === null) return '-';
  return `${value.toFixed(definition.precision)} ${definition.unit === 'seconds' ? 's' : definition.unit}`;
}

function incidentsFor(definition: DisciplineDefinition): Array<'false_start' | 'lane_infringement' | 'dq' | 'dnf' | 'dns'> {
  if (definition.kind === 'vertical') return ['dq', 'dns'];
  if (definition.kind === 'track' || definition.kind === 'relay') return ['false_start', 'lane_infringement', 'dq', 'dnf', 'dns'];
  return ['dq', 'dnf', 'dns'];
}

function targetFor(session: PublicMeetSession | undefined, entrantId: string): SessionTarget | null {
  return session && entrantId ? { disciplineSessionId: session.id, entrantId } : null;
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
  const [entrantId, setEntrantId] = useState('');
  const [value, setValue] = useState('');
  const [incidentType, setIncidentType] = useState('');
  const [isFoul, setIsFoul] = useState(false);
  const [verticalState, setVerticalState] = useState<'clearance' | 'failure' | 'pass' | 'void'>('clearance');
  const [editing, setEditing] = useState<PublicSessionEntry | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editIncident, setEditIncident] = useState('');
  const [editFoul, setEditFoul] = useState(false);
  const [editVerticalState, setEditVerticalState] = useState<'clearance' | 'failure' | 'pass' | 'void'>('clearance');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cacheFreshness, setCacheFreshness] = useState<number | null>(null);

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

  const session = snapshot?.sessions.find((item) => item.id === sessionId);
  const definition = snapshot?.disciplines.find((item) => item.id === session?.disciplineDefinitionId);
  const entrants = session && snapshot ? snapshot.entrants.filter((item) => session.entrantIds.includes(item.id)) : [];
  const entrant = entrants.find((item) => item.id === entrantId);
  const target = targetFor(session, entrantId);
  const loggingOpen = event.status === 'in_progress' && session?.status === 'in_progress' && session.resultState !== 'final';

  useEffect(() => {
    if (!session || !session.entrantIds.includes(entrantId)) setEntrantId(session?.entrantIds[0] ?? '');
  }, [entrantId, session]);

  const showError = (reason: unknown, fallback: string) => {
    if (reason instanceof ApiError && reason.code === 'PUBLIC_LOGGER_SESSION_INVALID') {
      setError('This public logger link is no longer available.');
      return;
    }
    setError(reason instanceof Error ? reason.message : fallback);
  };

  const buildInput = (
    nextValue: string,
    nextIncident: string,
    nextFoul: boolean,
    nextVerticalState: 'clearance' | 'failure' | 'pass' | 'void',
  ): SessionEntryInput | null => {
    if (!definition) return null;
    if (nextIncident) {
      if (definition.kind === 'vertical') {
        return { entryType: 'attempt', value: null, unit: null, isFoul: false, incidentType: nextIncident as SessionEntryInput['incidentType'], noteText: null, deviceId: null };
      }
      return { entryType: 'penalty', value: null, unit: null, isFoul: false, incidentType: nextIncident as SessionEntryInput['incidentType'], noteText: null, deviceId: null };
    }
    const fieldFoul = definition.direction === 'higher' && definition.kind !== 'vertical' && nextFoul;
    if (fieldFoul) {
      return { entryType: 'attempt', value: null, unit: null, isFoul: true, incidentType: null, noteText: null, deviceId: null };
    }
    const numeric = Number(nextValue);
    if (!nextValue.trim() || !Number.isFinite(numeric) || numeric <= 0) {
      setError(`Enter a valid ${definition.unit === 'seconds' ? 'time' : 'measurement'} before recording.`);
      return null;
    }
    return {
      ...(definition.kind === 'vertical' ? { verticalState: nextVerticalState } : {}),
      entryType: 'attempt', value: numeric, unit: definition.unit,
      isFoul: false,
      incidentType: null, noteText: null, deviceId: null,
    };
  };

  const record = async () => {
    if (!target || !loggingOpen) return;
    const payload = buildInput(value, incidentType, isFoul, verticalState);
    if (!payload) return;
    setBusy('record');
    setError(null);
    try {
      if (!offlineSync.isOnline) await offlineSync.enqueue({ target, actionType: 'create_entry', payload: { ...payload } });
      else {
        await createPublicMeetLoggerEntry(sessionToken, event.id, target, payload);
        await load();
      }
      setValue('');
      setIncidentType('');
      setIsFoul(false);
      setVerticalState('clearance');
    } catch (reason) {
      showError(reason, 'Could not record this session entry.');
    } finally {
      setBusy(null);
    }
  };

  const openEdit = (entry: PublicSessionEntry) => {
    setEditing(entry);
    setEditValue(entry.value?.toFixed(definition?.precision ?? 2) ?? '');
    setEditIncident(entry.incidentType ?? '');
    setEditFoul(entry.isFoul);
    setEditVerticalState(entry.verticalState ?? 'clearance');
  };

  const saveEdit = async () => {
    if (!editing || !target) return;
    const input = editing.entryType === 'penalty'
      ? { entryType: 'penalty' as const, value: null, unit: null, isFoul: false, incidentType: (editIncident || editing.incidentType) as SessionEntryInput['incidentType'], noteText: null, deviceId: null }
      : buildInput(editValue, editIncident, editFoul, editVerticalState);
    if (!input) return;
    const payload: SessionEntryReplacement = { ...input, expectedVersion: editing.version };
    setBusy(`edit-${editing.id}`);
    setError(null);
    try {
      if (!offlineSync.isOnline) await offlineSync.enqueue({ target, actionType: 'edit_entry', payload: { ...payload }, entryId: editing.id, expectedVersion: editing.version });
      else {
        await updatePublicMeetLoggerEntry(sessionToken, event.id, target, editing.id, payload);
        await load();
      }
      setEditing(null);
    } catch (reason) {
      showError(reason, 'Could not update this session entry.');
    } finally {
      setBusy(null);
    }
  };

  const undo = async (entry: PublicSessionEntry) => {
    if (!target) return;
    const payload = { expectedVersion: entry.version };
    setBusy(`undo-${entry.id}`);
    setError(null);
    try {
      if (!offlineSync.isOnline) await offlineSync.enqueue({ target, actionType: 'undo_entry', payload, entryId: entry.id, expectedVersion: entry.version });
      else {
        await removePublicMeetLoggerEntry(sessionToken, event.id, target, entry.id, payload);
        await load();
      }
    } catch (reason) {
      showError(reason, 'Could not undo this session entry.');
    } finally {
      setBusy(null);
    }
  };

  if (!snapshot) {
    return <main className={pageStyles.page}><section className={pageStyles.join} aria-busy="true"><p>Loading meet sessions...</p>{error && <p role="alert">{error}</p>}</section></main>;
  }

  const entries = session?.entries.filter((entry) => entry.entrantId === entrantId) ?? [];
  const activeSessions = snapshot.sessions.filter((item) => item.status === 'in_progress');
  const recoveryActions = offlineSync.queueActions.map((action) => {
    const actionSession = action.target ? snapshot.sessions.find((item) => item.id === action.target?.disciplineSessionId) : null;
    const actionEntrant = action.target ? snapshot.entrants.find((item) => item.id === action.target?.entrantId) : null;
    return {
      id: action.id, actionType: action.actionType, status: action.status, createdAt: action.createdAt,
      syncedAt: action.syncedAt, deviceId: action.deviceId,
      subject: actionEntrant ? `Entrant: ${actionEntrant.name}` : 'Session entry',
      target: actionSession ? `Session: ${actionSession.label}` : 'Meet session', error: action.error,
    };
  });

  return (
    <main className={pageStyles.page}>
      <header className={pageStyles.header}>
        <div><p className={pageStyles.kicker}>Athlora public meet logger</p><h1>{event.title}</h1><p>Choose an active session and record only registered meet entrants.</p></div>
        <Button variant="secondary" onClick={() => void load()} disabled={Boolean(busy)}>Refresh</Button>
      </header>
      <OfflineRecoverySurface
        isOnline={offlineSync.isOnline} actions={recoveryActions} cacheFreshness={cacheFreshness} isSyncing={offlineSync.isSyncing}
        onRefresh={load} onSyncNow={offlineSync.syncNow}
        onRetryAction={async (actionId) => { await offlineSync.retryFailedAction(actionId); await offlineSync.syncNow(); }}
      />
      {error && <p className={pageStyles.error} role="alert">{error}</p>}
      <div className={pageStyles.workspace}>
        <section className={pageStyles.roster} aria-label="Meet sessions and entrants">
          <h2>Active sessions</h2>
          {activeSessions.length === 0 && <p>No session is currently open for public logging.</p>}
          {activeSessions.map((item) => {
            const itemDefinition = snapshot.disciplines.find((definitionItem) => definitionItem.id === item.disciplineDefinitionId);
            return <button key={item.id} type="button" className={item.id === sessionId ? pageStyles.selected : ''} onClick={() => setSessionId(item.id)}><b>{item.label}</b><small>{itemDefinition?.presentation.label ?? 'Discipline'} · {item.entrantIds.length} entrants</small></button>;
          })}
          {session && <><h2>Registered entrants</h2>{entrants.map((item) => <button key={item.id} type="button" className={item.id === entrantId ? pageStyles.selected : ''} onClick={() => setEntrantId(item.id)}><b>{item.name}</b><small>{item.kind === 'relay' ? `Relay: ${item.members.map((member) => `L${member.leg} ${member.name}`).join(', ')}` : item.kind}</small></button>)}</>}
        </section>

        <section className={pageStyles.logger} aria-label="Session logging controls">
          {!session || !definition || !entrant ? <p>Select an active session and entrant to begin logging.</p> : <>
            <h2>{session.label}</h2><p>{definition.presentation.label} · {entrant.name} · {session.resultState ?? 'provisional'}</p>
            <fieldset disabled={!loggingOpen || Boolean(busy)}>
              <legend>Record observation</legend>
              <label>{definition.defaultRules.aggregation === 'timed' ? 'Time (seconds)' : `Measurement (${definition.unit})`}<Input type="number" inputMode="decimal" min="0.01" step={1 / (10 ** definition.precision)} value={value} onChange={(input) => setValue(input.target.value)} disabled={Boolean(incidentType)} /></label>
              {definition.kind === 'vertical' && <label>Attempt state<select value={verticalState} onChange={(input) => setVerticalState(input.target.value as typeof verticalState)} disabled={Boolean(incidentType)}><option value="clearance">Clearance</option><option value="failure">Failure</option><option value="pass">Pass</option><option value="void">Void</option></select></label>}
              {definition.direction === 'higher' && definition.kind !== 'vertical' && <label><input type="checkbox" checked={isFoul} onChange={(input) => setIsFoul(input.target.checked)} disabled={Boolean(incidentType)} /> Foul</label>}
              <label>Incident<select value={incidentType} onChange={(input) => { setIncidentType(input.target.value); if (input.target.value) setValue(''); }}><option value="">None</option>{incidentsFor(definition).map((incident) => <option key={incident} value={incident}>{getIncidentTypeLabel(incident)}</option>)}</select></label>
              <Button onClick={() => void record()} disabled={!loggingOpen || Boolean(busy) || (!value.trim() && !incidentType && !isFoul)}>{busy === 'record' ? 'Recording...' : offlineSync.isOnline ? 'Record observation' : 'Queue observation'}</Button>
            </fieldset>
            {!loggingOpen && <p>This session is not open for public logging.</p>}
            <h3>Current result</h3><p>{formatValue(session.results.find((result) => result.entrantId === entrant.id)?.value ?? null, definition)} · {session.results.find((result) => result.entrantId === entrant.id)?.outcome ?? 'no result'}</p>
          </>}
        </section>

        <section className={pageStyles.timeline} aria-label="Selected entrant timeline">
          <h2>Observation history</h2>
          {!entrant && <p>Select an entrant to view observations.</p>}
          {entrant && entries.length === 0 && <p>No observations recorded for {entrant.name}.</p>}
          {entrant && <ul>{entries.map((entry) => <li key={entry.id}><b>{entry.entryType === 'attempt' ? formatValue(entry.value, definition!) : getIncidentTypeLabel(entry.incidentType)}</b><small>{entry.verticalState ? `${entry.verticalState} · ` : ''}{entry.isFoul ? 'Foul · ' : ''}{entry.incidentType ? getIncidentTypeLabel(entry.incidentType) : 'Attempt'}</small><span>{entry.canEdit && <Button variant="secondary" onClick={() => openEdit(entry)} disabled={Boolean(busy)}>Edit</Button>}{entry.canUndo && <Button variant="danger" onClick={() => void undo(entry)} disabled={Boolean(busy)}>Undo</Button>}</span></li>)}</ul>}
        </section>
      </div>

      {editing && definition && <Modal open title="Edit public observation" onClose={() => setEditing(null)} closeDisabled={Boolean(busy)}>
        {editing.entryType === 'attempt' && <><label>{definition.defaultRules.aggregation === 'timed' ? 'Time (seconds)' : `Measurement (${definition.unit})`}<Input aria-label="Edited measurement" type="number" inputMode="decimal" min="0.01" step={1 / (10 ** definition.precision)} value={editValue} onChange={(input) => setEditValue(input.target.value)} disabled={Boolean(editIncident)} /></label>{definition.kind === 'vertical' && <label>Attempt state<select value={editVerticalState} onChange={(input) => setEditVerticalState(input.target.value as typeof editVerticalState)} disabled={Boolean(editIncident)}><option value="clearance">Clearance</option><option value="failure">Failure</option><option value="pass">Pass</option><option value="void">Void</option></select></label>}{definition.direction === 'higher' && definition.kind !== 'vertical' && <label><input type="checkbox" checked={editFoul} onChange={(input) => setEditFoul(input.target.checked)} disabled={Boolean(editIncident)} /> Foul</label>}</>}
        <label>Incident<select value={editIncident} onChange={(input) => { setEditIncident(input.target.value); if (input.target.value) setEditValue(''); }}><option value="">None</option>{incidentsFor(definition).map((incident) => <option key={incident} value={incident}>{getIncidentTypeLabel(incident)}</option>)}</select></label>
        <div className={styles.modalActions}><Button variant="secondary" onClick={() => setEditing(null)} disabled={Boolean(busy)}>Cancel</Button><Button onClick={() => void saveEdit()} disabled={Boolean(busy)}>{busy === `edit-${editing.id}` ? 'Saving...' : 'Save changes'}</Button></div>
      </Modal>}
    </main>
  );
}
