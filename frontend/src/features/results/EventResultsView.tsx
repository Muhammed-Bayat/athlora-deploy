import { Badge, Button } from '../../components';
import type {
  Athlete,
  AthleticsEvent,
  EventParticipantSummary,
  Result,
  TimelineEntry,
  User,
} from '../../types';
import {
  createResultPresentationRow,
  format100mSeconds,
  formatAuditDateTime,
  getIncidentTypeLabel,
  getResultOutcomeLabel,
  sortResultPresentationRows,
  type ResultPresentationRow,
} from './resultPresentation';
import styles from './EventResults.module.css';

export interface ResultCorrectionTarget {
  athleteName: string;
  result: Result;
}

interface EventResultsViewProps {
  event: Pick<AthleticsEvent, 'id' | 'type' | 'status'>;
  results: Result[];
  participants: EventParticipantSummary[];
  timeline: TimelineEntry[];
  athletes?: Athlete[];
  currentUser?: Pick<User, 'id' | 'name'> | null;
  compact?: boolean;
  onCorrect?: (target: ResultCorrectionTarget, trigger: HTMLButtonElement) => void;
}

interface EventResultRow extends ResultPresentationRow {
  athlete: {
    id: string;
    name: string;
     squadNames?: string[];
    archivedAt: string | null;
  };
  hasMaterializedResult: boolean;
  isAssigned: boolean;
  penalties: Array<'false_start' | 'lane_infringement'>;
}

function emptyResult(eventId: string, athleteId: string): Result {
  return {
    eventId,
    athleteId,
    discipline: '100m',
    outcome: 'no_result',
    finalResult: null,
    unit: null,
    placing: null,
    isPb: false,
    isSb: false,
    manualOverride: null,
    overrideReason: null,
    overriddenBy: null,
    overrideAt: null,
    updatedAt: '',
  };
}

function actorLabel(
  actorId: string,
  currentUser: Pick<User, 'id' | 'name'> | null | undefined,
): string {
  if (currentUser?.id === actorId) return `${currentUser.name} (you)`;
  return `User ${actorId.slice(0, 8)}`;
}

function outcomeBadge(outcome: Result['outcome']) {
  if (outcome === 'valid') return null;
  const label = outcome === 'no_result' ? 'No result recorded' : getResultOutcomeLabel(outcome);
  const variant = outcome === 'no_result' ? 'neutral' : outcome;
  return <Badge variant={variant}>{label}</Badge>;
}

