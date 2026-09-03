import { ApiError } from '../middleware/errors.js';
import {
  DISCIPLINE_100M,
  ATHLETE_LIFECYCLE_STATUSES,
  ENTRY_TYPES,
  EVENT_STATUSES,
  EVENT_TYPES,
  INCIDENT_TYPES,
  RESULT_UNIT_SECONDS,
  RSVP_STATUSES,
  INJURY_REGIONS,
  INJURY_SIDES,
  INJURY_SEVERITIES,
  type Discipline,
  type AthleteLifecycleStatus,
  type EntryType,
  type EventStatus,
  type EventType,
  type IncidentType,
  type ResultUnit,
  type RsvpStatus,
  type InjuryRegion,
  type InjurySide,
  type InjurySeverity,
} from '../types/domain.js';
import {
  isCanonicalUuid,
  isEnumValue,
  isFiniteNumber,
  isGregorianDate,
  isLatitude,
  isLongitude,
  isPositiveRaceTime,
  normalizeLocalTime,
  normalizeRequiredString,
} from './primitives.js';

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface AthleteCreatePayload {
  name: string;
  dob: string | null;
  gender: string | null;
  squadIds?: string[];
  squad?: string | null;
  notes: string | null;
}

export interface AthleteReplacementPayload {
  name: string;
  dob: string | null;
  gender: string | null;
  squadIds?: string[];
  squad?: string | null;
  notes: string | null;
}

export interface AthleteListQuery {
  includeArchived: boolean;
  status?: AthleteLifecycleStatus;
  name?: string;
  squadId?: string;
  squad?: string;
}

export interface AthleteProgressionQuery {
  cursor?: string;
  limit?: number;
  type?: EventType;
}

export interface AthleteStatusPayload {
  status: AthleteLifecycleStatus;
}

export interface EventCreatePayload {
  type: EventType;
  discipline: Discipline;
  title: string;
  date: string;
  time: string | null;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  status: EventStatus;
}

export interface EventReplacementPayload {
  type: EventType;
  discipline: Discipline;
  title: string;
  date: string;
  time: string | null;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  status: EventStatus;
}

export interface EventListQuery {
  type?: EventType;
  status?: EventStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface WeatherCurrentQuery {
  latitude: number;
  longitude: number;
}

export interface VenueSearchQuery {
  q: string;
}

export interface EventParticipantCreatePayload {
  athleteId: string;
}

export interface EventParticipantReplacementPayload {
  rsvpStatus: RsvpStatus;
}
export interface EventParticipantBulkRsvpPayload { updates: Array<{ athleteId: string; rsvpStatus: RsvpStatus }>; }

export interface TimelineEntryCreatePayload {
  athleteId: string;
  discipline: Discipline;
  entryType: EntryType;
  value: number | null;
  unit: ResultUnit | null;
  isFoul: false;
  incidentType: IncidentType | null;
  noteText: string | null;
  deviceId: string | null;
}

export interface TimelineEntryPatchPayload {
  expectedVersion: number;
  entryType?: EntryType;
  value?: number | null;
  incidentType?: IncidentType | null;
  noteText?: string | null;
}

export interface TimelineEntryDeletePayload {
  expectedVersion: number;
}

export interface TimelineEntryState {
  entryType: EntryType;
  value: number | null;
  unit: ResultUnit | null;
  incidentType: IncidentType | null;
  noteText: string | null;
}

export interface ResultOverridePayload {
  manualOverride: number | null;
  overrideReason: string | null;
}

export interface FixtureInvitationCreatePayload {
  email: string;
  expiresInDays: number;
}

export interface FixtureInvitationResponsePayload {
  response: 'accepted' | 'declined' | 'change_requested';
  message: string | null;
}

const ATHLETE_FIELDS = ['name', 'dob', 'gender', 'squadIds', 'notes'] as const;
const ATHLETE_LIST_QUERY_FIELDS = ['includeArchived', 'status', 'name', 'squadId'] as const;
const ATHLETE_PROGRESSION_QUERY_FIELDS = ['cursor', 'limit', 'type'] as const;
const ATHLETE_STATUS_FIELDS = ['status'] as const;
const SQUAD_FIELDS = ['name'] as const;
const EVENT_LIST_QUERY_FIELDS = ['type', 'status', 'dateFrom', 'dateTo'] as const;
const WEATHER_CURRENT_QUERY_FIELDS = ['latitude', 'longitude'] as const;
const VENUE_SEARCH_QUERY_FIELDS = ['q'] as const;
const EVENT_FIELDS = [
  'type',
  'discipline',
  'title',
  'date',
  'time',
  'locationName',
  'latitude',
  'longitude',
  'status',
] as const;
const EVENT_PARTICIPANT_CREATE_FIELDS = ['athleteId'] as const;
const EVENT_PARTICIPANT_REPLACEMENT_FIELDS = ['rsvpStatus'] as const;
const TIMELINE_CREATE_FIELDS = [
  'athleteId',
  'discipline',
  'entryType',
  'value',
  'unit',
  'isFoul',
  'incidentType',
  'noteText',
  'deviceId',
] as const;
const TIMELINE_PATCH_FIELDS = [
  'expectedVersion',
  'entryType',
  'value',
  'incidentType',
  'noteText',
] as const;
const TIMELINE_DELETE_FIELDS = ['expectedVersion'] as const;
const RESULT_OVERRIDE_FIELDS = ['manualOverride', 'overrideReason'] as const;
const FIXTURE_INVITATION_CREATE_FIELDS = ['email', 'expiresInDays'] as const;
const FIXTURE_INVITATION_RESPONSE_FIELDS = ['response', 'message'] as const;

type PayloadObject = Record<string, unknown>;
const POSTGRES_INTEGER_MAX = 2_147_483_647;

function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message };
}

