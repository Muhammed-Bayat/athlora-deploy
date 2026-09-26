import { lazy, Suspense, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { getAthlete, updateAthlete, updateAthleteStatus } from '../../api/athletes';
import { getAthleteDisciplineStatistics, getAthleteStatistics, type AthleteDisciplineStatistics } from '../../api/statistics';
import { listInjuries } from '../../api/injuries';
import { CompactAnatomy } from '../fitness/CompactAnatomy';
import { Badge, Button, Card, Modal, SeasonSelector, Toast } from '../../components';
import { seasonLabel, seasonQueryValue, useSeasonQueryState } from '../../utils/season';
import type {
  Athlete,
  AthleteMutationPayload,
  AthleteResultHistoryEntry,
  AthleteStatisticsDetail,
  ResultOutcome,
} from '../../types';
import { calculateAge, format100mSeconds, formatDateOnly, formatOutcome } from '../../utils/formatting';
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

type HistoryTab = 'competitions' | 'training';

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

const historyTabs: HistoryTab[] = ['competitions', 'training'];
const FitnessView = lazy(async () => ({ default: (await import('../fitness/FitnessView')).FitnessView }));

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function outcomeVariant(outcome: ResultOutcome): 'dq' | 'dnf' | 'dns' | 'neutral' {
  return outcome === 'dq' || outcome === 'dnf' || outcome === 'dns' ? outcome : 'neutral';
}

function statusLabel(status: Athlete['status']): string {
  return status[0].toUpperCase() + status.slice(1);
}

function formatPerformance(value: number | null, precision: number, unit: DisciplineDefinition['unit']): string {
  if (value === null) return 'No valid result';
  return `${value.toFixed(precision)} ${unit === 'seconds' ? 's' : unit === 'metres' ? 'm' : 'cm'}`;
}

function normalizeDiscipline(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function HistoryRow({ entry }: { entry: AthleteResultHistoryEntry }) {
  const { event, result, effectiveOutcome, effectiveResult } = entry;
  const hasOverride = result.manualOverride !== null;
  const rawDescription = result.finalResult !== null
    ? format100mSeconds(result.finalResult)
    : formatOutcome(result.outcome);

  return (
    <li className={styles.historyRow}>
      <div className={styles.eventIdentity}>
        <time dateTime={event.date}>{formatDateOnly(event.date)}</time>
        <strong>{event.title}</strong>
        <div className={styles.labels}>
          <Badge>{event.type === 'competition' ? 'Competition' : 'Training'}</Badge>
          {event.status === 'cancelled' && <Badge variant="foul">Cancelled event</Badge>}
        </div>
      </div>
      <div className={styles.effectiveResult}>
        <span>Effective result</span>
        {effectiveOutcome === 'valid' && effectiveResult !== null ? (
          <>
            <strong>{format100mSeconds(effectiveResult)}</strong>
            <small>Valid 100m result</small>
          </>
        ) : (
          <Badge variant={outcomeVariant(effectiveOutcome)}>{formatOutcome(effectiveOutcome)}</Badge>
        )}
        <div className={styles.labels}>
          {hasOverride && <Badge variant="neutral">Override</Badge>}
          {result.isPb && <Badge variant="pb">Personal best (PB)</Badge>}
          {result.isSb && <Badge variant="sb">Season best (SB)</Badge>}
          {!entry.countsTowardsStatistics && event.status !== 'cancelled' && <Badge variant="neutral">Non-scoring</Badge>}
        </div>
      </div>
      <div className={styles.auditContext}>
        {hasOverride && (
          <p>
            {effectiveOutcome === 'valid' && effectiveResult !== null
              ? 'Effective value uses a manual override.'
              : 'A manual override is recorded but is not effective for this outcome.'}{' '}
            Raw result: <strong>{rawDescription}</strong>
            {result.overrideReason ? <>. Reason: {result.overrideReason}</> : null}
          </p>
        )}
        <span>{entry.countsTowardsStatistics ? 'Counts toward statistics' : 'Excluded from statistics'}</span>
      </div>
    </li>
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
  const [activeTab, setActiveTab] = useState<HistoryTab | null>(null);
  const [activeHistoryDiscipline, setActiveHistoryDiscipline] = useState<string | null>(null);
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
  const tabRefs = useRef<Record<HistoryTab, HTMLButtonElement | null>>({ competitions: null, training: null });
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

  useEffect(() => {
    if (!statistics) return;
    setActiveTab((current) => current ?? (
      statistics.recentResults.competitions.length === 0 && statistics.recentResults.training.length > 0
        ? 'training'
        : 'competitions'
    ));
  }, [statistics]);

  const save = async (payload: AthleteMutationPayload) => {
    const updated = await updateAthlete(athleteId, payload);
    setAthlete(updated);
    onAthleteUpdated(updated);
    setEditing(false);
    setNotice(`${updated.name} updated.`);
  };

  const selectTab = (tab: HistoryTab, focus = false) => {
    setActiveTab(tab);
    if (focus) tabRefs.current[tab]?.focus();
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = historyTabs.indexOf(activeTab ?? 'competitions');
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % historyTabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + historyTabs.length) % historyTabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = historyTabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectTab(historyTabs[nextIndex], true);
  };

  const displayName = athlete?.name ?? statistics?.athlete.name ?? 'Athlete performance';
  const age = calculateAge(athlete?.dob ?? null);
  const defaultTab: HistoryTab = statistics?.recentResults.competitions.length === 0
    && statistics.recentResults.training.length > 0 ? 'training' : 'competitions';
  const selectedTab = activeTab ?? defaultTab;
  const activeEntries = statistics?.recentResults[selectedTab] ?? [];
  const activeResultType = selectedTab === 'competitions' ? 'competition' : 'training';
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
  const historyDisciplines = athlete?.preferredDisciplineIds.map((id) => {
    const definition = disciplines.find((discipline) => discipline.id === id);
    return { id, label: definition?.presentation.label ?? id, code: definition?.code ?? id };
  }) ?? [];
  const selectedHistoryDiscipline = historyDisciplines.find((discipline) => discipline.id === activeHistoryDiscipline) ?? historyDisciplines[0];
  const filteredEntries = selectedHistoryDiscipline
    ? activeEntries.filter((entry) => normalizeDiscipline(entry.event.discipline) === normalizeDiscipline(selectedHistoryDiscipline.label)
      || normalizeDiscipline(entry.event.discipline) === normalizeDiscipline(selectedHistoryDiscipline.code))
    : activeEntries;

  useEffect(() => {
    if (selectedPerformanceTab && selectedPerformanceTab.id !== activePerformanceTab) {
      setActivePerformanceTab(selectedPerformanceTab.id);
    }
  }, [activePerformanceTab, selectedPerformanceTab]);

  useEffect(() => {
    if (selectedHistoryDiscipline && selectedHistoryDiscipline.id !== activeHistoryDiscipline) {
      setActiveHistoryDiscipline(selectedHistoryDiscipline.id);
    }
  }, [activeHistoryDiscipline, selectedHistoryDiscipline]);

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
        <header><div><p>Performance log</p><h2>Recent results</h2></div></header>
        {statisticsLoading && <p role="status">Loading recent results...</p>}
        {!statisticsLoading && statisticsError && <p className={styles.historyUnavailable}>Recent results are unavailable until statistics can be loaded.</p>}
        {!statisticsLoading && statistics && (
          <>
            <div className={styles.tabs} role="tablist" aria-label="Result history">
              {historyTabs.map((tab) => {
                const selected = selectedTab === tab;
                const label = tab === 'competitions' ? 'Competitions' : 'Training';
                return (
                  <button
                    key={tab}
                    ref={(node) => { tabRefs.current[tab] = node; }}
                    type="button"
                    role="tab"
                    id={`${tab}-tab`}
                    aria-selected={selected}
                    aria-controls={`${tab}-panel`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => selectTab(tab)}
                    onKeyDown={handleTabKeyDown}
                  >
                    <span>{label}</span><strong>{statistics.recentResults[tab].length}</strong>
                  </button>
                );
              })}
            </div>
            {historyDisciplines.length > 0 && <div className={styles.historyDisciplineTabs} role="tablist" aria-label="Result history discipline">
              {historyDisciplines.map((discipline) => <button key={discipline.id} type="button" role="tab" aria-selected={selectedHistoryDiscipline?.id === discipline.id} onClick={() => setActiveHistoryDiscipline(discipline.id)}>{discipline.label}</button>)}
            </div>}
            <section
              className={styles.tabPanel}
              role="tabpanel"
              id={`${selectedTab}-panel`}
              aria-labelledby={`${selectedTab}-tab`}
              tabIndex={0}
            >
              {filteredEntries.length === 0
                ? <p className={styles.emptyHistory}>No {selectedHistoryDiscipline ? `${selectedHistoryDiscipline.label} ` : ''}{activeResultType} results yet.</p>
                : <ol>{filteredEntries.map((entry) => <HistoryRow key={`${entry.event.id}-${entry.result.updatedAt}`} entry={entry} />)}</ol>}
            </section>
          </>
        )}
      </Card>

      <Modal open={editing} title="Edit athlete" onClose={() => { if (!editorBusy) setEditing(false); }} closeDisabled={editorBusy}>
        {editing && athlete && <AthleteForm key={athlete.updatedAt} athlete={athlete} onSave={save} onCancel={() => setEditing(false)} onSubmittingChange={setEditorBusy} />}
      </Modal>
    </section>
  );
}
