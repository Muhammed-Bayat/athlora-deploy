import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { getAthlete, updateAthlete, updateAthleteStatus } from '../../api/athletes';
import { getAthleteDisciplineStatistics, getAthleteStatistics, type AthleteDisciplineStatistics } from '../../api/statistics';
import { listInjuries } from '../../api/injuries';
import { CompactAnatomy } from '../fitness/CompactAnatomy';
import { Button, Card, Modal, SeasonSelector, Toast } from '../../components';
import { seasonLabel, seasonQueryValue, useSeasonQueryState } from '../../utils/season';
import type {
  Athlete,
  AthleteMutationPayload,
  AthleteResultHistoryEntry,
  AthleteStatisticsDetail,
} from '../../types';
import { calculateAge, formatDateOnly, formatOutcome, formatResultUnit } from '../../utils/formatting';
import { AthleteForm } from './AthleteForm';
import { athleteErrorMessage } from './athleteError';
import { listDisciplines } from '../../api/meets';
import type { DisciplineDefinition } from '../../types/meets';
import { DisciplineProgressionChart } from './DisciplineProgressionChart';
import styles from './AthleteDetailPage.module.css';

interface AthleteDetailPageProps {
  athleteId: string;
  onBack: () => void;
  onAthleteUpdated: (athlete: Athlete) => void;
  initialFitnessOpen?: boolean;
}

interface PerformanceTab {
  id: string;
  label: string;
  unit: DisciplineDefinition['unit'];
  direction: DisciplineDefinition['direction'];
  precision: number;
  pb: number | null;
  sb: number | null;
  resultCount: number;
  seasonCount: number;
}

type ResultTypeFilter = 'all' | 'competition' | 'training';

const FitnessView = lazy(async () => ({ default: (await import('../fitness/FitnessView')).FitnessView }));

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function statusLabel(status: Athlete['status']): string {
  return status[0].toUpperCase() + status.slice(1);
}

function formatPerformance(value: number | null, precision: number, unit: DisciplineDefinition['unit']): string {
  if (value === null) return 'No valid result';
  return `${value.toFixed(precision)} ${unit === 'seconds' ? 's' : unit === 'metres' ? 'm' : 'cm'}`;
}

function HistoryRow({ entry }: { entry: AthleteResultHistoryEntry }) {
  const { event, result, effectiveOutcome, effectiveResult } = entry;
  const formatMark = (value: number) => `${value.toFixed(2)}${formatResultUnit(result.unit ?? 'seconds')}`;

  return (
    <tr className={styles.historyRow}>
      <th scope="row" className={styles.historyDate}>
        <time dateTime={event.date}>{formatDateOnly(event.date)}</time>
      </th>
      <td className={styles.historyEvent}>
        <strong>{event.title}</strong>
        {event.status === 'cancelled' && <small className={styles.rowNote}>Cancelled event</small>}
      </td>
      <td className={styles.historyType}>{event.type === 'competition' ? 'Competition' : 'Training'}</td>
      <td className={styles.historyResult}>
        {effectiveOutcome === 'valid' && effectiveResult !== null
          ? <strong className={styles.historyMark}>{formatMark(effectiveResult)}</strong>
          : <span className={styles.historyOutcome}>{effectiveOutcome === 'valid' ? 'No result' : formatOutcome(effectiveOutcome)}</span>}
      </td>
    </tr>
  );
}