function compareIssues(left: ValidationIssue, right: ValidationIssue): number {
  if (left.path !== right.path) return left.path < right.path ? -1 : 1;
  if (left.code !== right.code) return left.code < right.code ? -1 : 1;
  if (left.message === right.message) return 0;
  return left.message < right.message ? -1 : 1;
}

function throwValidation(issues: ValidationIssue[]): never {
  throw new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed', {
    issues: [...issues].sort(compareIssues),
  });
}

function payloadObject(input: unknown): PayloadObject {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throwValidation([issue('$', 'invalid_type', 'Expected payload to be an object')]);
  }
  return input as PayloadObject;
}

function hasOwn(payload: PayloadObject, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(payload, field);
}

export function parseEventParticipantCreatePayload(
  input: unknown,
): EventParticipantCreatePayload {
  const payload = payloadObject(input);
  const issues: ValidationIssue[] = [];
  rejectUnknownFields(payload, EVENT_PARTICIPANT_CREATE_FIELDS, issues);

  let athleteId = '';
  if (!hasOwn(payload, 'athleteId')) {
    issues.push(issue('athleteId', 'required', 'Field is required'));
  } else if (!isCanonicalUuid(payload.athleteId)) {
    issues.push(issue('athleteId', 'invalid_format', 'Expected a canonical UUID'));
  } else {
    athleteId = payload.athleteId;
  }

  if (issues.length > 0) throwValidation(issues);
  return { athleteId };
}

export function parseEventParticipantReplacementPayload(
  input: unknown,
): EventParticipantReplacementPayload {
  const payload = payloadObject(input);
  const issues: ValidationIssue[] = [];
  rejectUnknownFields(payload, EVENT_PARTICIPANT_REPLACEMENT_FIELDS, issues);
  const rsvpStatus = requiredEnum(payload, 'rsvpStatus', RSVP_STATUSES, issues);

  if (issues.length > 0) throwValidation(issues);
  return { rsvpStatus };
}

export function parseEventParticipantBulkRsvpPayload(input: unknown): EventParticipantBulkRsvpPayload {
  const payload = payloadObject(input); const issues: ValidationIssue[] = [];
  rejectUnknownFields(payload, ['updates'], issues);
  if (!Array.isArray(payload.updates) || payload.updates.length === 0 || payload.updates.length > 100) issues.push(issue('updates', 'invalid_value', 'Provide 1 to 100 RSVP updates'));
  const seen = new Set<string>(); const updates: Array<{ athleteId: string; rsvpStatus: RsvpStatus }> = [];
  if (Array.isArray(payload.updates)) payload.updates.forEach((value, index) => {
    const row = payloadObject(value); rejectUnknownFields(row, ['athleteId', 'rsvpStatus'], issues);
    const athleteId = typeof row.athleteId === 'string' && isCanonicalUuid(row.athleteId) ? row.athleteId : '';
    if (!athleteId || seen.has(athleteId)) issues.push(issue(`updates.${index}.athleteId`, 'invalid_value', 'Athlete ID must be unique and valid')); else seen.add(athleteId);
    const rsvpStatus = requiredEnum(row, 'rsvpStatus', RSVP_STATUSES, issues);
    if (athleteId && rsvpStatus) updates.push({ athleteId, rsvpStatus });
  });
  if (issues.length > 0) throwValidation(issues); return { updates };
}

function rejectUnknownFields(
  payload: PayloadObject,
  allowedFields: readonly string[],
  issues: ValidationIssue[],
): void {
  const allowed = new Set(allowedFields);
  for (const field of Object.keys(payload)) {
    if (!allowed.has(field)) {
      issues.push(issue(field, 'unknown_field', 'Field is not allowed'));
    }
  }
}

function requiredString(
  payload: PayloadObject,
  field: string,
  issues: ValidationIssue[],
): string {
  if (!hasOwn(payload, field)) {
    issues.push(issue(field, 'required', 'Field is required'));
    return '';
  }
  if (typeof payload[field] !== 'string') {
    issues.push(issue(field, 'invalid_type', 'Expected a string'));
    return '';
  }
  const value = normalizeRequiredString(payload[field]);
  if (value === null) {
    issues.push(issue(field, 'blank', 'Must not be blank'));
    return '';
  }
  return value;
}

function nullableString(
  payload: PayloadObject,
  field: string,
  issues: ValidationIssue[],
): string | null {
  if (!hasOwn(payload, field) || payload[field] === null) return null;
  if (typeof payload[field] !== 'string') {
    issues.push(issue(field, 'invalid_type', 'Expected a string or null'));
    return null;
  }
  const normalized = payload[field].trim();
  return normalized.length === 0 ? null : normalized;
}

function requiredUuidArray(payload: PayloadObject, field: string, issues: ValidationIssue[]): string[] {
  if (!hasOwn(payload, field)) { issues.push(issue(field, 'required', 'Field is required')); return []; }
  if (!Array.isArray(payload[field])) { issues.push(issue(field, 'invalid_type', 'Expected an array of canonical UUIDs')); return []; }
  const values = payload[field];
  const ids: string[] = [];
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (!isCanonicalUuid(value)) issues.push(issue(`${field}.${index}`, 'invalid_format', 'Expected a canonical UUID'));
    else if (seen.has(value)) issues.push(issue(`${field}.${index}`, 'duplicate', 'Squad IDs must be unique'));
    else { seen.add(value); ids.push(value); }
  });
  return ids;
}

