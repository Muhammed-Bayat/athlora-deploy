import { ApiError } from '../middleware/errors.js';
import {
  DISCIPLINE_100M,
  ENTRY_TYPES,
  EVENT_STATUSES,
  EVENT_TYPES,
  INCIDENT_TYPES,
  RESULT_UNIT_SECONDS,
  RSVP_STATUSES,
  type Discipline,
  type EntryType,
  type EventStatus,
  type EventType,
  type IncidentType,
  type ResultUnit,
  type RsvpStatus,
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
  squad: string | null;
  notes: string | null;
}

export interface AthleteReplacementPayload {
  name: string;
  dob: string | null;
  gender: string | null;
  squad: string | null;
  notes: string | null;
}

export interface AthleteListQuery {
  includeArchived: boolean;
  name?: string;
  squad?: string;
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

export interface EventParticipantCreatePayload {
  athleteId: string;
}

export interface EventParticipantReplacementPayload {
  rsvpStatus: RsvpStatus;
}

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
  entryType?: EntryType;
  value?: number | null;
  incidentType?: IncidentType | null;
  noteText?: string | null;
  deviceId?: string | null;
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

const ATHLETE_FIELDS = ['name', 'dob', 'gender', 'squad', 'notes'] as const;
const ATHLETE_LIST_QUERY_FIELDS = ['includeArchived', 'name', 'squad'] as const;
const EVENT_LIST_QUERY_FIELDS = ['type', 'status', 'dateFrom', 'dateTo'] as const;
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
  'entryType',
  'value',
  'incidentType',
  'noteText',
  'deviceId',
] as const;
const RESULT_OVERRIDE_FIELDS = ['manualOverride', 'overrideReason'] as const;

type PayloadObject = Record<string, unknown>;

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
    squad: nullableString(payload, 'squad', issues),
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
  const squad = optionalQueryString(input, 'squad', issues);

  if (issues.length > 0) throwValidation(issues);

  return {
    includeArchived,
    ...(name === undefined ? {} : { name }),
    ...(squad === undefined ? {} : { squad }),
  };
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
  const merged = { ...state, ...patch };
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

export function parseTimelineEntryPatchPayload(input: unknown): TimelineEntryPatchPayload {
  const payload = payloadObject(input);
  const issues: ValidationIssue[] = [];
  rejectUnknownFields(payload, TIMELINE_PATCH_FIELDS, issues);
  if (Object.keys(payload).length === 0) {
    issues.push(issue('$', 'empty_payload', 'At least one field is required'));
  }

  const result: TimelineEntryPatchPayload = {};
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

  if (hasOwn(payload, 'deviceId')) {
    if (payload.deviceId === null) {
      result.deviceId = null;
    } else if (typeof payload.deviceId !== 'string') {
      issues.push(issue('deviceId', 'invalid_type', 'Expected a string or null'));
    } else {
      const normalized = payload.deviceId.trim();
      result.deviceId = normalized.length === 0 ? null : normalized;
    }
  }

  if (issues.length > 0) throwValidation(issues);
  return result;
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
