import { useCallback, useEffect, useState } from 'react';
import * as api from '../../api/meets';
import { listAthletes } from '../../api/athletes';
import { Button, Select } from '../../components';
import type { AthleticsEvent, Athlete } from '../../types';
import type { DisciplineDefinition, DisciplineSession, MeetEntrant, SessionEntry, SessionResult } from '../../types/meets';
import { standingsMembers, standingsTeam } from './standingsDisplay';
import styles from './SessionLivePanel.module.css';

export function VerticalEventsPanel({ event, canOperate, isCoach }: { event: AthleticsEvent; canOperate: boolean; isCoach: boolean }) {
  const [definitions, setDefinitions] = useState<DisciplineDefinition[]>([]);
  const [sessions, setSessions] = useState<DisciplineSession[]>([]);
  const [entrants, setEntrants] = useState<MeetEntrant[]>([]);
  const [selected, setSelected] = useState('');
  const [definitionId, setDefinitionId] = useState('');
  const [startingHeight, setStartingHeight] = useState('');
  const [increment, setIncrement] = useState('0.02');
  const [limit, setLimit] = useState('3');
  const [round, setRound] = useState<'qualification' | 'final'>('final');
  const [name, setName] = useState('');
  const [athleteId, setAthleteId] = useState('');
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [entrantId, setEntrantId] = useState('');
  const [registered, setRegistered] = useState<string[]>([]);
  const [height, setHeight] = useState('');
  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const [results, setResults] = useState<SessionResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const session = sessions.find(s => s.id === selected);
  const definition = definitions.find(d => d.id === session?.disciplineDefinitionId);
  const reload = useCallback(async () => {
    const [d, s, en] = await Promise.all([api.listDisciplines(), api.listSessions(event.id), api.listEntrants(event.id)]);
    setDefinitions(d.data.filter(item => item.kind === 'vertical')); setSessions(s.data); setEntrants(en.data);
    if (selected) {
      const [history, board, registrations] = await Promise.all([api.listSessionEntries(event.id, selected), api.listSessionResults(event.id, selected), api.listRegistrations(event.id, selected)]);
      setEntries(history.data); setResults(board.data); setRegistered(registrations.data.filter(r => !r.withdrawnAt).map(r => r.entrantId));
    }
  }, [event.id, selected]);
  useEffect(() => { void reload().catch(e => setError(e instanceof Error ? e.message : 'Unable to load vertical sessions')); }, [reload, event.status]);
  useEffect(() => {
    const timer = window.setInterval(() => { void reload().catch(() => setError('Results refresh failed; displayed results may be stale')); }, 15000);
    return () => window.clearInterval(timer);
  }, [reload]);
  useEffect(() => { if (isCoach && event.status === 'scheduled') void listAthletes({ status: 'active' }).then(r => setAthletes(r.data)).catch(() => setError('Unable to load roster athletes')); }, [isCoach, event.status]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await action(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save'); } finally { setBusy(false); }
  }
  const target = { disciplineSessionId: selected, entrantId };
  const live = canOperate && session?.status === 'in_progress' && (event.status === 'in_progress' || (isCoach && session.resultState === 'reopened' && event.status === 'completed'));
  const format = (value: number | null) => value === null ? 'NH' : `${value.toFixed(definition?.precision ?? 2)} m`;
  function exportResults() {
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const lines = [['Team / club', 'Members', 'Highest clearance (m)', 'Place', 'Failures at best', 'Failures through best', 'History'], ...results.map(r => {
      const entrant = entrants.find(e => e.id === r.entrantId);
      return [standingsTeam(entrant), standingsMembers(entrant, entrants), r.effectiveResult?.toFixed(definition?.precision ?? 2) ?? 'NH', r.placing, r.vertical?.failuresAtBest, r.vertical?.totalFailuresToBest, entries.filter(e => e.entrantId === r.entrantId).map(e => `${e.attemptOrder}: ${e.value} ${e.verticalState ?? e.incidentType} (by ${e.recorderName ?? 'unknown'})`).join('; ')];
    })];
    const url = URL.createObjectURL(new Blob([lines.map(line => line.map(quote).join(',')).join('\n')], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = 'vertical-results.csv'; link.click(); URL.revokeObjectURL(url);
  }
  return <section aria-label="Vertical events"><h2>High Jump / Pole Vault</h2>
    {error && <p role="alert">{error}</p>}
    {canOperate && ['scheduled', 'in_progress'].includes(event.status) && <form onSubmit={e => { e.preventDefault(); void run(async () => { const created = await api.createSession(event.id, { disciplineDefinitionId: definitionId, label: `${definitions.find(d => d.id === definitionId)?.presentation.label} ${round}`, verticalConfig: { startingHeight: Number(startingHeight), heightIncrement: Number(increment), failureLimit: Number(limit), round } }); setSelected(created.id); setHeight(startingHeight); }); }}>
      <label>Vertical discipline<Select aria-label="Vertical discipline" required value={definitionId} onChange={e => { setDefinitionId(e.target.value); const d = definitions.find(item => item.id === e.target.value); setIncrement(String(d?.defaultRules.heightIncrement ?? 0.02)); setLimit(String(d?.defaultRules.failureLimit ?? 3)); }} options={[{ value: '', label: 'Choose discipline' }, ...definitions.map(d => ({ value: d.id, label: d.presentation.label }))]} /></label>
      <label>Starting height (m)<input required type="number" min="0.01" step="0.01" value={startingHeight} onChange={e => setStartingHeight(e.target.value)} /></label>
      <label>Height increment (m)<input required type="number" min="0.01" step="0.01" value={increment} onChange={e => setIncrement(e.target.value)} /></label>
      <label>Consecutive failure limit<input required type="number" min="1" max="10" value={limit} onChange={e => setLimit(e.target.value)} /></label>
      <label>Round<Select aria-label="Round" value={round} onChange={e => setRound(e.target.value as typeof round)} options={[{ value: 'final', label: 'Final' }, { value: 'qualification', label: 'Qualification' }]} /></label><Button type="submit" disabled={busy}>Add vertical session</Button>
    </form>}
    <label>Vertical session<Select aria-label="Vertical session" value={selected} onChange={e => { setSelected(e.target.value); setEntrantId(''); setHeight(String(sessions.find(s => s.id === e.target.value)?.verticalConfig?.startingHeight ?? '')); }} options={[{ value: '', label: 'Choose session' }, ...sessions.filter(s => definitions.some(d => d.id === s.disciplineDefinitionId)).map(s => ({ value: s.id, label: `${s.label} — ${s.status}` }))]} /></label>
    {session && <>
      <p>Results: {session.resultState ?? 'provisional'}</p>
      <p>{session.verticalConfig?.round}: {session.verticalConfig?.startingHeight.toFixed(2)} m + {session.verticalConfig?.heightIncrement.toFixed(2)} m; {session.verticalConfig?.failureLimit} consecutive failures.</p>
      {isCoach && event.status === 'scheduled' && session.status === 'scheduled' && <form onSubmit={e => { e.preventDefault(); void run(async () => { const en = entrants.find(item => item.athleteId === athleteId && athleteId) ?? await api.createEntrant(event.id, athleteId ? { kind: 'athlete', athleteId } : { kind: 'guest', name }); await api.registerEntrant(event.id, { disciplineSessionId: selected, entrantId: en.id }); setEntrantId(en.id); setName(''); setAthleteId(''); }); }}><label>Guest name<input value={name} onChange={e => setName(e.target.value)} /></label><label>Or roster athlete<Select aria-label="Or roster athlete" value={athleteId} onChange={e => setAthleteId(e.target.value)} options={[{ value: '', label: 'Choose athlete' }, ...athletes.map(a => ({ value: a.id, label: a.name }))]} /></label><Button type="submit" disabled={busy}>Add entrant</Button></form>}
      <label>Vertical entrant<Select aria-label="Vertical entrant" value={entrantId} onChange={e => setEntrantId(e.target.value)} options={[{ value: '', label: 'Choose entrant' }, ...entrants.filter(e => e.kind !== 'relay').map(e => ({ value: e.id, label: `${e.name}${registered.includes(e.id) ? '' : ' (not registered)'}` }))]} /></label>
      {isCoach && session.status === 'scheduled' && entrantId && !registered.includes(entrantId) && <Button disabled={busy} onClick={() => void run(() => api.registerEntrant(event.id, target))}>Register entrant</Button>}
      {canOperate && session.status === 'scheduled' && event.status === 'in_progress' && <Button disabled={busy} onClick={() => void run(() => api.changeSessionState(event.id, selected, 'in_progress', session.version))}>Start vertical session</Button>}
      {live && <fieldset disabled={busy || !registered.includes(entrantId)}><legend>Log vertical attempt</legend><label>Target height (m)<input type="number" min={session.verticalConfig?.startingHeight} step={session.verticalConfig?.heightIncrement} value={height} onChange={e => setHeight(e.target.value)} /></label><Button onClick={() => setHeight((Number(height) + (session.verticalConfig?.heightIncrement ?? 0)).toFixed(2))}>Next height</Button>{(['clearance', 'failure', 'pass'] as const).map(state => <Button key={state} disabled={results.find(r => r.entrantId === entrantId)?.vertical?.eliminated} onClick={() => void run(() => api.createSessionEntry(event.id, target, { entryType: 'attempt', value: Number(height), unit: 'metres', verticalState: state, isFoul: false, incidentType: null, noteText: null, deviceId: null }))}>{state}</Button>)}</fieldset>}
      <h3>Attempt history</h3><ol>{entries.filter(e => !entrantId || e.entrantId === entrantId).map(e => <li key={e.id}>#{e.attemptOrder} {format(e.value)} — {e.verticalState ?? e.incidentType}{e.recorderName && ` · by ${e.recorderName}`} {live && isCoach && e.verticalState && e.verticalState !== 'void' && e.canEdit !== false && <Button disabled={busy} onClick={() => void run(() => api.replaceSessionEntry(event.id, { disciplineSessionId: selected, entrantId: e.entrantId }, e.id, { entryType: e.entryType, value: e.value, unit: e.unit, isFoul: false, incidentType: null, noteText: e.noteText, deviceId: null, verticalState: 'void', expectedVersion: e.version }))}>Void attempt {e.attemptOrder}</Button>}</li>)}</ol>
      {live && isCoach && <Button disabled={busy} onClick={() => void run(() => api.changeSessionState(event.id, selected, 'completed', session.version))}>Finalize vertical session</Button>}
      {isCoach && canOperate && session.status === 'completed' && event.status !== 'cancelled' && <Button disabled={busy} onClick={() => void run(() => api.changeSessionState(event.id, selected, 'in_progress', session.version))}>Reopen vertical session</Button>}
      <h3>Highest clearances {session.status !== 'completed' && '(provisional)'}</h3><p>Countback: failures at best height, then total failures through best. Equal keys share places; no jump-off.</p>
      <div className={styles.standingsScroll}>
        <table className={styles.standingsTable}>
          <thead>
            <tr>
              <th scope="col" className={styles.numeric}>Place</th>
              <th scope="col">Team / club</th>
              <th scope="col">Members</th>
              <th scope="col" className={styles.numeric}>Highest clearance</th>
              <th scope="col" className={styles.numeric}>Countback</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {[...results]
              .sort((a, b) => (a.placing ?? 999) - (b.placing ?? 999))
              .map(r => {
                const entrant = entrants.find(e => e.id === r.entrantId);
                return (
                  <tr key={r.entrantId}>
                    <td className={styles.numeric}>{r.placing ?? '—'}</td>
                    <td>{standingsTeam(entrant)}</td>
                    <td>{standingsMembers(entrant, entrants)}</td>
                    <td className={styles.numeric}>{format(r.effectiveResult)} {r.isPb && 'PB'} {r.isSb && 'SB'}</td>
                    <td className={styles.numeric}>{r.vertical?.failuresAtBest} / {r.vertical?.totalFailuresToBest}</td>
                    <td>{r.vertical?.eliminated ? 'Eliminated' : r.effectiveOutcome}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <Button onClick={exportResults}>Export vertical results</Button>
    </>}
  </section>;
}