function optionalQueryString(
  query: PayloadObject,
  field: string,
  issues: ValidationIssue[],
): string | undefined {
  if (!hasOwn(query, field)) return undefined;
  if (typeof query[field] !== 'string') {
    issues.push(issue(field, 'invalid_type', 'Expected a string'));
    return undefined;
  }
  const normalized = normalizeRequiredString(query[field]);
  if (normalized === null) {
    issues.push(issue(field, 'blank', 'Must not be blank'));
    return undefined;
  }
  return normalized;
}

function optionalQueryEnum<const Values extends readonly string[]>(
  query: PayloadObject,
  field: string,
  values: Values,
  issues: ValidationIssue[],
): Values[number] | undefined {
  const value = optionalQueryString(query, field, issues);
  if (value === undefined) return undefined;
  if (!isEnumValue(value, values)) {
    issues.push(issue(field, 'invalid_value', `Expected one of: ${values.join(', ')}`));
    return undefined;
  }
  return value;
}

function optionalQueryDate(
  query: PayloadObject,
  field: string,
  issues: ValidationIssue[],
): string | undefined {
  if (!hasOwn(query, field)) return undefined;
  const value = typeof query[field] === 'string' ? query[field].trim() : query[field];
  if (!isGregorianDate(value)) {
    issues.push(issue(field, 'invalid_format', 'Expected a real date in YYYY-MM-DD format'));
    return undefined;
  }
  return value;
}

function requiredEnum<const Values extends readonly string[]>(
  payload: PayloadObject,
  field: string,
  values: Values,
  issues: ValidationIssue[],
): Values[number] {
  if (!hasOwn(payload, field)) {
    issues.push(issue(field, 'required', 'Field is required'));
    return values[0];
  }
  if (!isEnumValue(payload[field], values)) {
    issues.push(issue(field, 'invalid_value', `Expected one of: ${values.join(', ')}`));
    return values[0];
  }
  return payload[field];
}

function requiredPositiveInteger(
  payload: PayloadObject,
  field: string,
  issues: ValidationIssue[],
): number {
  if (!hasOwn(payload, field)) {
    issues.push(issue(field, 'required', 'Field is required'));
    return 0;
  }
  if (
    !Number.isSafeInteger(payload[field])
    || Number(payload[field]) <= 0
    || Number(payload[field]) > POSTGRES_INTEGER_MAX
  ) {
    issues.push(issue(field, 'invalid_value', 'Expected a positive integer'));
    return 0;
  }
  return payload[field] as number;
}

function requiredDate(
  payload: PayloadObject,
  field: string,
  issues: ValidationIssue[],
): string {
  if (!hasOwn(payload, field)) {
    issues.push(issue(field, 'required', 'Field is required'));
    return '';
  }
  if (!isGregorianDate(payload[field])) {
    issues.push(issue(field, 'invalid_format', 'Expected a real date in YYYY-MM-DD format'));
    return '';
  }
  return payload[field];
}

function nullableDate(
  payload: PayloadObject,
  field: string,
  issues: ValidationIssue[],
): string | null {
  if (!hasOwn(payload, field) || payload[field] === null) return null;
  if (!isGregorianDate(payload[field])) {
    issues.push(issue(field, 'invalid_format', 'Expected a real date in YYYY-MM-DD format or null'));
    return null;
  }
  return payload[field];
}

function nullableTime(
  payload: PayloadObject,
  field: string,
  issues: ValidationIssue[],
): string | null {
  if (!hasOwn(payload, field) || payload[field] === null) return null;
  const value = normalizeLocalTime(payload[field]);
  if (value === null) {
    issues.push(issue(field, 'invalid_format', 'Expected a time in HH:mm or HH:mm:ss format'));
  }
  return value;
}

function nullableCoordinate(
  payload: PayloadObject,
  field: 'latitude' | 'longitude',
  issues: ValidationIssue[],
): number | null {
  if (!hasOwn(payload, field) || payload[field] === null) return null;
  if (!isFiniteNumber(payload[field])) {
    issues.push(issue(field, 'invalid_type', 'Expected a finite number or null'));
    return null;
  }

  const valid = field === 'latitude' ? isLatitude(payload[field]) : isLongitude(payload[field]);
  if (!valid) {
    const range = field === 'latitude' ? '-90 to 90' : '-180 to 180';
    issues.push(issue(field, 'out_of_range', `Expected a number from ${range}`));
    return null;
  }
  return payload[field];
}

function parseAthlete(input: unknown): AthleteCreatePayload {
  const payload = payloadObject(input);
  const issues: ValidationIssue[] = [];
  rejectUnknownFields(payload, ATHLETE_FIELDS, issues);

  const result: AthleteCreatePayload = {
    name: requiredString(payload, 'name', issues),
    dob: nullableDate(payload, 'dob', issues),
    gender: nullableString(payload, 'gender', issues),
    squadIds: requiredUuidArray(payload, 'squadIds', issues),
    notes: nullableString(payload, 'notes', issues),
  };

  if (issues.length > 0) throwValidation(issues);
  return result;
}

export function parseAthleteCreatePayload(input: unknown): AthleteCreatePayload {
  return parseAthlete(input);
}

export function parseAthleteReplacementPayload(input: unknown): AthleteReplacementPayload {
  return parseAthlete(input);
}

