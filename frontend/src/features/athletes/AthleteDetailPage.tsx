import { useEffect, useRef, useState } from 'react';
import { getAthlete, updateAthlete } from '../../api/athletes';
import { getAthleteStatistics } from '../../api/statistics';
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
import styles from './AthleteDetailPage.module.css';

interface AthleteDetailPageProps {
  athleteId: string;
  onBack: () => void;
  onAthleteUpdated: (athlete: Athlete) => void;
}

function outcomeVariant(outcome: ResultOutcome): 'dq' | 'dnf' | 'dns' | 'neutral' {
  return outcome === 'dq' || outcome === 'dnf' || outcome === 'dns' ? outcome : 'neutral';
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
        <div className={styles.badges}>
          <Badge>{event.type === 'competition' ? 'Competition' : 'Training'}</Badge>
          {event.status === 'cancelled' && <Badge variant="foul">Cancelled event</Badge>}
        </div>
      </div>
      <div className={styles.effectiveResult}>
        <span>Effective result</span>
        {effectiveOutcome === 'valid' && effectiveResult !== null
          ? <strong>{format100mSeconds(effectiveResult)}</strong>
          : <Badge variant={outcomeVariant(effectiveOutcome)}>{formatOutcome(effectiveOutcome)}</Badge>}
        <div className={styles.badges}>
          {effectiveOutcome === 'valid' && <Badge>Valid result</Badge>}
          {hasOverride && <Badge variant="neutral">Manually overridden</Badge>}
          {result.isPb && <Badge variant="pb">Personal best (PB)</Badge>}
          {result.isSb && <Badge variant="sb">Season best (SB)</Badge>}
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

function HistorySection({ title, entries }: { title: string; entries: AthleteResultHistoryEntry[] }) {
  const resultType = title === 'Competitions' ? 'competition' : 'training';
  return (
    <section className={styles.historySection} aria-labelledby={`${title.toLowerCase()}-heading`}>
      <header>
        <h3 id={`${title.toLowerCase()}-heading`}>{title}</h3>
        <span>{entries.length} recent</span>
      </header>
      {entries.length === 0
        ? <p className={styles.emptyHistory}>No {resultType} results yet.</p>
        : <ol>{entries.map((entry) => <HistoryRow key={`${entry.event.id}-${entry.result.updatedAt}`} entry={entry} />)}</ol>}
    </section>
  );
}

export function AthleteDetailPage({ athleteId, onBack, onAthleteUpdated }: AthleteDetailPageProps) {
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileRetry, setProfileRetry] = useState(0);
  const [statistics, setStatistics] = useState<AthleteStatisticsDetail | null>(null);
  const [statisticsLoading, setStatisticsLoading] = useState(true);
  const [statisticsError, setStatisticsError] = useState<string | null>(null);
  const [statisticsRetry, setStatisticsRetry] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);

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

  const save = async (payload: AthleteMutationPayload) => {
    const updated = await updateAthlete(athleteId, payload);
    setAthlete(updated);
    onAthleteUpdated(updated);
    setEditing(false);
    setNotice(`${updated.name} updated.`);
  };

  const displayName = athlete?.name ?? statistics?.athlete.name ?? 'Athlete performance';
  const age = calculateAge(athlete?.dob ?? null);

  return (
    <section className={styles.detail} aria-labelledby="athlete-detail-heading">
      <Button variant="ghost" className={styles.backButton} onClick={onBack}>Back to roster</Button>
      <header className={styles.hero}>
        <div>
          <p>100m athlete profile</p>
          <h1 id="athlete-detail-heading">{displayName}</h1>
        </div>
        {athlete && <Badge variant={athlete.archivedAt ? 'foul' : 'neutral'}>{athlete.archivedAt ? 'Archived athlete' : 'Active athlete'}</Badge>}
      </header>
      {notice && <Toast variant="success" onDismiss={() => setNotice(null)}>{notice}</Toast>}

      <div className={styles.summaryGrid}>
        <Card className={styles.profileCard}>
          <header><div><p>Profile</p><h2>Personal details</h2></div>{athlete && <Button ref={editButtonRef} variant="secondary" onClick={() => setEditing(true)}>Edit profile</Button>}</header>
          {profileLoading && <p role="status">Loading athlete profile...</p>}
          {!profileLoading && profileError && <div className={styles.sectionError} role="alert"><strong>Profile unavailable</strong><p>{profileError}</p><Button onClick={() => setProfileRetry((value) => value + 1)}>Retry profile</Button></div>}
          {!profileLoading && athlete && (
            <dl className={styles.profileDetails}>
              <div><dt>Date of birth</dt><dd>{formatDateOnly(athlete.dob)}</dd></div>
              <div><dt>Current age</dt><dd>{age === null ? 'Not provided' : `${age} years`}</dd></div>
              <div><dt>Gender</dt><dd>{athlete.gender ?? 'Not provided'}</dd></div>
              <div><dt>Squad</dt><dd>{athlete.squad ?? 'Not provided'}</dd></div>
              <div className={styles.notes}><dt>Notes</dt><dd>{athlete.notes ?? 'Not provided'}</dd></div>
            </dl>
          )}
        </Card>

        <Card className={styles.metricsCard}>
          <header><div><p>Current season</p><h2>100m performance</h2></div></header>
          {statisticsLoading && <p role="status">Loading performance statistics...</p>}
          {!statisticsLoading && statisticsError && <div className={styles.sectionError} role="alert"><strong>Statistics unavailable</strong><p>{statisticsError}</p><Button onClick={() => setStatisticsRetry((value) => value + 1)}>Retry statistics</Button></div>}
          {!statisticsLoading && statistics && (
            <dl className={styles.metrics}>
              <div><dt>Personal best</dt><dd>{statistics.pb === null ? 'No valid result' : format100mSeconds(statistics.pb)}</dd><span>100m PB</span></div>
              <div><dt>Season best</dt><dd>{statistics.sb === null ? 'No valid result this year' : format100mSeconds(statistics.sb)}</dd><span>Current calendar year</span></div>
              <div><dt>Valid results</dt><dd>{statistics.resultCounts.currentYear}</dd><span>Current calendar year</span></div>
            </dl>
          )}
        </Card>
      </div>

      <Card className={styles.historyCard}>
        <header><div><p>Performance log</p><h2>Recent results</h2></div></header>
        {statisticsLoading && <p role="status">Loading recent results...</p>}
        {!statisticsLoading && statisticsError && <p className={styles.historyUnavailable}>Recent results are unavailable until statistics can be loaded.</p>}
        {!statisticsLoading && statistics && (
          <div className={styles.historyGrid}>
            <HistorySection title="Competitions" entries={statistics.recentResults.competitions} />
            <HistorySection title="Training" entries={statistics.recentResults.training} />
          </div>
        )}
      </Card>

      <Modal open={editing} title="Edit athlete" onClose={() => { if (!editorBusy) setEditing(false); }} closeDisabled={editorBusy}>
        {editing && athlete && <AthleteForm key={athlete.updatedAt} athlete={athlete} onSave={save} onCancel={() => setEditing(false)} onSubmittingChange={setEditorBusy} />}
      </Modal>
    </section>
  );
}
