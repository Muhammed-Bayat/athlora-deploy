import type { ApplicationUserContext } from '../types/auth.js';
import {
  DISCIPLINE_100M,
  ENTRY_TYPES,
  EVENT_STATUSES,
  EVENT_TYPES,
  INCIDENT_TYPES,
  RESULT_OUTCOMES,
  RESULT_UNIT_SECONDS,
  RSVP_STATUSES,
  USER_ROLES,
  type Athlete,
  type AthleteStatistics,
  type AthleticsEvent,
  type DashboardUpcomingEvent,
  type EventParticipant,
  type EventParticipantSummary,
  type Result,
  type RosterSnapshotEntry,
  type TimelineEntry,
  type User,
} from '../types/domain.js';
import {
  isCanonicalUuid,
  isGregorianDate,
  normalizeLocalTime,
} from '../validation/primitives.js';

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
}

export interface AthleteRow {
  id: string;
  coach_id: string;
  name: string;
  dob: DateValue | null;
  gender: string | null;
  squad: string | null;
  notes: string | null;
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
  athlete_squad: string | null;
  athlete_archived_at: TimestampValue | null;
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

export interface RosterSnapshotRow {
  athlete_id: string;
  name: string;
  squad: string | null;
  discipline: string;
  pb: NumericValue | null;
}

export interface DashboardUpcomingEventRow {
  event_id: string;
  title: string;
  type: string;
  date: DateValue;
  status: string;
  athlete_count: CountValue;
}

export interface DashboardMetricsRow {
  athletes_count: CountValue;
  active_athletes_count: CountValue;
  upcoming_event_count: CountValue;
  season_pbs: CountValue;
}

export interface DashboardMetrics {
  athletesCount: number;
  activeAthletesCount: number;
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
  };
}

export function mapAthleteRow(row: AthleteRow): Athlete {
  return {
    id: uuid(row.id, 'athletes.id'),
    coachId: uuid(row.coach_id, 'athletes.coach_id'),
    name: nonemptyString(row.name, 'athletes.name'),
    dob: row.dob === null ? null : databaseDate(row.dob, 'athletes.dob'),
    gender: nullableString(row.gender, 'athletes.gender'),
    squad: nullableString(row.squad, 'athletes.squad'),
    notes: nullableString(row.notes, 'athletes.notes'),
    archivedAt: nullableTimestamp(row.archived_at, 'athletes.archived_at'),
    createdAt: timestamp(row.created_at, 'athletes.created_at'),
    updatedAt: timestamp(row.updated_at, 'athletes.updated_at'),
  };
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
      squad: nullableString(row.athlete_squad, 'athletes.squad'),
      archivedAt:
        row.athlete_archived_at === null
          ? null
          : timestamp(row.athlete_archived_at, 'athletes.archived_at'),
    },
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
  if (outcome !== 'valid' && (placing !== null || isPb || isSb)) {
    invalid('results outcome metadata', 'placing, PB, and SB require a valid outcome');
  }

  const hasCompleteOverrideAudit =
    overrideReason !== null && overriddenBy !== null && overrideAt !== null;
  if ((manualOverride !== null) !== hasCompleteOverrideAudit) {
    invalid(
      'results override fields',
      'manual_override, override_reason, overridden_by, and override_at must be present together',
    );
  }
  if (manualOverride !== null && outcome !== 'valid') {
    invalid('results.manual_override', 'an override requires a valid outcome');
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

export function mapRosterSnapshotRow(row: RosterSnapshotRow): RosterSnapshotEntry {
  return {
    athleteId: uuid(row.athlete_id, 'roster snapshot.athlete_id'),
    name: nonemptyString(row.name, 'roster snapshot.name'),
    squad: nullableString(row.squad, 'roster snapshot.squad'),
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
    date: databaseDate(row.date, 'dashboard upcoming event.date'),
    status: enumValue(row.status, EVENT_STATUSES, 'dashboard upcoming event.status'),
    athleteCount: count(row.athlete_count, 'dashboard upcoming event.athlete_count'),
  };
}

export function mapDashboardMetricsRow(row: DashboardMetricsRow): DashboardMetrics {
  return {
    athletesCount: count(row.athletes_count, 'dashboard metrics.athletes_count'),
    activeAthletesCount: count(
      row.active_athletes_count,
      'dashboard metrics.active_athletes_count',
    ),
    upcomingEventCount: count(
      row.upcoming_event_count,
      'dashboard metrics.upcoming_event_count',
    ),
    seasonPbs: count(row.season_pbs, 'dashboard metrics.season_pbs'),
  };
}