export function parseAthleteListQuery(input: Record<string, unknown>): AthleteListQuery {
  const issues: ValidationIssue[] = [];
  rejectUnknownFields(input, ATHLETE_LIST_QUERY_FIELDS, issues);

  let includeArchived = false;
  if (hasOwn(input, 'includeArchived')) {
    if (input.includeArchived === 'true' || input.includeArchived === 'false') {
      includeArchived = input.includeArchived === 'true';
    } else {
      issues.push(issue('includeArchived', 'invalid_value', 'Expected "true" or "false"'));
    }
  }

  const name = optionalQueryString(input, 'name', issues);
  const status = optionalQueryEnum(input, 'status', ATHLETE_LIFECYCLE_STATUSES, issues);
  const squadId = optionalQueryString(input, 'squadId', issues);
  if (squadId !== undefined && !isCanonicalUuid(squadId)) issues.push(issue('squadId', 'invalid_format', 'Expected a canonical UUID'));

  if (issues.length > 0) throwValidation(issues);

  return {
    includeArchived,
    ...(status === undefined ? {} : { status }),
    ...(name === undefined ? {} : { name }),
    ...(squadId === undefined ? {} : { squadId }),
  };
}

export interface PublicLoggerSessionPayload {
  linkToken: string;
  name: string;
  club: string;
}

export function parseAthleteProgressionQuery(input: Record<string, unknown>): AthleteProgressionQuery {
  const issues: ValidationIssue[] = [];
  rejectUnknownFields(input, ATHLETE_PROGRESSION_QUERY_FIELDS, issues);
  const cursor = optionalQueryString(input, 'cursor', issues);
  const type = optionalQueryEnum(input, 'type', EVENT_TYPES, issues);
  let limit: number | undefined;
  if (hasOwn(input, 'limit')) {
    const raw = input.limit;
    if (typeof raw !== 'string' || !/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 200) {
      issues.push(issue('limit', 'invalid_value', 'Expected an integer from 1 to 200'));
    } else {
      limit = Number(raw);
    }
  }
  if (issues.length > 0) throwValidation(issues);
  return {
    ...(cursor === undefined ? {} : { cursor }),
    ...(limit === undefined ? {} : { limit }),
    ...(type === undefined ? {} : { type }),
  };
}

export function parseAthleteStatusPayload(input: unknown): AthleteStatusPayload {
  const payload = payloadObject(input);
  const issues: ValidationIssue[] = [];
  rejectUnknownFields(payload, ATHLETE_STATUS_FIELDS, issues);
  const status = requiredEnum(payload, 'status', ATHLETE_LIFECYCLE_STATUSES, issues);
  if (issues.length > 0) throwValidation(issues);
  return { status };
}

export function parseSquadPayload(input: unknown): { name: string } {
  const payload = payloadObject(input);
  const issues: ValidationIssue[] = [];
  rejectUnknownFields(payload, SQUAD_FIELDS, issues);
  const name = requiredString(payload, 'name', issues);
  if (issues.length > 0) throwValidation(issues);
  return { name };
}

function parseEvent(input: unknown, requireStatus: boolean): EventCreatePayload {
  const payload = payloadObject(input);
  const issues: ValidationIssue[] = [];
  rejectUnknownFields(payload, EVENT_FIELDS, issues);

  let discipline: Discipline = DISCIPLINE_100M;
  if (hasOwn(payload, 'discipline') && payload.discipline !== null) {
    if (payload.discipline === DISCIPLINE_100M) {
      discipline = DISCIPLINE_100M;
    } else {
      issues.push(issue('discipline', 'invalid_value', `Expected ${DISCIPLINE_100M} or null`));
    }
  }

  let status: EventStatus = 'scheduled';
  if (requireStatus || hasOwn(payload, 'status')) {
    status = requiredEnum(payload, 'status', EVENT_STATUSES, issues);
  }

  const result: EventCreatePayload = {
    type: requiredEnum(payload, 'type', EVENT_TYPES, issues),
    discipline,
    title: requiredString(payload, 'title', issues),
    date: requiredDate(payload, 'date', issues),
    time: nullableTime(payload, 'time', issues),
    locationName: nullableString(payload, 'locationName', issues),
    latitude: nullableCoordinate(payload, 'latitude', issues),
    longitude: nullableCoordinate(payload, 'longitude', issues),
    status,
  };

  if (issues.length > 0) throwValidation(issues);
  return result;
}

export function parseEventCreatePayload(input: unknown): EventCreatePayload {
  return parseEvent(input, false);
}

export function parseEventReplacementPayload(input: unknown): EventReplacementPayload {
  return parseEvent(input, true);
}

export function parseEventListQuery(input: Record<string, unknown>): EventListQuery {
  const issues: ValidationIssue[] = [];
  rejectUnknownFields(input, EVENT_LIST_QUERY_FIELDS, issues);

  const type = optionalQueryEnum(input, 'type', EVENT_TYPES, issues);
  const status = optionalQueryEnum(input, 'status', EVENT_STATUSES, issues);
  const dateFrom = optionalQueryDate(input, 'dateFrom', issues);
  const dateTo = optionalQueryDate(input, 'dateTo', issues);

  if (dateFrom !== undefined && dateTo !== undefined && dateFrom > dateTo) {
    issues.push(issue('dateFrom', 'invalid_range', 'dateFrom must not be after dateTo'));
  }

  if (issues.length > 0) throwValidation(issues);

  return {
    ...(type === undefined ? {} : { type }),
    ...(status === undefined ? {} : { status }),
    ...(dateFrom === undefined ? {} : { dateFrom }),
    ...(dateTo === undefined ? {} : { dateTo }),
  };
}

export function parseWeatherCurrentQuery(input: Record<string, unknown>): WeatherCurrentQuery {
  const issues: ValidationIssue[] = [];
  rejectUnknownFields(input, WEATHER_CURRENT_QUERY_FIELDS, issues);

  const coordinates = new Map<string, number>([
    ['latitude', 0],
    ['longitude', 0],
  ]);
  for (const [field, range] of [['latitude', 90], ['longitude', 180]] as const) {
    const value = input[field];
    if (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value.trim())) {
      issues.push(issue(field, 'invalid_format', 'Expected a decimal number'));
      continue;
    }
    const parsed = Number(value);
    if (!isFiniteNumber(parsed) || Math.abs(parsed) > range) {
      issues.push(issue(field, 'out_of_range', `Expected a number from ${-range} to ${range}`));
      continue;
    }
    coordinates.set(field, parsed);
  }

  if (issues.length > 0) throwValidation(issues);
  return { latitude: coordinates.get('latitude')!, longitude: coordinates.get('longitude')! };
}

