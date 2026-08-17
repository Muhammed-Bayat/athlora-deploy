import type { Athlete, IncidentType, Result, ResultOutcome } from '../../types';

export interface EffectiveResult {
  value: number | null;
  outcome: ResultOutcome;
  isOverrideEffective: boolean;
}

export interface ResultPresentationRow {
  athleteId: string;
  athleteName: string;
  result: Result;
  effective: EffectiveResult;
}

const RESULT_OUTCOME_LABELS: Record<ResultOutcome, string> = {
  no_result: 'No result',
  valid: 'Valid result',
  dq: 'Disqualified',
  dnf: 'Did not finish',
  dns: 'Did not start',
};

const INCIDENT_TYPE_LABELS: Record<Exclude<IncidentType, null>, string> = {
  false_start: 'False start',
  dq: 'Disqualified',
  dnf: 'Did not finish',
  dns: 'Did not start',
  lane_infringement: 'Lane infringement',
};

const AUDIT_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
  timeZoneName: 'short',
});

function isVoidOutcome(outcome: ResultOutcome): outcome is 'dq' | 'dnf' | 'dns' {
  return outcome === 'dq' || outcome === 'dnf' || outcome === 'dns';
}

export function getEffectiveResult(
  result: Pick<Result, 'outcome' | 'finalResult' | 'manualOverride'>,
): EffectiveResult {
  if (isVoidOutcome(result.outcome)) {
    return { value: null, outcome: result.outcome, isOverrideEffective: false };
  }

  if (
    result.manualOverride !== null
    && Number.isFinite(result.manualOverride)
    && result.manualOverride > 0
  ) {
    return { value: result.manualOverride, outcome: 'valid', isOverrideEffective: true };
  }

  return {
    value: result.finalResult,
    outcome: result.outcome,
    isOverrideEffective: false,
  };
}

export function createResultPresentationRow(
  athlete: Pick<Athlete, 'id' | 'name'>,
  result: Result,
): ResultPresentationRow {
  return {
    athleteId: athlete.id,
    athleteName: athlete.name,
    result,
    effective: getEffectiveResult(result),
  };
}

export function format100mSeconds(seconds: number): string {
  return `${seconds.toFixed(2)}s`;
}

export function has100mHundredthPrecision(value: string): boolean {
  return /^\d+(?:\.\d{1,2})?$/.test(value.trim());
}

export function getResultOutcomeLabel(outcome: ResultOutcome): string {
  return RESULT_OUTCOME_LABELS[outcome];
}

export function getIncidentTypeLabel(incidentType: IncidentType): string {
  return incidentType === null ? 'No incident' : INCIDENT_TYPE_LABELS[incidentType];
}

export function formatAuditDateTime(isoDateTime: string): string {
  return AUDIT_DATE_TIME_FORMATTER.format(new Date(isoDateTime));
}

function outcomeSortRank(outcome: ResultOutcome): number {
  if (outcome === 'valid') return 0;
  if (outcome === 'no_result') return 2;
  return 1;
}

export function compareResultPresentationRows(
  left: ResultPresentationRow,
  right: ResultPresentationRow,
): number {
  const rankDifference = outcomeSortRank(left.effective.outcome) - outcomeSortRank(right.effective.outcome);
  if (rankDifference !== 0) return rankDifference;

  if (
    left.effective.outcome === 'valid'
    && right.effective.outcome === 'valid'
    && left.effective.value !== null
    && right.effective.value !== null
  ) {
    const timeDifference = left.effective.value - right.effective.value;
    if (timeDifference !== 0) return timeDifference;
  }

  const nameDifference = left.athleteName.localeCompare(right.athleteName, 'en', {
    sensitivity: 'base',
  });
  if (nameDifference !== 0) return nameDifference;

  return left.athleteId.localeCompare(right.athleteId, 'en');
}

export function sortResultPresentationRows<T extends ResultPresentationRow>(rows: readonly T[]): T[] {
  return rows
    .map((row, originalIndex) => ({ row, originalIndex }))
    .sort((left, right) => (
      compareResultPresentationRows(left.row, right.row)
      || left.originalIndex - right.originalIndex
    ))
    .map(({ row }) => row);
}
