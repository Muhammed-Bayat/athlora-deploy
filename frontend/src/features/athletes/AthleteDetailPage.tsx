import { lazy, Suspense, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { getAthlete, updateAthlete, updateAthleteStatus } from '../../api/athletes';
import { getAthleteStatistics } from '../../api/statistics';
import { listInjuries } from '../../api/injuries';
import { CompactAnatomy } from '../fitness/CompactAnatomy';
import { Badge, Button, Card, Modal, Toast } from '../../components';
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
import { ProgressionChart } from './ProgressionChart';
import styles from './AthleteDetailPage.module.css';

interface AthleteDetailPageProps {
  athleteId: string;
  onBack: () => void;
  onAthleteUpdated: (athlete: Athlete) => void;
  initialFitnessOpen?: boolean;
}

type HistoryTab = 'competitions' | 'training';

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
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileRetry, setProfileRetry] = useState(0);
  const [statistics, setStatistics] = useState<AthleteStatisticsDetail | null>(null);
  const [statisticsLoading, setStatisticsLoading] = useState(true);
  const [statisticsError, setStatisticsError] = useState<string | null>(null);
  const [statisticsRetry, setStatisticsRetry] = useState(0);
  const [activeTab, setActiveTab] = useState<HistoryTab | null>(null);
  const [editing, setEditing] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [fitnessOpen, setFitnessOpen] = useState(initialFitnessOpen);
  const [activeInjuries, setActiveInjuries] = useState<import('../../types').Injury[]>([]);
  const [injuryLoading, setInjuryLoading] = useState(true);
  const [injuryError, setInjuryError] = useState<string | null>(null);
  const [injuryRetry, setInjuryRetry] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const fitnessButtonRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<Record<HistoryTab, HTMLButtonElement | null>>({ competitions: null, training: null });

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
    void getAthleteStatistics(athleteId)
      .then((value) => { if (current) setStatistics(value); })
      .catch((error: unknown) => { if (current) setStatisticsError(athleteErrorMessage(error)); })
      .finally(() => { if (current) setStatisticsLoading(false); });
    return () => { current = false; };
  }, [athleteId, statisticsRetry]);

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

  if (fitnessOpen) {
    return <Suspense fallback={<section className={styles.detail}><p role="status">Loading Fitness...</p></section>}><FitnessView
      athleteId={athleteId}
      athleteName={displayName}
      athleteSquad={athlete?.squads?.map((squad) => squad.name).join(', ') || statistics?.athlete.squadNames?.join(', ') || null}
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
          <h1 id="athlete-detail-heading" ref={headingRef} tabIndex={-1}>{displayName}</h1>
          <div className={styles.heroMeta}>
            <span>100m</span>
             <span>{athlete?.squads?.map((squad) => squad.name).join(', ') || statistics?.athlete.squadNames?.join(', ') || 'Squad not provided'}</span>
            <span>{age === null ? 'Age not provided' : `${age} years`}</span>
          </div>
        </div>
        <div className={styles.heroActions}>
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

      <section className={styles.kpiStrip} aria-label="100m performance summary">
        {statisticsLoading && <p role="status">Loading performance statistics...</p>}
        {!statisticsLoading && statisticsError && (
          <div className={styles.sectionError} role="alert">
            <strong>Statistics unavailable</strong><p>{statisticsError}</p>
            <Button onClick={() => setStatisticsRetry((value) => value + 1)}>Retry statistics</Button>
          </div>
        )}
        {!statisticsLoading && statistics && (
          <dl className={styles.metrics}>
            <div><dt>Personal best</dt><dd>{statistics.pb === null ? 'No valid result' : format100mSeconds(statistics.pb)}</dd><span>100m PB</span></div>
            <div><dt>Season best</dt><dd>{statistics.sb === null ? 'No valid result this year' : format100mSeconds(statistics.sb)}</dd><span>Current calendar year</span></div>
            <div><dt>Valid results</dt><dd>{statistics.resultCounts.currentYear}</dd><span>Current calendar year</span></div>
          </dl>
        )}
      </section>

      <ProgressionChart athleteId={athleteId} athleteName={displayName} />

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
              <div><dt>Squads</dt><dd>{athlete.squads?.map((squad) => squad.name).join(', ') || 'Not provided'}</dd></div>
             <div><dt>Status changed</dt><dd><time dateTime={athlete.statusChangedAt}>{new Date(athlete.statusChangedAt).toLocaleDateString()}</time></dd></div>
            <div className={styles.notes}><dt>Notes</dt><dd>{athlete.notes ?? 'Not provided'}</dd></div>
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
            <section
              className={styles.tabPanel}
              role="tabpanel"
              id={`${selectedTab}-panel`}
              aria-labelledby={`${selectedTab}-tab`}
              tabIndex={0}
            >
              {activeEntries.length === 0
                ? <p className={styles.emptyHistory}>No {activeResultType} results yet.</p>
                : <ol>{activeEntries.map((entry) => <HistoryRow key={`${entry.event.id}-${entry.result.updatedAt}`} entry={entry} />)}</ol>}
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