export function parseVenueSearchQuery(input: Record<string, unknown>): VenueSearchQuery {
  const issues: ValidationIssue[] = [];
  rejectUnknownFields(input, VENUE_SEARCH_QUERY_FIELDS, issues);
  const q = optionalQueryString(input, 'q', issues);
  if (q === undefined) {
    if (!issues.some((entry) => entry.path === 'q')) issues.push(issue('q', 'required', 'Query is required'));
  } else if (q.length > 200) {
    issues.push(issue('q', 'too_long', 'Query must be 200 characters or fewer'));
  }
  if (issues.length > 0) throwValidation(issues);
  return { q: q! };
}

function timelineStateIssues(state: TimelineEntryState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (state.entryType === 'note') {
    if (state.noteText === null) {
      issues.push(issue('noteText', 'required', 'A note entry requires noteText'));
    } else if (normalizeRequiredString(state.noteText) === null) {
      issues.push(issue('noteText', 'blank', 'Must not be blank'));
    }
    if (state.value !== null) {
      issues.push(issue('value', 'invalid_state', 'A note entry cannot have a value'));
    }
    if (state.unit !== null) {
      issues.push(issue('unit', 'invalid_state', 'A note entry cannot have a unit'));
    }
    if (state.incidentType !== null) {
      issues.push(issue('incidentType', 'invalid_state', 'A note entry cannot have an incident'));
    }
  } else {
    if (state.noteText !== null) {
      issues.push(issue('noteText', 'invalid_state', 'Only a note entry can have noteText'));
    }
    if ((state.value === null) !== (state.unit === null)) {
      issues.push(
        issue('unit', 'invalid_state', 'A value and seconds unit must either both be present or both be null'),
      );
    }
  }
  return issues;
}

export function validateTimelineEntryState(state: TimelineEntryState): void {
  const issues = timelineStateIssues(state);
  if (issues.length > 0) throwValidation(issues);
}

export function applyTimelineEntryPatch(
  state: TimelineEntryState,
  patch: TimelineEntryPatchPayload,
): TimelineEntryState {
  const { expectedVersion: _expectedVersion, ...editable } = patch;
  const merged = { ...state, ...editable };
  const result = {
    entryType: merged.entryType,
    value: merged.value,
    unit: merged.value === null ? null : RESULT_UNIT_SECONDS,
    incidentType: merged.incidentType,
    noteText: merged.noteText,
  };
  validateTimelineEntryState(result);
  return result;
}

export function parseTimelineEntryCreatePayload(input: unknown): TimelineEntryCreatePayload {
  const payload = payloadObject(input);
  const issues: ValidationIssue[] = [];
  rejectUnknownFields(payload, TIMELINE_CREATE_FIELDS, issues);

  let athleteId = '';
  if (!hasOwn(payload, 'athleteId')) {
    issues.push(issue('athleteId', 'required', 'Field is required'));
  } else if (!isCanonicalUuid(payload.athleteId)) {
    issues.push(issue('athleteId', 'invalid_format', 'Expected a canonical UUID'));
  } else {
    athleteId = payload.athleteId;
  }

  if (hasOwn(payload, 'discipline') && payload.discipline !== DISCIPLINE_100M) {
    issues.push(issue('discipline', 'invalid_value', `Expected ${DISCIPLINE_100M}`));
  }

  const entryType = requiredEnum(payload, 'entryType', ENTRY_TYPES, issues);

  let value: number | null = null;
  let valueValid = true;
  if (hasOwn(payload, 'value') && payload.value !== null) {
    if (!isPositiveRaceTime(payload.value)) {
      issues.push(issue('value', 'invalid_value', 'Expected a positive finite race time or null'));
      valueValid = false;
    } else {
      value = payload.value;
    }
  }

  let unit: ResultUnit | null = value === null ? null : RESULT_UNIT_SECONDS;
  let unitValid = true;
  if (hasOwn(payload, 'unit')) {
    if (payload.unit === null) {
      unit = null;
    } else if (payload.unit !== RESULT_UNIT_SECONDS) {
      issues.push(issue('unit', 'invalid_value', `Expected ${RESULT_UNIT_SECONDS}`));
      unitValid = false;
    } else {
      unit = RESULT_UNIT_SECONDS;
    }
  }

  if (hasOwn(payload, 'isFoul') && payload.isFoul !== false) {
    issues.push(issue('isFoul', 'invalid_value', 'Expected false'));
  }

  let incidentType: IncidentType | null = null;
  let incidentValid = true;
  if (hasOwn(payload, 'incidentType') && payload.incidentType !== null) {
    if (!isEnumValue(payload.incidentType, INCIDENT_TYPES)) {
      issues.push(
        issue('incidentType', 'invalid_value', `Expected one of: ${INCIDENT_TYPES.join(', ')}, or null`),
      );
      incidentValid = false;
    } else {
      incidentType = payload.incidentType;
    }
  }

  let noteText: string | null = null;
  let noteValid = true;
  if (hasOwn(payload, 'noteText') && payload.noteText !== null) {
    if (typeof payload.noteText !== 'string') {
      issues.push(issue('noteText', 'invalid_type', 'Expected a string or null'));
      noteValid = false;
    } else {
      const normalized = normalizeRequiredString(payload.noteText);
      if (normalized === null) {
        issues.push(issue('noteText', 'blank', 'Must not be blank'));
        noteValid = false;
      } else {
        noteText = normalized;
      }
    }
  }

  const deviceId = nullableString(payload, 'deviceId', issues);
  const state: TimelineEntryState = { entryType, value, unit, incidentType, noteText };
  const entryTypeValid = hasOwn(payload, 'entryType') && isEnumValue(payload.entryType, ENTRY_TYPES);
  if (entryTypeValid && valueValid && unitValid && incidentValid && noteValid) {
    issues.push(...timelineStateIssues(state));
  }

  if (issues.length > 0) throwValidation(issues);
  return {
    athleteId,
    discipline: DISCIPLINE_100M,
    entryType,
    value,
    unit,
    isFoul: false,
    incidentType,
    noteText,
    deviceId,
  };
}

