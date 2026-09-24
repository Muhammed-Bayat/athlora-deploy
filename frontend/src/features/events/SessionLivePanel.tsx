import { useCallback, useEffect, useState } from 'react';
import * as meets from '../../api/meets';
import { Button } from '../../components';
import { useWorkspace } from '../auth/WorkspaceContext';
import { useRealtimeRoom } from '../realtime/useRealtimeRoom';
import { useSessionOffline } from '../../hooks/useSessionOffline';
import { useCurrentUser } from '../auth/CurrentUserContext';
import { QueueStatusBadge } from '../timeline/QueueStatusBadge';
import type { AthleticsEvent } from '../../types';
import type { DisciplineDefinition, DisciplineSession, MeetEntrant, SessionEntry, SessionResult } from '../../types/meets';

function formatResult(value: number | null, definition?: DisciplineDefinition): string {
  if (value === null) return '—';
  return `${value.toFixed(definition?.precision ?? 2)} ${definition?.unit === 'metres' || definition?.unit === 'cm' ? definition.unit : 's'}`;
}

function memberSummary(entrant: MeetEntrant | undefined, entrants: MeetEntrant[]): string {
  if (!entrant || entrant.kind !== 'relay') return '';
  return entrant.memberIds
    .map((id) => entrants.find((item) => item.id === id)?.name ?? 'Member')
    .join(' → ');
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
  const [entrantId, setEntrantId] = useState('');
  const [value, setValue] = useState('');
  const [incidentType, setIncidentType] = useState('');
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const offline = useSessionOffline(currentUser?.id ?? 'anonymous', event.id, activeWorkspace.id);

  const session = sessions.find((item) => item.id === sessionId);
  const definition = definitions.find((item) => item.id === session?.disciplineDefinitionId);
  const selectedEntrant = entrants.find((item) => item.id === entrantId);
  const live = canOperate && session?.status === 'in_progress' && event.status === 'in_progress';

  const reload = useCallback(async () => {
    const [catalogue, nextSessions, nextEntrants] = await Promise.all([
      meets.listDisciplines(), meets.listSessions(event.id), meets.listEntrants(event.id),
    ]);
    setDefinitions(catalogue.data);
    setSessions(nextSessions.data);
    setEntrants(nextEntrants.data.map((item) => ({ ...item, memberIds: item.memberIds ?? [] })));
    if (sessionId) {
      const [history, board] = await Promise.all([
        meets.listSessionEntries(event.id, sessionId),
        meets.listSessionResults(event.id, sessionId),
      ]);
      setEntries(history.data.filter((entry) => !entrantId || entry.entrantId === entrantId));
      setResults(board.data);
    }
  }, [event.id, sessionId, entrantId]);

  useEffect(() => {
    void reload().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load session logging'));
  }, [reload, event.status, reloadKey]);

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

  const target = { disciplineSessionId: sessionId, entrantId };
  const selectedResult = results.find((row) => row.entrantId === entrantId);
  const teamEntries = entries.filter((entry) => entry.entrantId === entrantId && entry.entryType === 'attempt' && !entry.deletedAt);

  const logAttempt = () => run(async () => {
    if (!sessionId || !entrantId) return;
    const payload = {
      entryType: 'attempt' as const,
      value: value === '' ? null : Number(value),
      unit: value === '' && incidentType ? null : definition?.unit ?? 'seconds',
      isFoul: false,
      incidentType: (incidentType || null) as SessionEntry['incidentType'],
      noteText: noteText.trim() || null,
      deviceId: null,
    };
    const queued = await offline.enqueueCreateEntry(event.id, activeWorkspace.id, target, payload);
    if (!queued) await meets.createSessionEntry(event.id, target, payload);
    setValue('');
    setIncidentType('');
    setNoteText('');
  });

  const selectOfficial = (entryId: string | null) => run(async () => {
    if (!selectedResult) return;
    await meets.selectSessionResultEntry(event.id, target, { entryId, expectedVersion: selectedResult.version });
  });

  const undoEntry = (entry: SessionEntry) => run(async () => {
    const queued = await offline.enqueueUndoEntry(event.id, activeWorkspace.id, target, entry.id, entry.version);
    if (!queued) await meets.undoSessionEntry(event.id, target, entry.id, entry.version);
  });

  const startSession = () => run(() => meets.changeSessionState(event.id, sessionId, 'in_progress', session!.version));
  const completeSession = () => run(() => meets.changeSessionState(event.id, sessionId, 'completed', session!.version));

  const timedSessions = sessions.filter((item) => {
    const def = definitions.find((candidate) => candidate.id === item.disciplineDefinitionId);
    return def && def.defaultRules.aggregation === 'timed' && def.kind !== 'vertical';
  });

  function exportResults() {
    const quote = (cell: unknown) => `"${String(cell ?? '').replaceAll('"', '""')}"`;
    const rows = [
      ['Place', 'Team', 'Members', 'Result', 'Outcome', 'Official entry'],
      ...results.map((row) => {
        const entrant = entrants.find((item) => item.id === row.entrantId);
        return [
          row.placing ?? '',
          entrant?.name ?? '',
          memberSummary(entrant, entrants),
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

  if (event.discipline !== null) return null;

  return (
    <section aria-label="Session live logging" aria-busy={busy}>
      <h2>Session live logger</h2>
      <p>Team-level timed logging with coach-selected official results. Offline attempts queue and sync when reconnecting.</p>
      <QueueStatusBadge eventId={event.id} userId={currentUser?.id ?? 'anonymous'} />
      {error && <p role="alert">{error}</p>}
      <label>
        Session
        <select value={sessionId} onChange={(input) => { setSessionId(input.target.value); setEntrantId(''); }}>
          <option value="">Choose session</option>
          {timedSessions.map((item) => <option key={item.id} value={item.id}>{item.label} ({item.status})</option>)}
        </select>
      </label>
      {session && definition && (
        <>
          <p>{definition.presentation.label}: {session.status}</p>
          {canOperate && session.status === 'scheduled' && event.status === 'in_progress' && (
            <Button onClick={() => void startSession()} disabled={busy}>Start session</Button>
          )}
          {canOperate && session.status === 'in_progress' && (
            <Button variant="secondary" onClick={() => void completeSession()} disabled={busy}>Complete session</Button>
          )}
          <label>
            Team
            <select value={entrantId} onChange={(input) => setEntrantId(input.target.value)}>
              <option value="">Choose team</option>
              {entrants
                .filter((item) => (item.kind === 'relay') === (definition.defaultRules.entrantType === 'relay'))
                .map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          {selectedEntrant?.kind === 'relay' && (
            <p aria-label="Team members">Legs: {memberSummary(selectedEntrant, entrants) || 'Members not listed'}</p>
          )}
          {live && entrantId && (
            <fieldset disabled={busy}>
              <legend>Log attempt</legend>
              <label>
                Time (s)
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={value}
                  onChange={(input) => setValue(input.target.value)}
                  disabled={Boolean(incidentType)}
                />
              </label>
              <label>
                Incident
                <select value={incidentType} onChange={(input) => { setIncidentType(input.target.value); if (input.target.value) setValue(''); }}>
                  <option value="">None</option>
                  <option value="false_start">False start</option>
                  <option value="dq">DQ</option>
                  <option value="dnf">DNF</option>
                  <option value="dns">DNS</option>
                  <option value="lane_infringement">Lane infringement</option>
                </select>
              </label>
              <label>
                Note
                <input value={noteText} onChange={(input) => setNoteText(input.target.value)} maxLength={2000} />
              </label>
              <Button onClick={() => void logAttempt()} disabled={busy || (!value && !incidentType)}>Log attempt</Button>
            </fieldset>
          )}
          <h3>Attempts</h3>
          <ol>
            {teamEntries.map((entry, index) => (
              <li key={entry.id}>
                #{index + 1} {formatResult(entry.value, definition)} {entry.incidentType ?? ''}
                {selectedResult?.selectedEntryId === entry.id && ' · official'}
                {isCoach && live && (
                  <>
                    {' '}
                    <Button
                      variant="secondary"
                      disabled={busy || selectedResult?.selectedEntryId === entry.id}
                      onClick={() => void selectOfficial(entry.id)}
                    >
                      Make official
                    </Button>
                    <Button variant="secondary" disabled={busy} onClick={() => void undoEntry(entry)}>Undo</Button>
                  </>
                )}
              </li>
            ))}
            {teamEntries.length === 0 && <li>No attempts logged yet.</li>}
          </ol>
          {isCoach && selectedResult && teamEntries.length > 0 && selectedResult.selectedEntryId && (
            <Button variant="secondary" disabled={busy} onClick={() => void selectOfficial(null)}>Clear official selection</Button>
          )}
          <h3>Standings {session.status !== 'completed' && '(provisional)'}</h3>
          <table>
            <thead>
              <tr>
                <th scope="col">Place</th>
                <th scope="col">Team</th>
                <th scope="col">Members</th>
                <th scope="col">Result</th>
                <th scope="col">Status</th>
                <th scope="col">Official entry</th>
              </tr>
            </thead>
            <tbody>
              {[...results]
                .sort((a, b) => (a.placing ?? 999) - (b.placing ?? 999))
                .map((row) => {
                  const entrant = entrants.find((item) => item.id === row.entrantId);
                  return (
                    <tr key={row.entrantId}>
                      <td>{row.placing ?? '—'}</td>
                      <td>{entrant?.name ?? 'Team'}</td>
                      <td>{memberSummary(entrant, entrants)}</td>
                      <td>{formatResult(row.effectiveResult, definition)}</td>
                      <td>{row.effectiveOutcome}</td>
                      <td>{row.selectedEntryId ? 'Selected' : 'Latest'}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          <Button variant="secondary" onClick={exportResults} disabled={results.length === 0}>Export results CSV</Button>
        </>
      )}
    </section>
  );
}