export function AthleteDetailPage({ athleteId, onBack, onAthleteUpdated, initialFitnessOpen = false }: AthleteDetailPageProps) {
  const [season, setSeason] = useSeasonQueryState();
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileRetry, setProfileRetry] = useState(0);
  const [statistics, setStatistics] = useState<AthleteStatisticsDetail | null>(null);
  const [statisticsLoading, setStatisticsLoading] = useState(true);
  const [statisticsError, setStatisticsError] = useState<string | null>(null);
  const [disciplineStatistics, setDisciplineStatistics] = useState<AthleteDisciplineStatistics[]>([]);
  const [disciplineStatisticsLoading, setDisciplineStatisticsLoading] = useState(true);
  const [disciplineStatisticsError, setDisciplineStatisticsError] = useState<string | null>(null);
  const [disciplineStatisticsRetry, setDisciplineStatisticsRetry] = useState(0);
  const [activePerformanceTab, setActivePerformanceTab] = useState<string | null>(null);
  const [resultType, setResultType] = useState<ResultTypeFilter>('all');
  const [activeLogDiscipline, setActiveLogDiscipline] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [fitnessOpen, setFitnessOpen] = useState(initialFitnessOpen);
  const [activeInjuries, setActiveInjuries] = useState<import('../../types').Injury[]>([]);
  const [injuryLoading, setInjuryLoading] = useState(true);
  const [injuryError, setInjuryError] = useState<string | null>(null);
  const [injuryRetry, setInjuryRetry] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [disciplines, setDisciplines] = useState<DisciplineDefinition[]>([]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const fitnessButtonRef = useRef<HTMLButtonElement>(null);
  const performanceTabRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!fitnessOpen) fitnessButtonRef.current?.focus();
  }, [fitnessOpen]);

  useEffect(() => {
    let current = true;
    setProfileLoading(true);
    setProfileError(null);
    void getAthlete(athleteId)
      .then((value) => { if (current) setAthlete(value); })
      .catch((error: unknown) => { if (current) setProfileError(athleteErrorMessage(error)); })
      .finally(() => { if (current) setProfileLoading(false); });
    return () => { current = false; };
  }, [athleteId, profileRetry]);

  useEffect(() => {
    let current = true;
    setStatisticsLoading(true);
    setStatisticsError(null);
    void (seasonQueryValue(season) ? getAthleteStatistics(athleteId, season) : getAthleteStatistics(athleteId))
      .then((value) => { if (current) setStatistics(value); })
      .catch((error: unknown) => { if (current) setStatisticsError(athleteErrorMessage(error)); })
      .finally(() => { if (current) setStatisticsLoading(false); });
    return () => { current = false; };
  }, [athleteId, season]);

  useEffect(() => {
    let current = true;
    setDisciplineStatisticsLoading(true);
    setDisciplineStatisticsError(null);
    void getAthleteDisciplineStatistics(athleteId, seasonQueryValue(season) ?? 'all')
      .then((value) => { if (current) setDisciplineStatistics(value); })
      .catch((error: unknown) => { if (current) setDisciplineStatisticsError(athleteErrorMessage(error)); })
      .finally(() => { if (current) setDisciplineStatisticsLoading(false); });
    return () => { current = false; };
  }, [athleteId, season, disciplineStatisticsRetry]);

  useEffect(() => {
    let current = true;
    setInjuryLoading(true);
    setInjuryError(null);
    void listInjuries(athleteId, undefined, 'active')
      .then((injuries) => { if (current) setActiveInjuries(injuries); })
      .catch((error: unknown) => { if (current) setInjuryError(athleteErrorMessage(error)); })
      .finally(() => { if (current) setInjuryLoading(false); });
    return () => { current = false; };
  }, [athleteId, injuryRetry]);

  useEffect(() => { void listDisciplines().then(({ data }) => setDisciplines(data)).catch(() => setDisciplines([])); }, []);

  const save = async (payload: AthleteMutationPayload) => {
    const updated = await updateAthlete(athleteId, payload);
    setAthlete(updated);
    onAthleteUpdated(updated);
    setEditing(false);
    setNotice(`${updated.name} updated.`);
  };

  const displayName = athlete?.name ?? statistics?.athlete.name ?? 'Athlete performance';
  const age = calculateAge(athlete?.dob ?? null);
  const sortedLogEntries = statistics
    ? [...statistics.recentResults.competitions, ...statistics.recentResults.training]
        .sort((left, right) => (left.event.date === right.event.date
          ? (right.event.time ?? '').localeCompare(left.event.time ?? '')
          : right.event.date.localeCompare(left.event.date)))
    : [];
  const logDisciplines = [...new Set(sortedLogEntries.map((entry) => entry.event.discipline))]
    .map((code) => {
      const definition = disciplines.find((discipline) => discipline.code === code || discipline.id === code);
      return { code, label: definition?.presentation.label ?? code };
    });
  const selectedLogDiscipline = logDisciplines.find((discipline) => discipline.code === activeLogDiscipline) ?? logDisciplines[0];
  const showLogDisciplineTabs = logDisciplines.length > 1;
  const logEntries = sortedLogEntries.filter((entry) => (
    (!selectedLogDiscipline || entry.event.discipline === selectedLogDiscipline.code)
    && (resultType === 'all' || entry.event.type === resultType)
  ));
  const emptyLogMessage = `No ${[
    ...(resultType === 'all' ? [] : [resultType]),
    selectedLogDiscipline?.label ?? '',
  ].filter(Boolean).join(' ')} results yet.`;
  const isArchived = athlete?.status === 'archived';
  const disciplineLabels = athlete?.preferredDisciplineIds
    .map((id) => disciplines.find((discipline) => discipline.id === id)?.presentation.label ?? id)
    ?? [];
  const performanceTabs: PerformanceTab[] = athlete?.preferredDisciplineIds.map((id) => {
    const definition = disciplines.find((discipline) => discipline.id === id);
    const statisticsForDiscipline = definition
      ? disciplineStatistics.find((entry) => entry.discipline === definition.code)
      : undefined;
    return {
      id,
      label: definition?.presentation.label ?? statisticsForDiscipline?.label ?? id,
      unit: definition?.unit ?? statisticsForDiscipline?.unit ?? 'seconds',
      direction: definition?.direction ?? statisticsForDiscipline?.direction ?? 'lower',
      precision: definition?.precision ?? statisticsForDiscipline?.precision ?? 2,
      pb: statisticsForDiscipline?.pb ?? null,
      sb: statisticsForDiscipline?.sb ?? null,
      resultCount: statisticsForDiscipline?.resultCount ?? 0,
      seasonCount: statisticsForDiscipline?.seasonCount ?? 0,
    };
  }) ?? [];
  const selectedPerformanceTab = performanceTabs.find((tab) => tab.id === activePerformanceTab) ?? performanceTabs[0];
  useEffect(() => {
    if (selectedPerformanceTab && selectedPerformanceTab.id !== activePerformanceTab) {
      setActivePerformanceTab(selectedPerformanceTab.id);
    }
  }, [activePerformanceTab, selectedPerformanceTab]);

  const changePerformanceTab = (tabId: string, offset?: number) => {
    const currentIndex = performanceTabs.findIndex((tab) => tab.id === tabId);
    const next = offset === undefined ? tabId : performanceTabs[(currentIndex + offset + performanceTabs.length) % performanceTabs.length]?.id;
    if (!next) return;
    setActivePerformanceTab(next);
    if (offset !== undefined) window.requestAnimationFrame(() => performanceTabRefs.current.get(next)?.focus());
  };

  if (fitnessOpen) {
    return <Suspense fallback={<section className={styles.detail}><p role="status">Loading Fitness...</p></section>}><FitnessView
      athleteId={athleteId}
      athleteName={displayName}
      athleteFocus={disciplineLabels.join(', ') || null}
      athleteStatus={athlete?.status ?? 'active'}
      canOperate
      onBack={() => setFitnessOpen(false)}
      onSetInactive={() => {
        void updateAthleteStatus(athleteId, 'inactive').then((updated) => {
          setAthlete(updated);
          onAthleteUpdated(updated);
          setNotice(`${updated.name} set to inactive.`);
        });
      }}
    /></Suspense>;
  }

  return (
    <section
      className={styles.detail}
      aria-labelledby="athlete-detail-heading"
      aria-busy={profileLoading || statisticsLoading}
    >
      <Button variant="ghost" className={styles.backButton} onClick={onBack}>Back to roster</Button>
      {notice && <Toast variant="success" onDismiss={() => setNotice(null)}>{notice}</Toast>}

      <header className={styles.hero}>
        <span className={styles.avatar} aria-hidden="true">{initials(displayName)}</span>
        <div className={styles.identity}>
          <p>Featured athlete</p>
          <p className={styles.heroAge}>Age: <strong>{age === null ? 'Not provided' : `${age} years`}</strong></p>
          <h1 id="athlete-detail-heading" ref={headingRef} tabIndex={-1}>{displayName}</h1>
          <div className={styles.heroMeta}>
            <ul className={styles.disciplineList} aria-label="Disciplines">
              {disciplineLabels.length > 0
                ? disciplineLabels.map((label) => <li key={label}>{label}</li>)
              : <li>No disciplines selected</li>}
            </ul>
          </div>
        </div>
        <div className={styles.heroActions}>
          <SeasonSelector value={season} onChange={setSeason} />
          {athlete && (
            <span className={athlete.status === 'archived' ? styles.archivedState : athlete.status === 'inactive' ? styles.inactiveState : styles.activeState}>
              {statusLabel(athlete.status)} athlete
            </span>
          )}
          {athlete && !isArchived && <Button ref={fitnessButtonRef} onClick={() => setFitnessOpen(true)}>Fitness</Button>}
          {athlete && !isArchived && <Button ref={editButtonRef} variant="secondary" onClick={() => setEditing(true)}>Edit profile</Button>}
          {isArchived && <span className={styles.readOnlyNotice}>Archived profiles are read-only.</span>}
        </div>
      </header>

      <Card className={styles.performanceCard}>
        <header><div><p>Performance statistics</p><h2>Discipline results</h2></div></header>
        {disciplineStatisticsLoading && <p role="status">Loading discipline statistics...</p>}
        {!disciplineStatisticsLoading && disciplineStatisticsError && <div className={styles.sectionError} role="alert"><strong>Statistics unavailable</strong><p>{disciplineStatisticsError}</p><Button onClick={() => setDisciplineStatisticsRetry((value) => value + 1)}>Retry statistics</Button></div>}
        {!disciplineStatisticsLoading && !disciplineStatisticsError && performanceTabs.length === 0 && <p>No disciplines selected. Edit this athlete to add disciplines.</p>}
        {!disciplineStatisticsLoading && !disciplineStatisticsError && selectedPerformanceTab && <>
          <div className={styles.performanceTabs} role="tablist" aria-label="Discipline performance statistics">
            {performanceTabs.map((tab) => <button key={tab.id} ref={(node) => { if (node) performanceTabRefs.current.set(tab.id, node); else performanceTabRefs.current.delete(tab.id); }} type="button" role="tab" id={`performance-${tab.id}-tab`} aria-selected={selectedPerformanceTab.id === tab.id} aria-controls={`performance-${tab.id}-panel`} tabIndex={selectedPerformanceTab.id === tab.id ? 0 : -1} onClick={() => changePerformanceTab(tab.id)} onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); changePerformanceTab(tab.id, 1); }
              if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); changePerformanceTab(tab.id, -1); }
              if (event.key === 'Home') { event.preventDefault(); changePerformanceTab(performanceTabs[0]!.id, 0); }
              if (event.key === 'End') { event.preventDefault(); changePerformanceTab(performanceTabs[performanceTabs.length - 1]!.id, 0); }
            }}>{tab.label}</button>)}
          </div>
          <div className={styles.performancePanel} role="tabpanel" id={`performance-${selectedPerformanceTab.id}-panel`} aria-labelledby={`performance-${selectedPerformanceTab.id}-tab`} tabIndex={0}>
            <dl className={styles.metrics}>
              <div><dt>Personal best</dt><dd>{formatPerformance(selectedPerformanceTab.pb, selectedPerformanceTab.precision, selectedPerformanceTab.unit)}</dd><span>All time</span></div>
              <div><dt>Season best</dt><dd>{formatPerformance(selectedPerformanceTab.sb, selectedPerformanceTab.precision, selectedPerformanceTab.unit)}</dd><span>{seasonLabel(season)}</span></div>
            </dl>
            <DisciplineProgressionChart athleteId={athleteId} disciplineDefinitionId={selectedPerformanceTab.id} disciplineLabel={selectedPerformanceTab.label} direction={selectedPerformanceTab.direction} unit={selectedPerformanceTab.unit} precision={selectedPerformanceTab.precision} season={season} />
          </div>
        </>}
      </Card>


      <Card className={styles.injuryCard}>
        <header><div><p>Fitness overview</p><h2>Active injury map</h2></div></header>
        {injuryLoading && <p role="status">Loading injury summary...</p>}
        {!injuryLoading && injuryError && <div className={styles.sectionError} role="alert"><strong>Injury summary unavailable</strong><p>{injuryError}</p><Button onClick={() => setInjuryRetry((value) => value + 1)}>Retry injury summary</Button></div>}
        {!injuryLoading && !injuryError && <CompactAnatomy injuries={activeInjuries} highestSeverity={activeInjuries.reduce<import('../../types').InjurySeverity | null>((highest, injury) => !highest || ({ Minor: 1, Moderate: 2, Severe: 3 }[injury.severity] > { Minor: 1, Moderate: 2, Severe: 3 }[highest]) ? injury.severity : highest, null)} size="large" onOpenFitness={() => setFitnessOpen(true)} disabled={isArchived} />}
        {isArchived && <p className={styles.injuryHint}>Archived athlete injury records remain visible but read-only.</p>}
      </Card>

      <Card className={styles.profileCard}>
        <header><div><p>Profile</p><h2>Personal details</h2></div></header>
        {profileLoading && <p role="status">Loading athlete profile...</p>}
        {!profileLoading && profileError && (
          <div className={styles.sectionError} role="alert">
            <strong>Profile unavailable</strong><p>{profileError}</p>
            <Button onClick={() => setProfileRetry((value) => value + 1)}>Retry profile</Button>
          </div>
        )}
        {!profileLoading && athlete && (
          <dl className={styles.profileDetails}>
            <div><dt>Date of birth</dt><dd>{formatDateOnly(athlete.dob)}</dd></div>
            <div><dt>Current age</dt><dd>{age === null ? 'Not provided' : `${age} years`}</dd></div>
              <div><dt>Gender</dt><dd>{athlete.gender ?? 'Not provided'}</dd></div>
              <div><dt>Status changed</dt><dd><time dateTime={athlete.statusChangedAt}>{new Date(athlete.statusChangedAt).toLocaleDateString()}</time></dd></div>
              <div className={styles.notes}><dt>Notes</dt><dd>{athlete.notes ?? 'Not provided'}</dd></div>
              <div className={styles.notes}><dt>Discipline groups</dt><dd>{disciplineLabels.join(', ') || 'Not provided'}</dd></div>
           </dl>
        )}
       </Card>

       <Card className={styles.historyCard}>
        <header>
          <div><p>Performance log</p><h2>Recent results</h2></div>
          {statistics && (
            <label className={styles.logFilter}>
              <span>Type</span>
              <select value={resultType} onChange={(event) => setResultType(event.target.value as ResultTypeFilter)}>
                <option value="all">All types</option>
                <option value="competition">Competition</option>
                <option value="training">Training</option>
              </select>
            </label>
          )}
        </header>
        {statisticsLoading && <p role="status">Loading recent results...</p>}
        {!statisticsLoading && statisticsError && <p className={styles.historyUnavailable}>Recent results are unavailable until statistics can be loaded.</p>}
        {!statisticsLoading && statistics && (
          logDisciplines.length === 0
            ? <p className={styles.emptyHistory}>No results yet.</p>
            : (
              <>
                {showLogDisciplineTabs && (
                  <div className={styles.historyDisciplineTabs} role="tablist" aria-label="Result history discipline">
                    {logDisciplines.map((discipline) => (
                      <button
                        key={discipline.code}
                        id={`log-tab-${discipline.code}`}
                        type="button"
                        role="tab"
                        aria-selected={selectedLogDiscipline?.code === discipline.code}
                        aria-controls="log-results-panel"
                        onClick={() => setActiveLogDiscipline(discipline.code)}
                      >{discipline.label}</button>
                    ))}
                  </div>
                )}
                <div
                  className={styles.historyTableWrap}
                  role={showLogDisciplineTabs ? 'tabpanel' : undefined}
                  id={showLogDisciplineTabs ? 'log-results-panel' : undefined}
                  aria-labelledby={showLogDisciplineTabs && selectedLogDiscipline ? `log-tab-${selectedLogDiscipline.code}` : undefined}
                  tabIndex={showLogDisciplineTabs ? 0 : undefined}
                >
                  {logEntries.length === 0
                    ? <p className={styles.emptyHistory}>{emptyLogMessage}</p>
                    : (
                      <table className={styles.historyTable} aria-label="Recent results">
                        <thead>
                          <tr>
                            <th scope="col">Date</th>
                            <th scope="col">Event</th>
                            <th scope="col">Type</th>
                            <th scope="col">Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logEntries.map((entry) => <HistoryRow key={`${entry.event.id}-${entry.result.updatedAt}`} entry={entry} />)}
                        </tbody>
                      </table>
                    )}
                </div>
              </>
            )
        )}
      </Card>

      <Modal open={editing} title="Edit athlete" onClose={() => { if (!editorBusy) setEditing(false); }} closeDisabled={editorBusy}>
        {editing && athlete && <AthleteForm key={athlete.updatedAt} athlete={athlete} onSave={save} onCancel={() => setEditing(false)} onSubmittingChange={setEditorBusy} />}
      </Modal>
    </section>
  );
}