export function parsePublicLoggerSessionPayload(input: unknown): PublicLoggerSessionPayload {
  const payload = payloadObject(input);
  const issues: ValidationIssue[] = [];
  rejectUnknownFields(payload, ['linkToken', 'name', 'club'], issues);
  const fields = ['linkToken', 'name', 'club'] as const;
  const values = {} as PublicLoggerSessionPayload;
  for (const field of fields) {
    const value = payload[field];
    if (typeof value !== 'string') issues.push(issue(field, 'required', 'Field is required'));
    else {
      const normalized = normalizeRequiredString(value);
      if (normalized === null) issues.push(issue(field, 'blank', 'Must not be blank'));
      else if (normalized.length > (field === 'linkToken' ? 200 : 120)) issues.push(issue(field, 'too_long', 'Value is too long'));
      else values[field] = normalized;
    }
  }
  if (issues.length > 0) throwValidation(issues);
  return values;
}

export function parsePublicLoggerEntryPayload(input: unknown): TimelineEntryCreatePayload {
  const entry = parseTimelineEntryCreatePayload(input);
  const issues: ValidationIssue[] = [];
  if (entry.entryType !== 'attempt' && entry.entryType !== 'penalty') {
    issues.push(issue('entryType', 'invalid_value', 'Public loggers can create attempts or incidents only'));
  }
  if (entry.entryType === 'attempt' && entry.value === null) {
    issues.push(issue('value', 'required', 'An attempt requires a race time'));
  }
  if (entry.entryType === 'penalty' && entry.incidentType === null) {
    issues.push(issue('incidentType', 'required', 'An incident requires an incident type'));
  }
  if (issues.length > 0) throwValidation(issues);
  return entry;
}

export function parseTimelineEntryPatchPayload(input: unknown): TimelineEntryPatchPayload {
  const payload = payloadObject(input);
  const issues: ValidationIssue[] = [];
  rejectUnknownFields(payload, TIMELINE_PATCH_FIELDS, issues);
  if (!TIMELINE_PATCH_FIELDS.slice(1).some((field) => hasOwn(payload, field))) {
    issues.push(issue('$', 'empty_payload', 'At least one editable field is required'));
  }

  const result: TimelineEntryPatchPayload = {
    expectedVersion: requiredPositiveInteger(payload, 'expectedVersion', issues),
  };
  if (hasOwn(payload, 'entryType')) {
    if (!isEnumValue(payload.entryType, ENTRY_TYPES)) {
      issues.push(issue('entryType', 'invalid_value', `Expected one of: ${ENTRY_TYPES.join(', ')}`));
    } else {
      result.entryType = payload.entryType;
    }
  }

  if (hasOwn(payload, 'value')) {
    if (payload.value === null) {
      result.value = null;
    } else if (!isPositiveRaceTime(payload.value)) {
      issues.push(issue('value', 'invalid_value', 'Expected a positive finite race time or null'));
    } else {
      result.value = payload.value;
    }
  }

  if (hasOwn(payload, 'incidentType')) {
    if (payload.incidentType === null) {
      result.incidentType = null;
    } else if (!isEnumValue(payload.incidentType, INCIDENT_TYPES)) {
      issues.push(
        issue('incidentType', 'invalid_value', `Expected one of: ${INCIDENT_TYPES.join(', ')}, or null`),
      );
    } else {
      result.incidentType = payload.incidentType;
    }
  }

  if (hasOwn(payload, 'noteText')) {
    if (payload.noteText === null) {
      result.noteText = null;
    } else if (typeof payload.noteText !== 'string') {
      issues.push(issue('noteText', 'invalid_type', 'Expected a string or null'));
    } else {
      const normalized = normalizeRequiredString(payload.noteText);
      if (normalized === null) {
        issues.push(issue('noteText', 'blank', 'Must not be blank'));
      } else {
        result.noteText = normalized;
      }
    }
  }

  if (issues.length > 0) throwValidation(issues);
  return result;
}

export function parseTimelineEntryDeletePayload(input: unknown): TimelineEntryDeletePayload {
  const payload = payloadObject(input);
  const issues: ValidationIssue[] = [];
  rejectUnknownFields(payload, TIMELINE_DELETE_FIELDS, issues);
  const expectedVersion = requiredPositiveInteger(payload, 'expectedVersion', issues);

  if (issues.length > 0) throwValidation(issues);
  return { expectedVersion };
}

