import type { ApplicationUserContext } from '../types/auth.js';
import {
  DISCIPLINE_100M,
  ATHLETE_LIFECYCLE_STATUSES,
  ENTRY_TYPES,
  EVENT_STATUSES,
  EVENT_TYPES,
  INCIDENT_TYPES,
  RESULT_OUTCOMES,
  RESULT_UNIT_SECONDS,
  RSVP_STATUSES,
  USER_ROLES,
  type AggregateAthleteIdentity,
  type AggregateEventIdentity,
  type Athlete,
  type AthleteResultHistoryEntry,
  type AthleteResultCounts,
  type AthleteStatistics,
  type AthleticsEvent,
  type DashboardActiveEvent,
  type DashboardTimelineEntry,
  type DashboardUpcomingEvent,
  type EventParticipant,
  type EventParticipantSummary,
  type Result,
  type RosterSnapshotEntry,
  type Squad,
  type TimelineEntry,
  type User,
} from '../types/domain.js';
import {
  isCanonicalUuid,
  isGregorianDate,
  normalizeLocalTime,
} from '../validation/primitives.js';
import { deriveEffectiveResult } from '../services/resultDerivation.js';

type NumericValue = string | number;
type CountValue = string | number;
type TimestampValue = Date | string;
type DateValue = Date | string;

export interface UserRow {
  id: string;
  auth0_id: string;
  name: string;
  email: string;
  role: string;
  created_at: TimestampValue;
  updated_at: TimestampValue;
}

export interface ApplicationUserContextRow {
  user_id: string;
  auth0_id: string;
  role: string;
  workspace_id?: string;
  workspace_role?: string;
}

export interface AthleteRow {
  id: string;
  coach_id: string;
  name: string;
  dob: DateValue | null;
  gender: string | null;
  squads?: unknown;
  squad?: string | null;
  notes: string | null;
  archived_at: TimestampValue | null;
  lifecycle_status?: string;
  status_changed_at?: TimestampValue;
  status_changed_by?: string | null;
  created_at: TimestampValue;
  updated_at: TimestampValue;
}

export interface SquadRow {
  id: string;
  name: string;
  archived_at: TimestampValue | null;
  created_at: TimestampValue;
  updated_at: TimestampValue;
}

export interface EventRow {
  id: string;
  created_by: string;
  type: string;
  discipline: string | null;
  title: string;
  date: DateValue;
  time: string | null;
  location_name: string | null;
  latitude: NumericValue | null;
  longitude: NumericValue | null;
  status: string;
  created_at: TimestampValue;
  updated_at: TimestampValue;
}

export interface EventParticipantRow {
  event_id: string;
  athlete_id: string;
  rsvp_status: string;
}

export interface EventParticipantSummaryRow extends EventParticipantRow {
  athlete_name: string;
  athlete_squad_names?: unknown;
  athlete_squad?: string | null;
  athlete_archived_at: TimestampValue | null;
  athlete_lifecycle_status?: string;
  status_review_required?: boolean;
}

export interface TimelineEntryRow {
  id: string;
  event_id: string;
  athlete_id: string;
  discipline: string;
  entry_type: string;
  value: NumericValue | null;
  unit: string | null;
  is_foul: boolean;
  incident_type: string | null;
  note_text: string | null;
  recorded_by: string;
  version: number;
  device_id: string | null;
  created_at: TimestampValue;
  updated_at: TimestampValue;
  deleted_at: TimestampValue | null;
}

export interface ResultRow {
  event_id: string;
  athlete_id: string;
  discipline: string;
  outcome: string;
  final_result: NumericValue | null;
  unit: string | null;
  placing: number | null;
  is_pb: boolean;
  is_sb: boolean;
  manual_override: NumericValue | null;
  override_reason: string | null;
  overridden_by: string | null;
  override_at: TimestampValue | null;
  updated_at: TimestampValue;
}