export function EventResultsView({
  event,
  results,
  participants,
  timeline,
  athletes = [],
  currentUser,
  compact = false,
  onCorrect,
}: EventResultsViewProps) {
  const resultByAthlete = new Map(results.map((result) => [result.athleteId, result]));
  const participantByAthlete = new Map(participants.map((participant) => [
    participant.athleteId,
    participant,
  ]));
  const athleteById = new Map(athletes.map((athlete) => [athlete.id, athlete]));
  const athleteIds = new Set([
    ...participants.map((participant) => participant.athleteId),
    ...results.map((result) => result.athleteId),
  ]);

  const rows = sortResultPresentationRows([...athleteIds].map((athleteId): EventResultRow => {
    const participant = participantByAthlete.get(athleteId);
    const rosterAthlete = athleteById.get(athleteId);
    const athlete = participant?.athlete ?? (rosterAthlete && {
      id: rosterAthlete.id,
      name: rosterAthlete.name,
      squadNames: rosterAthlete.squads?.map((squad) => squad.name) ?? [],
      archivedAt: rosterAthlete.archivedAt,
    }) ?? {
      id: athleteId,
      name: `Athlete ${athleteId.slice(0, 8)}`,
       squadNames: [],
      archivedAt: null,
    };
    const materializedResult = resultByAthlete.get(athleteId);
    const result = materializedResult ?? emptyResult(event.id, athleteId);
    const presentation = createResultPresentationRow(athlete, result);
    const penalties = timeline
      .filter((entry) => (
        entry.athleteId === athleteId
        && entry.deletedAt === null
        && (entry.incidentType === 'false_start' || entry.incidentType === 'lane_infringement')
      ))
      .map((entry) => entry.incidentType as 'false_start' | 'lane_infringement');

    return {
      ...presentation,
      athlete,
      hasMaterializedResult: Boolean(materializedResult),
      isAssigned: Boolean(participant),
      penalties,
    };
  }));

  if (rows.length === 0) {
    return (
      <div className={styles.emptyResults}>
        <strong>No event outcomes yet</strong>
        <span>Assign athletes and log a finish or incident to build the 100m result board.</span>
      </div>
    );
  }

  const correctionsAllowed = event.status === 'in_progress' || event.status === 'completed';

  return (
    <>
      {event.type === 'training' && (
        <p className={styles.contextNote}>Training outcomes show each athlete’s fastest valid rep. Placings are intentionally omitted.</p>
      )}
      {event.status === 'cancelled' && (
        <p className={styles.cancelledNote}>This event is cancelled. Results are preserved as read-only history and do not count toward placings or statistics.</p>
      )}
      <ol
        className={`${styles.resultBoard} ${compact ? styles.compact : ''}`}
        aria-label="Event results"
        data-event-type={event.type}
      >
        {rows.map((row) => {
          const { result, effective } = row;
          const isVoid = result.outcome === 'dq' || result.outcome === 'dnf' || result.outcome === 'dns';
          const canOpenCorrection = Boolean(
            onCorrect
            && correctionsAllowed
            && row.hasMaterializedResult
            && (!isVoid || result.manualOverride !== null),
          );
          const falseStarts = row.penalties.filter((penalty) => penalty === 'false_start').length;
          const laneInfringements = row.penalties.filter((penalty) => penalty === 'lane_infringement').length;

          return (
            <li key={row.athleteId} className={styles.resultCard} data-outcome={effective.outcome}>
              {event.type === 'competition' && (
                <div className={styles.placing} aria-label={result.placing ? `Place ${result.placing}` : 'Unplaced'}>
                  <span>Place</span>
                  <strong>{result.placing ?? '—'}</strong>
                </div>
              )}

              <div className={styles.identity}>
                <strong>{row.athleteName}</strong>
                 <span>{row.athlete.squadNames?.join(', ') || 'No squad assigned'}</span>
                <div className={styles.identityBadges}>
                  {row.athlete.archivedAt && <Badge variant="neutral">Archived</Badge>}
                  {!row.isAssigned && <Badge variant="neutral">Historical result</Badge>}
                </div>
              </div>

              <div className={styles.officialResult}>
                <span>{event.type === 'training' ? 'Best time' : 'Official result'}</span>
                {effective.outcome === 'valid' && effective.value !== null
                  ? <strong>{format100mSeconds(effective.value)}</strong>
                  : outcomeBadge(effective.outcome)}
                <div className={styles.performanceBadges}>
                  {result.isPb && <Badge variant="pb">PB</Badge>}
                  {result.isSb && <Badge variant="sb">SB</Badge>}
                </div>
              </div>

              <div className={styles.derivedResult}>
                <span>Derived from timeline</span>
                <strong>{result.finalResult !== null ? format100mSeconds(result.finalResult) : getResultOutcomeLabel(result.outcome)}</strong>
              </div>

              <div className={styles.resultMarks}>
                <span>Penalties and audit</span>
                <div className={styles.performanceBadges}>
                  {falseStarts > 0 && <Badge variant="foul">{getIncidentTypeLabel('false_start')}{falseStarts > 1 ? ` ×${falseStarts}` : ''}</Badge>}
                  {laneInfringements > 0 && <Badge variant="foul">{getIncidentTypeLabel('lane_infringement')}{laneInfringements > 1 ? ` ×${laneInfringements}` : ''}</Badge>}
                  {falseStarts === 0 && laneInfringements === 0 && result.manualOverride === null && <span className={styles.noMarks}>None recorded</span>}
                </div>
                {result.manualOverride !== null && result.overriddenBy && result.overrideAt && (
                  <div className={styles.audit}>
                    <Badge variant="neutral">Manual correction</Badge>
                    <p>
                      <strong>{format100mSeconds(result.manualOverride)}</strong> by {actorLabel(result.overriddenBy, currentUser)}<br />
                      <time dateTime={result.overrideAt}>{formatAuditDateTime(result.overrideAt)}</time>
                    </p>
                    <q>{result.overrideReason}</q>
                    {isVoid && <small>The incident outcome takes precedence, so this corrected time is not currently effective.</small>}
                  </div>
                )}
              </div>

              {onCorrect && (
                <div className={styles.resultAction}>
                  {canOpenCorrection && (
                    <Button variant="secondary" onClick={(clickEvent) => onCorrect({ athleteName: row.athleteName, result }, clickEvent.currentTarget)}>
                      {result.manualOverride !== null ? 'Review correction' : 'Correct time'}
                    </Button>
                  )}
                  {!row.hasMaterializedResult && correctionsAllowed && <small>Log an entry before correcting.</small>}
                  {isVoid && result.manualOverride === null && correctionsAllowed && <small>Resolve the incident before correcting time.</small>}
                  {!correctionsAllowed && <small>Corrections are read-only for this event status.</small>}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