export function parseResultOverridePayload(input: unknown): ResultOverridePayload {
  const payload = payloadObject(input);
  const issues: ValidationIssue[] = [];
  rejectUnknownFields(payload, RESULT_OVERRIDE_FIELDS, issues);

  const hasManualOverride = hasOwn(payload, 'manualOverride');
  const hasOverrideReason = hasOwn(payload, 'overrideReason');
  if (!hasManualOverride) issues.push(issue('manualOverride', 'required', 'Field is required'));
  if (!hasOverrideReason) issues.push(issue('overrideReason', 'required', 'Field is required'));

  let manualOverride: number | null = null;
  let manualOverrideValid = hasManualOverride;
  if (hasManualOverride && payload.manualOverride !== null) {
    if (!isPositiveRaceTime(payload.manualOverride)) {
      issues.push(
        issue('manualOverride', 'invalid_value', 'Expected a positive finite race time or null'),
      );
      manualOverrideValid = false;
    } else {
      manualOverride = payload.manualOverride;
    }
  }

  let overrideReason: string | null = null;
  let overrideReasonValid = hasOverrideReason;
  if (hasOverrideReason && payload.overrideReason !== null) {
    if (typeof payload.overrideReason !== 'string') {
      issues.push(issue('overrideReason', 'invalid_type', 'Expected a string or null'));
      overrideReasonValid = false;
    } else {
      const normalized = normalizeRequiredString(payload.overrideReason);
      if (normalized === null) {
        issues.push(issue('overrideReason', 'blank', 'Must not be blank'));
        overrideReasonValid = false;
      } else {
        overrideReason = normalized;
      }
    }
  }

  if (manualOverrideValid && overrideReasonValid) {
    if (manualOverride === null && overrideReason !== null) {
      issues.push(
        issue('overrideReason', 'invalid_state', 'overrideReason must be null when clearing an override'),
      );
    } else if (manualOverride !== null && overrideReason === null) {
      issues.push(
        issue('overrideReason', 'required', 'A manual override requires a nonblank overrideReason'),
      );
    }
  }

  if (issues.length > 0) throwValidation(issues);
  return { manualOverride, overrideReason };
}

export function parseFixtureInvitationCreatePayload(input: unknown): FixtureInvitationCreatePayload {
  const payload = payloadObject(input);
  const issues: ValidationIssue[] = [];
  rejectUnknownFields(payload, FIXTURE_INVITATION_CREATE_FIELDS, issues);
  const email = typeof payload.email === 'string' && /^\S+@\S+\.\S+$/.test(payload.email.trim())
    ? payload.email.trim().toLowerCase()
    : '';
  if (!email) issues.push(issue('email', 'invalid_format', 'Expected an email address'));
  let expiresInDays = 7;
  if (payload.expiresInDays !== undefined) {
    if (typeof payload.expiresInDays !== 'number' || !Number.isSafeInteger(payload.expiresInDays) || payload.expiresInDays < 1 || payload.expiresInDays > 30) {
      issues.push(issue('expiresInDays', 'invalid_value', 'Expected an integer from 1 to 30'));
    } else {
      expiresInDays = payload.expiresInDays;
    }
  }
  if (issues.length > 0) throwValidation(issues);
  return { email, expiresInDays };
}

export function parseFixtureInvitationResponsePayload(input: unknown): FixtureInvitationResponsePayload {
  const payload = payloadObject(input);
  const issues: ValidationIssue[] = [];
  rejectUnknownFields(payload, FIXTURE_INVITATION_RESPONSE_FIELDS, issues);
  const response = requiredEnum(
    payload,
    'response',
    ['accepted', 'declined', 'change_requested'] as const,
    issues,
  );
  let message: string | null = null;
  if (payload.message !== undefined && payload.message !== null) {
    message = normalizeRequiredString(payload.message);
    if (message === null) issues.push(issue('message', 'blank', 'Must not be blank'));
  }
  if (response === 'change_requested' && message === null) {
    issues.push(issue('message', 'required', 'A change request needs a message'));
  }
  if (response !== 'change_requested' && message !== null) {
    issues.push(issue('message', 'not_allowed', 'Only change requests may include a message'));
  }
  if (issues.length > 0) throwValidation(issues);
  return { response, message };
}

export interface InjuryCreatePayload {
  bodyRegion: InjuryRegion;
  area: string;
  side: InjurySide;
  severity: InjurySeverity;
  notes: string | null;
  occurrenceDate: string | null;
  expectedReturnDate: string | null;
}

export interface InjuryUpdatePayload {
  bodyRegion?: InjuryRegion;
  area?: string;
  side?: InjurySide;
  severity?: InjurySeverity;
  notes?: string | null;
  occurrenceDate?: string | null;
  expectedReturnDate?: string | null;
}

export interface InjuryResolvePayload {
  resolvedDate?: string | null;
  resolutionNotes?: string | null;
}

export interface InjuryListQuery {
  includeDeleted?: boolean;
  status?: 'active' | 'resolved' | 'all';
  severity?: InjurySeverity;
}

const INJURY_CREATE_FIELDS = ['bodyRegion', 'area', 'side', 'severity', 'notes', 'occurrenceDate', 'expectedReturnDate'] as const;
const INJURY_UPDATE_FIELDS = ['bodyRegion', 'area', 'side', 'severity', 'notes', 'occurrenceDate', 'expectedReturnDate'] as const;
const INJURY_RESOLVE_FIELDS = ['resolvedDate', 'resolutionNotes'] as const;