export interface AthleteStatisticsRow {
  athlete_id: string;
  discipline: string;
  unit: string;
  pb: NumericValue | null;
  sb: NumericValue | null;
  results_count: CountValue;
  latest_result: NumericValue | null;
  latest_outcome: string;
  updated_at: TimestampValue;
}

export interface AthleteStatisticsAggregateRow extends AthleteStatisticsRow {
  all_time_count: CountValue;
  current_year_count: CountValue;
  competition_all_time_count: CountValue;
  training_all_time_count: CountValue;
}

export interface AthleteResultHistoryRow extends ResultRow {
  athlete_name: string;
  athlete_squad_names?: unknown;
  athlete_squad?: string | null;
  athlete_archived_at: TimestampValue | null;
  event_title: string;
  event_type: string;
  event_discipline: string;
  event_date: DateValue;
  event_time: string | null;
  event_location_name: string | null;
  event_status: string;
  effective_result: NumericValue | null;
  effective_outcome: string;
  counts_towards_statistics: boolean;
}

export interface RosterSnapshotRow {
  athlete_id: string;
  name: string;
  squad_names?: unknown;
  squad?: string | null;
  discipline: string;
  pb: NumericValue | null;
}

export interface DashboardUpcomingEventRow {
  event_id: string;
  title: string;
  type: string;
  discipline: string;
  date: DateValue;
  time: string | null;
  location_name: string | null;
  status: string;
  athlete_count: CountValue;
}

export interface DashboardActiveEventRow {
  event_id: string;
  event_title: string;
  event_type: string;
  event_discipline: string;
  event_date: DateValue;
  event_time: string | null;
  event_location_name: string | null;
  event_status: string;
  participant_count: CountValue;
  athletes_with_entries_count: CountValue;
  resolved_results_count: CountValue;
  entry_count: CountValue;
}

export interface DashboardTimelineEntryRow extends TimelineEntryRow {
  athlete_name: string;
  athlete_squad_names?: unknown;
  athlete_squad?: string | null;
  athlete_archived_at: TimestampValue | null;
}

export interface DashboardMetricsRow {
  athletes_count: CountValue;
  active_athletes_count: CountValue;
  inactive_athletes_count?: CountValue;
  archived_athletes_count: CountValue;
  status_review_count?: CountValue;
  upcoming_event_count: CountValue;
  season_pbs: CountValue;
}

export interface DashboardMetrics {
  athletesCount: number;
  activeAthletesCount: number;
  inactiveAthletesCount: number;
  archivedAthletesCount: number;
  statusReviewCount: number;
  upcomingEventCount: number;
  seasonPbs: number;
}

export class DatabaseMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseMappingError';
  }
}

const NUMERIC_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)$/i;

function invalid(field: string, expectation: string): never {
  throw new DatabaseMappingError(`Invalid database value for ${field}: ${expectation}`);
}

function nonemptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return invalid(field, 'expected a nonempty string');
  }
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  return value === null ? null : nonemptyString(value, field);
}

function uuid(value: unknown, field: string): string {
  const mapped = nonemptyString(value, field);
  if (!isCanonicalUuid(mapped)) {
    return invalid(field, 'expected a canonical UUID');
  }
  return mapped;
}

function nullableUuid(value: unknown, field: string): string | null {
  return value === null ? null : uuid(value, field);
}

function enumValue<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
  field: string,
): Values[number] {
  if (typeof value !== 'string' || !values.includes(value as Values[number])) {
    return invalid(field, `expected one of ${values.join(', ')}`);
  }
  return value as Values[number];
}

function discipline(value: unknown, field: string): typeof DISCIPLINE_100M {
  if (value !== DISCIPLINE_100M) {
    return invalid(field, `expected ${DISCIPLINE_100M}`);
  }
  return DISCIPLINE_100M;
}

function nullableDiscipline(value: unknown, field: string): typeof DISCIPLINE_100M | null {
  return value === null ? null : discipline(value, field);
}

