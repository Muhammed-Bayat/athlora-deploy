import type { ResultOutcome } from '../types';

const DATE_ONLY_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const OUTCOME_LABELS: Record<ResultOutcome, string> = {
  no_result: 'No result',
  valid: 'Valid result',
  dq: 'Disqualified',
  dnf: 'Did not finish',
  dns: 'Did not start',
};

export function format100mSeconds(seconds: number): string {
  return `${seconds.toFixed(2)}s`;
}

export function formatOutcome(outcome: ResultOutcome): string {
  return OUTCOME_LABELS[outcome];
}

export function formatDateOnly(value: string | null): string {
  if (!value) return 'Not provided';
  return DATE_ONLY_FORMATTER.format(new Date(`${value}T00:00:00.000Z`));
}

export function calculateAge(
  dateOfBirth: string | null,
  today: Date = new Date(),
): number | null {
  if (!dateOfBirth) return null;
  const [year, month, day] = dateOfBirth.split('-').map(Number);
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) {
    age -= 1;
  }
  return age;
}