export function parseInjuryCreatePayload(input: unknown): InjuryCreatePayload {
  const payload = payloadObject(input);
  const issues: ValidationIssue[] = [];
  rejectUnknownFields(payload, INJURY_CREATE_FIELDS, issues);

  const bodyRegion = requiredEnum(payload, 'bodyRegion', Object.keys(INJURY_REGIONS) as InjuryRegion[], issues);
  const area = requiredString(payload, 'area', issues);
  const side = requiredEnum(payload, 'side', INJURY_SIDES, issues);
  const severity = requiredEnum(payload, 'severity', INJURY_SEVERITIES, issues);
  const notes = nullableString(payload, 'notes', issues);

  let occurrenceDate: string | null = null;
  if (hasOwn(payload, 'occurrenceDate') && payload.occurrenceDate !== null) {
    if (typeof payload.occurrenceDate !== 'string' || !isGregorianDate(payload.occurrenceDate)) {
    issues.push(issue('occurrenceDate', 'invalid_format', 'Expected a Gregorian date (YYYY-MM-DD)'));
    } else {
      occurrenceDate = payload.occurrenceDate;
    }
  }

  let expectedReturnDate: string | null = null;
  if (hasOwn(payload, 'expectedReturnDate') && payload.expectedReturnDate !== null) {
    if (typeof payload.expectedReturnDate !== 'string' || !isGregorianDate(payload.expectedReturnDate)) {
      issues.push(issue('expectedReturnDate', 'invalid_format', 'Expected a Gregorian date (YYYY-MM-DD) or null'));
    } else {
      expectedReturnDate = payload.expectedReturnDate;
      if (occurrenceDate !== null && expectedReturnDate < occurrenceDate) {
        issues.push(issue('expectedReturnDate', 'invalid_value', 'Expected return date must be on or after occurrence date'));
      }
    }
  }

  if (bodyRegion && area) {
    const allowedAreas = INJURY_REGIONS[bodyRegion as InjuryRegion] as readonly string[];
    if (allowedAreas && !allowedAreas.includes(area)) {
      issues.push(issue('area', 'invalid_value', `Area "${area}" is not valid for body region "${bodyRegion}"`));
    }
  }

  if (issues.length > 0) throwValidation(issues);
  return {
    bodyRegion: bodyRegion as InjuryRegion,
    area,
    side: side as InjurySide,
    severity: severity as InjurySeverity,
    notes,
    occurrenceDate,
    expectedReturnDate,
  };
}

export function parseInjuryUpdatePayload(input: unknown): InjuryUpdatePayload {
  const payload = payloadObject(input);
  const issues: ValidationIssue[] = [];
  rejectUnknownFields(payload, INJURY_UPDATE_FIELDS, issues);

  const result: InjuryUpdatePayload = {};

  if (hasOwn(payload, 'bodyRegion')) {
    if (!isEnumValue(payload.bodyRegion, Object.keys(INJURY_REGIONS))) {
      issues.push(issue('bodyRegion', 'invalid_value', 'Expected a valid body region'));
    } else {
      result.bodyRegion = payload.bodyRegion as InjuryRegion;
    }
  }

  if (hasOwn(payload, 'area')) {
    const norm = normalizeRequiredString(payload.area);
    if (norm === null) {
      issues.push(issue('area', 'blank', 'Must not be blank'));
    } else {
      result.area = norm;
    }
  }

  if (hasOwn(payload, 'side')) {
    if (!isEnumValue(payload.side, INJURY_SIDES)) {
      issues.push(issue('side', 'invalid_value', 'Expected a valid side'));
    } else {
      result.side = payload.side as InjurySide;
    }
  }

  if (hasOwn(payload, 'severity')) {
    if (!isEnumValue(payload.severity, INJURY_SEVERITIES)) {
      issues.push(issue('severity', 'invalid_value', 'Expected a valid severity'));
    } else {
      result.severity = payload.severity as InjurySeverity;
    }
  }

  if (hasOwn(payload, 'notes')) {
    result.notes = nullableString(payload, 'notes', issues);
  }

  if (hasOwn(payload, 'occurrenceDate')) {
    if (payload.occurrenceDate === null) {
      result.occurrenceDate = null;
    } else if (typeof payload.occurrenceDate !== 'string' || !isGregorianDate(payload.occurrenceDate)) {
      issues.push(issue('occurrenceDate', 'invalid_format', 'Expected a Gregorian date (YYYY-MM-DD)'));
    } else {
      result.occurrenceDate = payload.occurrenceDate;
    }
  }

  if (hasOwn(payload, 'expectedReturnDate')) {
    if (payload.expectedReturnDate === null) {
      result.expectedReturnDate = null;
    } else if (typeof payload.expectedReturnDate !== 'string' || !isGregorianDate(payload.expectedReturnDate)) {
      issues.push(issue('expectedReturnDate', 'invalid_format', 'Expected a Gregorian date (YYYY-MM-DD) or null'));
    } else {
      result.expectedReturnDate = payload.expectedReturnDate;
    }
  }

  if (issues.length > 0) throwValidation(issues);
  return result;
}

export function parseInjuryResolvePayload(input: unknown): InjuryResolvePayload {
  const payload = payloadObject(input);
  const issues: ValidationIssue[] = [];
  rejectUnknownFields(payload, INJURY_RESOLVE_FIELDS, issues);

  let resolvedDate: string | null = null;
  if (hasOwn(payload, 'resolvedDate') && payload.resolvedDate !== null) {
    if (typeof payload.resolvedDate !== 'string') {
      issues.push(issue('resolvedDate', 'invalid_type', 'Expected a timestamp string or null'));
    } else {
      resolvedDate = payload.resolvedDate;
    }
  }

  const resolutionNotes = nullableString(payload, 'resolutionNotes', issues);

  if (issues.length > 0) throwValidation(issues);
  return { resolvedDate, resolutionNotes };
}

export function parseInjuryListQuery(input: unknown): InjuryListQuery {
  const payload = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const query: InjuryListQuery = {};

  if (payload.includeDeleted === 'true' || payload.includeDeleted === true) {
    query.includeDeleted = true;
  }

  if (payload.status === 'active' || payload.status === 'resolved' || payload.status === 'all') {
    query.status = payload.status;
  }

  if (payload.severity && isEnumValue(payload.severity, INJURY_SEVERITIES)) {
    query.severity = payload.severity as InjurySeverity;
  }

  return query;
}