function resultUnit(value: unknown, field: string): typeof RESULT_UNIT_SECONDS {
  if (value !== RESULT_UNIT_SECONDS) {
    return invalid(field, `expected ${RESULT_UNIT_SECONDS}`);
  }
  return RESULT_UNIT_SECONDS;
}

function nullableResultUnit(value: unknown, field: string): typeof RESULT_UNIT_SECONDS | null {
  return value === null ? null : resultUnit(value, field);
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    return invalid(field, 'expected a boolean');
  }
  return value;
}

function numeric(value: unknown, field: string): number {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && !NUMERIC_PATTERN.test(value))
  ) {
    return invalid(field, 'expected a PostgreSQL NUMERIC string or number');
  }

  const mapped = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(mapped)) {
    return invalid(field, 'expected a finite number');
  }
  return mapped;
}

function nullablePositiveNumeric(value: unknown, field: string): number | null {
  if (value === null) {
    return null;
  }
  const mapped = numeric(value, field);
  if (mapped <= 0) {
    return invalid(field, 'expected a number greater than zero');
  }
  return mapped;
}

function coordinate(value: unknown, field: string, minimum: number, maximum: number): number | null {
  if (value === null) {
    return null;
  }
  const mapped = numeric(value, field);
  if (mapped < minimum || mapped > maximum) {
    return invalid(field, `expected a number from ${minimum} to ${maximum}`);
  }
  return mapped;
}

function count(value: unknown, field: string): number {
  if (typeof value === 'string') {
    if (!/^\d+$/.test(value)) {
      return invalid(field, 'expected a nonnegative integer count');
    }
    const mapped = Number(value);
    if (!Number.isSafeInteger(mapped)) {
      return invalid(field, 'expected a safe integer count');
    }
    return mapped;
  }

  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return invalid(field, 'expected a nonnegative safe integer count');
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    return invalid(field, 'expected a positive safe integer');
  }
  return value;
}

function nullablePositiveInteger(value: unknown, field: string): number | null {
  return value === null ? null : positiveInteger(value, field);
}

function databaseDate(value: unknown, field: string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return invalid(field, 'expected a valid DATE');
    }
    const year = value.getFullYear();
    const month = value.getMonth() + 1;
    const day = value.getDate();
    const mapped = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!isGregorianDate(mapped)) {
      return invalid(field, 'expected a supported DATE');
    }
    return mapped;
  }

  if (typeof value !== 'string') {
    return invalid(field, 'expected a DATE string or Date');
  }
  if (!isGregorianDate(value)) {
    return invalid(field, 'expected a canonical YYYY-MM-DD date');
  }
  return value;
}

function databaseTime(value: unknown, field: string): string {
  const mapped = normalizeLocalTime(value);
  if (mapped === null) {
    return invalid(field, 'expected an HH:mm or HH:mm:ss time');
  }
  return mapped;
}

function nullableDatabaseTime(value: unknown, field: string): string | null {
  return value === null ? null : databaseTime(value, field);
}

function timestamp(value: unknown, field: string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return invalid(field, 'expected a valid TIMESTAMPTZ');
    }
    return value.toISOString();
  }

  if (typeof value !== 'string') {
    return invalid(field, 'expected a TIMESTAMPTZ string or Date');
  }
  const match = TIMESTAMP_PATTERN.exec(value);
  if (match === null) {
    return invalid(field, 'expected a timestamp with a timezone');
  }

  const [, year, month, day, hour, minute, second, fraction = '', rawZone] = match;
  if (
    !isGregorianDate(`${year}-${month}-${day}`) ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  ) {
    return invalid(field, 'expected a valid TIMESTAMPTZ');
  }

  let zone = rawZone.toUpperCase();
  if (zone !== 'Z') {
    const zoneDigits = zone.slice(1).replace(':', '');
    const zoneHour = Number(zoneDigits.slice(0, 2));
    const zoneMinute = zoneDigits.length === 2 ? 0 : Number(zoneDigits.slice(2));
    if (zoneHour > 23 || zoneMinute > 59) {
      return invalid(field, 'expected a valid timestamp timezone');
    }
    zone = `${zone[0]}${zoneDigits.slice(0, 2)}:${String(zoneMinute).padStart(2, '0')}`;
  }

  const mapped = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${fraction}${zone}`);
  if (Number.isNaN(mapped.getTime())) {
    return invalid(field, 'expected a valid TIMESTAMPTZ');
  }
  return mapped.toISOString();
}

function nullableTimestamp(value: unknown, field: string): string | null {
  return value === null ? null : timestamp(value, field);
}

function assertValueUnitConsistency(
  value: number | null,
  unit: typeof RESULT_UNIT_SECONDS | null,
  field: string,
): void {
  if ((value === null) !== (unit === null)) {
    invalid(field, 'value and unit must either both be null or both be present');
  }
}

export function mapUserRow(row: UserRow): User {
  return {
    id: uuid(row.id, 'users.id'),
    auth0Id: nonemptyString(row.auth0_id, 'users.auth0_id'),
    name: nonemptyString(row.name, 'users.name'),
    email: nonemptyString(row.email, 'users.email'),
    role: enumValue(row.role, USER_ROLES, 'users.role'),
    createdAt: timestamp(row.created_at, 'users.created_at'),
    updatedAt: timestamp(row.updated_at, 'users.updated_at'),
  };
}

export function mapApplicationUserContextRow(
  row: ApplicationUserContextRow,
): ApplicationUserContext {
  return {
    userId: uuid(row.user_id, 'user context.user_id'),
    auth0Id: nonemptyString(row.auth0_id, 'user context.auth0_id'),
    role: enumValue(row.role, USER_ROLES, 'user context.role'),
    workspaceId: row.workspace_id === undefined
      ? uuid(row.user_id, 'user context.user_id')
      : uuid(row.workspace_id, 'user context.workspace_id'),
    workspaceRole: row.workspace_role === undefined
      ? enumValue(row.role, USER_ROLES, 'user context.role')
      : enumValue(row.workspace_role, USER_ROLES, 'user context.workspace_role'),
  };
}

export function mapAthleteRow(row: AthleteRow): Athlete {
  const status = enumValue(
    row.lifecycle_status ?? (row.archived_at === null ? 'active' : 'archived'),
    ATHLETE_LIFECYCLE_STATUSES,
    'athletes.lifecycle_status',
  );
  return {
    id: uuid(row.id, 'athletes.id'),
    coachId: uuid(row.coach_id, 'athletes.coach_id'),
    name: nonemptyString(row.name, 'athletes.name'),
    dob: row.dob === null ? null : databaseDate(row.dob, 'athletes.dob'),
    gender: nullableString(row.gender, 'athletes.gender'),
    squads: row.squads === undefined ? [] : squads(row.squads, 'athletes.squads'),
    notes: nullableString(row.notes, 'athletes.notes'),
    archivedAt: nullableTimestamp(row.archived_at, 'athletes.archived_at'),
    status,
    statusChangedAt: timestamp(
      row.status_changed_at ?? row.archived_at ?? row.created_at,
      'athletes.status_changed_at',
    ),
    statusChangedBy: row.status_changed_by === undefined || row.status_changed_by === null
      ? null
      : uuid(row.status_changed_by, 'athletes.status_changed_by'),
    createdAt: timestamp(row.created_at, 'athletes.created_at'),
    updatedAt: timestamp(row.updated_at, 'athletes.updated_at'),
  };
}

function squads(value: unknown, field: string): Squad[] {
  if (!Array.isArray(value)) return invalid(field, 'expected a JSON array');
  return value.map((item, index) => {
    if (typeof item !== 'object' || item === null) return invalid(`${field}.${index}`, 'expected a squad object');
    const row = item as Record<string, unknown>;
    return {
      id: uuid(row.id, `${field}.${index}.id`), name: nonemptyString(row.name, `${field}.${index}.name`),
      archivedAt: nullableTimestamp(row.archivedAt, `${field}.${index}.archivedAt`),
      createdAt: timestamp(row.createdAt, `${field}.${index}.createdAt`), updatedAt: timestamp(row.updatedAt, `${field}.${index}.updatedAt`),
    };
  });
}

function squadNames(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) return invalid(field, 'expected a text array');
  return value.map((name, index) => nonemptyString(name, `${field}.${index}`));
}

export function mapEventRow(row: EventRow): AthleticsEvent {
  return {
    id: uuid(row.id, 'events.id'),
    createdBy: uuid(row.created_by, 'events.created_by'),
    type: enumValue(row.type, EVENT_TYPES, 'events.type'),
    discipline: nullableDiscipline(row.discipline, 'events.discipline'),
    title: nonemptyString(row.title, 'events.title'),
    date: databaseDate(row.date, 'events.date'),
    time: nullableDatabaseTime(row.time, 'events.time'),
    locationName: nullableString(row.location_name, 'events.location_name'),
    latitude: coordinate(row.latitude, 'events.latitude', -90, 90),
    longitude: coordinate(row.longitude, 'events.longitude', -180, 180),
    status: enumValue(row.status, EVENT_STATUSES, 'events.status'),
    createdAt: timestamp(row.created_at, 'events.created_at'),
    updatedAt: timestamp(row.updated_at, 'events.updated_at'),
  };
}

export function mapEventParticipantRow(row: EventParticipantRow): EventParticipant {
  return {
    eventId: uuid(row.event_id, 'event_participants.event_id'),
    athleteId: uuid(row.athlete_id, 'event_participants.athlete_id'),
    rsvpStatus: enumValue(row.rsvp_status, RSVP_STATUSES, 'event_participants.rsvp_status'),
  };
}

export function mapEventParticipantSummaryRow(
  row: EventParticipantSummaryRow,
): EventParticipantSummary {
  const participant = mapEventParticipantRow(row);
  return {
    ...participant,
    athlete: {
      id: participant.athleteId,
      name: nonemptyString(row.athlete_name, 'athletes.name'),
       squadNames: row.athlete_squad_names === undefined ? [] : squadNames(row.athlete_squad_names, 'athletes.squad_names'),
      archivedAt:
        row.athlete_archived_at === null
          ? null
          : timestamp(row.athlete_archived_at, 'athletes.archived_at'),
      ...(row.athlete_lifecycle_status === undefined ? {} : {
        status: enumValue(row.athlete_lifecycle_status, ATHLETE_LIFECYCLE_STATUSES, 'athletes.lifecycle_status'),
      }),
    },
    statusReviewRequired: row.status_review_required ?? false,
  };
}

export function mapTimelineEntryRow(row: TimelineEntryRow): TimelineEntry {
  const value = nullablePositiveNumeric(row.value, 'timeline_entries.value');
  const unit = nullableResultUnit(row.unit, 'timeline_entries.unit');
  const entryType = enumValue(row.entry_type, ENTRY_TYPES, 'timeline_entries.entry_type');
  const isFoul = booleanValue(row.is_foul, 'timeline_entries.is_foul');
  const incidentType =
    row.incident_type === null
      ? null
      : enumValue(row.incident_type, INCIDENT_TYPES, 'timeline_entries.incident_type');
  const noteText = nullableString(row.note_text, 'timeline_entries.note_text');
  assertValueUnitConsistency(value, unit, 'timeline_entries.value/unit');
  if (isFoul) {
    invalid('timeline_entries.is_foul', '100m entries cannot be foul');
  }
  if (entryType === 'note') {
    if (noteText === null || value !== null || unit !== null || incidentType !== null) {
      invalid(
        'timeline_entries note fields',
        'notes require note_text and cannot have value, unit, or incident_type',
      );
    }
  } else if (noteText !== null) {
    invalid('timeline_entries.note_text', 'only note entries can have note_text');
  }

  return {
    id: uuid(row.id, 'timeline_entries.id'),
    eventId: uuid(row.event_id, 'timeline_entries.event_id'),
    athleteId: uuid(row.athlete_id, 'timeline_entries.athlete_id'),
    discipline: discipline(row.discipline, 'timeline_entries.discipline'),
    entryType,
    value,
    unit,
    isFoul,
    incidentType,
    noteText,
    recordedBy: uuid(row.recorded_by, 'timeline_entries.recorded_by'),
    version: positiveInteger(row.version, 'timeline_entries.version'),
    deviceId: nullableString(row.device_id, 'timeline_entries.device_id'),
    createdAt: timestamp(row.created_at, 'timeline_entries.created_at'),
    updatedAt: timestamp(row.updated_at, 'timeline_entries.updated_at'),
    deletedAt: nullableTimestamp(row.deleted_at, 'timeline_entries.deleted_at'),
  };
}

export function mapResultRow(row: ResultRow): Result {
  const outcome = enumValue(row.outcome, RESULT_OUTCOMES, 'results.outcome');
  const finalResult = nullablePositiveNumeric(row.final_result, 'results.final_result');
  const unit = nullableResultUnit(row.unit, 'results.unit');
  const placing = nullablePositiveInteger(row.placing, 'results.placing');
  const isPb = booleanValue(row.is_pb, 'results.is_pb');
  const isSb = booleanValue(row.is_sb, 'results.is_sb');
  const manualOverride = nullablePositiveNumeric(row.manual_override, 'results.manual_override');
  const overrideReason = nullableString(row.override_reason, 'results.override_reason');
  const overriddenBy = nullableUuid(row.overridden_by, 'results.overridden_by');
  const overrideAt = nullableTimestamp(row.override_at, 'results.override_at');

  assertValueUnitConsistency(finalResult, unit, 'results.final_result/unit');
  if ((outcome === 'valid') !== (finalResult !== null)) {
    invalid('results.outcome/final_result', 'only a valid outcome may have a final result');
  }
  const effective = deriveEffectiveResult(
    { value: finalResult, outcome, incident: null },
    manualOverride,
  );
  if (effective.outcome !== 'valid' && (placing !== null || isPb || isSb)) {
    invalid('results outcome metadata', 'placing, PB, and SB require an effective valid result');
  }

  const hasCompleteOverrideAudit =
    overrideReason !== null && overriddenBy !== null && overrideAt !== null;
  if ((manualOverride !== null) !== hasCompleteOverrideAudit) {
    invalid(
      'results override fields',
      'manual_override, override_reason, overridden_by, and override_at must be present together',
    );
  }
  return {
    eventId: uuid(row.event_id, 'results.event_id'),
    athleteId: uuid(row.athlete_id, 'results.athlete_id'),
    discipline: discipline(row.discipline, 'results.discipline'),
    outcome,
    finalResult,
    unit,
    placing,
    isPb,
    isSb,
    manualOverride,
    overrideReason,
    overriddenBy,
    overrideAt,
    updatedAt: timestamp(row.updated_at, 'results.updated_at'),
  };
}

export function mapAthleteStatisticsRow(row: AthleteStatisticsRow): AthleteStatistics {
  const latestOutcome = enumValue(
    row.latest_outcome,
    RESULT_OUTCOMES,
    'athlete statistics.latest_outcome',
  );
  const latestResult = nullablePositiveNumeric(
    row.latest_result,
    'athlete statistics.latest_result',
  );
  if ((latestOutcome === 'valid') !== (latestResult !== null)) {
    invalid(
      'athlete statistics latest outcome/result',
      'only a valid outcome may have a latest result',
    );
  }

  return {
    athleteId: uuid(row.athlete_id, 'athlete statistics.athlete_id'),
    discipline: discipline(row.discipline, 'athlete statistics.discipline'),
    unit: resultUnit(row.unit, 'athlete statistics.unit'),
    pb: nullablePositiveNumeric(row.pb, 'athlete statistics.pb'),
    sb: nullablePositiveNumeric(row.sb, 'athlete statistics.sb'),
    resultsCount: count(row.results_count, 'athlete statistics.results_count'),
    latestResult,
    latestOutcome,
    updatedAt: timestamp(row.updated_at, 'athlete statistics.updated_at'),
  };
}

export function mapAthleteResultCounts(
  row: AthleteStatisticsAggregateRow,
): AthleteResultCounts {
  return {
    allTime: count(row.all_time_count, 'athlete statistics.all_time_count'),
    currentYear: count(row.current_year_count, 'athlete statistics.current_year_count'),
    competitionAllTime: count(
      row.competition_all_time_count,
      'athlete statistics.competition_all_time_count',
    ),
    trainingAllTime: count(
      row.training_all_time_count,
      'athlete statistics.training_all_time_count',
    ),
  };
}

function mapAggregateAthleteIdentity(
  athleteId: unknown,
  name: unknown,
  squadNamesValue: unknown,
  archivedAt: unknown,
  context: string,
): AggregateAthleteIdentity {
  return {
    id: uuid(athleteId, `${context}.id`),
    name: nonemptyString(name, `${context}.name`),
    squadNames: squadNamesValue === undefined ? [] : squadNames(squadNamesValue, `${context}.squad_names`),
    archivedAt: nullableTimestamp(archivedAt, `${context}.archived_at`),
  };
}

function mapAggregateEventIdentity(
  row: {
    event_id: unknown;
    event_title: unknown;
    event_type: unknown;
    event_discipline: unknown;
    event_date: unknown;
    event_time: unknown;
    event_location_name: unknown;
    event_status: unknown;
  },
  context: string,
): AggregateEventIdentity {
  return {
    id: uuid(row.event_id, `${context}.id`),
    title: nonemptyString(row.event_title, `${context}.title`),
    type: enumValue(row.event_type, EVENT_TYPES, `${context}.type`),
    discipline: discipline(row.event_discipline, `${context}.discipline`),
    date: databaseDate(row.event_date, `${context}.date`),
    time: nullableDatabaseTime(row.event_time, `${context}.time`),
    locationName: nullableString(row.event_location_name, `${context}.location_name`),
    status: enumValue(row.event_status, EVENT_STATUSES, `${context}.status`),
  };
}

export function mapAthleteResultHistoryRow(
  row: AthleteResultHistoryRow,
): AthleteResultHistoryEntry {
  const event = mapAggregateEventIdentity(row, 'athlete history.event');
  const effectiveResult = nullablePositiveNumeric(
    row.effective_result,
    'athlete history.effective_result',
  );
  const effectiveOutcome = enumValue(
    row.effective_outcome,
    RESULT_OUTCOMES,
    'athlete history.effective_outcome',
  );
  if ((effectiveOutcome === 'valid') !== (effectiveResult !== null)) {
    invalid(
      'athlete history effective outcome/result',
      'only a valid effective outcome may have an effective result',
    );
  }

  const countsTowardsStatistics = booleanValue(
    row.counts_towards_statistics,
    'athlete history.counts_towards_statistics',
  );
  if (countsTowardsStatistics !== (event.status !== 'cancelled' && effectiveOutcome === 'valid')) {
    invalid(
      'athlete history.counts_towards_statistics',
      'expected non-cancelled effective valid result semantics',
    );
  }

  return {
    athlete: mapAggregateAthleteIdentity(
      row.athlete_id,
      row.athlete_name,
       row.athlete_squad_names,
      row.athlete_archived_at,
      'athlete history.athlete',
    ),
    event,
    result: mapResultRow(row),
    effectiveResult,
    effectiveOutcome,
    countsTowardsStatistics,
  };
}

export function mapRosterSnapshotRow(row: RosterSnapshotRow): RosterSnapshotEntry {
  return {
    athleteId: uuid(row.athlete_id, 'roster snapshot.athlete_id'),
    name: nonemptyString(row.name, 'roster snapshot.name'),
    squadNames: row.squad_names === undefined ? [] : squadNames(row.squad_names, 'roster snapshot.squad_names'),
    discipline: discipline(row.discipline, 'roster snapshot.discipline'),
    pb: nullablePositiveNumeric(row.pb, 'roster snapshot.pb'),
  };
}

export function mapDashboardUpcomingEventRow(
  row: DashboardUpcomingEventRow,
): DashboardUpcomingEvent {
  return {
    eventId: uuid(row.event_id, 'dashboard upcoming event.event_id'),
    title: nonemptyString(row.title, 'dashboard upcoming event.title'),
    type: enumValue(row.type, EVENT_TYPES, 'dashboard upcoming event.type'),
    discipline: discipline(row.discipline, 'dashboard upcoming event.discipline'),
    date: databaseDate(row.date, 'dashboard upcoming event.date'),
    time: nullableDatabaseTime(row.time, 'dashboard upcoming event.time'),
    locationName: nullableString(
      row.location_name,
      'dashboard upcoming event.location_name',
    ),
    status: enumValue(row.status, EVENT_STATUSES, 'dashboard upcoming event.status'),
    athleteCount: count(row.athlete_count, 'dashboard upcoming event.athlete_count'),
  };
}

export function mapDashboardActiveEventRow(
  row: DashboardActiveEventRow,
): Omit<DashboardActiveEvent, 'latestEntries'> {
  const event = mapAggregateEventIdentity(row, 'dashboard active event');
  if (event.status !== 'in_progress') {
    invalid('dashboard active event.status', 'expected in_progress');
  }
  const participantCount = count(
    row.participant_count,
    'dashboard active event.participant_count',
  );
  const resolvedResultsCount = count(
    row.resolved_results_count,
    'dashboard active event.resolved_results_count',
  );

  return {
    event,
    progress: {
      participantCount,
      athletesWithEntriesCount: count(
        row.athletes_with_entries_count,
        'dashboard active event.athletes_with_entries_count',
      ),
      resolvedResultsCount,
      entryCount: count(row.entry_count, 'dashboard active event.entry_count'),
      completionPercent: participantCount === 0
        ? 0
        : Math.min(100, Math.round((resolvedResultsCount / participantCount) * 100)),
    },
  };
}

export function mapDashboardTimelineEntryRow(
  row: DashboardTimelineEntryRow,
): DashboardTimelineEntry {
  return {
    entry: mapTimelineEntryRow(row),
    athlete: mapAggregateAthleteIdentity(
      row.athlete_id,
      row.athlete_name,
       row.athlete_squad_names,
      row.athlete_archived_at,
      'dashboard timeline entry.athlete',
    ),
  };
}

export function mapDashboardMetricsRow(row: DashboardMetricsRow): DashboardMetrics {
  return {
    athletesCount: count(row.athletes_count, 'dashboard metrics.athletes_count'),
    activeAthletesCount: count(
      row.active_athletes_count,
      'dashboard metrics.active_athletes_count',
    ),
    inactiveAthletesCount: row.inactive_athletes_count === undefined
      ? 0
      : count(row.inactive_athletes_count, 'dashboard metrics.inactive_athletes_count'),
    archivedAthletesCount: count(
      row.archived_athletes_count,
      'dashboard metrics.archived_athletes_count',
    ),
    statusReviewCount: row.status_review_count === undefined
      ? 0
      : count(row.status_review_count, 'dashboard metrics.status_review_count'),
    upcomingEventCount: count(
      row.upcoming_event_count,
      'dashboard metrics.upcoming_event_count',
    ),
    seasonPbs: count(row.season_pbs, 'dashboard metrics.season_pbs'),
  };
}
