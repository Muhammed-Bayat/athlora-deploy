import { ApiError } from '../middleware/errors.js';
import { ENTRY_TYPES, EVENT_STATUSES, INCIDENT_TYPES } from '../types/domain.js';
import type { EntrantCreateInput, SessionCreateInput, SessionEntryInput, SessionEntryReplacement, SessionOverrideInput, SessionStateInput, SessionTarget } from '../types/meets.js';
import { isCanonicalUuid } from './primitives.js';
import { parseVerticalConfig } from './verticalMeets.js';

function invalid(path: string): never {
  throw new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed', {
    issues: [{ path, code: 'invalid_value', message: `Invalid ${path}` }],
  });
}

export function object(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('$');
  const body = value as Record<string, unknown>;
  for (const key of Object.keys(body)) if (!fields.includes(key)) invalid(key);
  return body;
}

function uuid(value: unknown, path: string): string {
  if (!isCanonicalUuid(value)) invalid(path);
  return value;
}

function text(value: unknown, path: string, max = 120): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) invalid(path);
  return value.trim();
}

export function parseVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) invalid('expectedVersion');
  return value;
}

export function parseSessionTarget(value: unknown): SessionTarget {
  const body = object(value, ['disciplineSessionId', 'entrantId']);
  return { disciplineSessionId: uuid(body.disciplineSessionId, 'disciplineSessionId'), entrantId: uuid(body.entrantId, 'entrantId') };
}

export function parseSessionCreate(value: unknown): SessionCreateInput {
  const body = object(value, ['disciplineDefinitionId', 'label', 'verticalConfig']);
  return { disciplineDefinitionId: uuid(body.disciplineDefinitionId, 'disciplineDefinitionId'), label: text(body.label, 'label'), ...(body.verticalConfig === undefined ? {} : { verticalConfig: parseVerticalConfig(body.verticalConfig) }) };
}

export function parseSessionState(value: unknown): SessionStateInput {
  const body = object(value, ['status', 'expectedVersion']);
  if (!EVENT_STATUSES.includes(body.status as SessionStateInput['status'])) invalid('status');
  return { status: body.status as SessionStateInput['status'], expectedVersion: parseVersion(body.expectedVersion) };
}

export function parseEntrantCreate(value: unknown): EntrantCreateInput {
  const body = object(value, ['kind', 'athleteId', 'name', 'memberIds']);
  if (body.kind === 'athlete') {
    object(body, ['kind', 'athleteId']);
    return { kind: 'athlete', athleteId: uuid(body.athleteId, 'athleteId') };
  }
  if (body.kind === 'guest') {
    object(body, ['kind', 'name']);
    return { kind: 'guest', name: text(body.name, 'name') };
  }
  if (body.kind !== 'relay') invalid('kind');
  object(body, ['kind', 'name', 'memberIds']);
  if (!Array.isArray(body.memberIds) || body.memberIds.length < 2 || body.memberIds.length > 20) invalid('memberIds');
  const memberIds = body.memberIds.map((id) => uuid(id, 'memberIds'));
  if (new Set(memberIds).size !== memberIds.length) invalid('memberIds');
  return { kind: 'relay', name: text(body.name, 'name'), memberIds };
}

const ENTRY_FIELDS = ['entryType', 'value', 'unit', 'isFoul', 'incidentType', 'noteText', 'deviceId', 'verticalState'] as const;
export function parseSessionEntry(value: unknown): SessionEntryInput {
  const body = object(value, ENTRY_FIELDS);
  if (body.verticalState != null && !['clearance', 'failure', 'pass', 'void'].includes(body.verticalState as string)) invalid('verticalState');
  if (!ENTRY_TYPES.includes(body.entryType as SessionEntryInput['entryType'])) invalid('entryType');
  const amount = body.value ?? null;
  if (amount !== null && (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0)) invalid('value');
  const unit = body.unit ?? null;
  if (unit !== null && !['seconds', 'metres', 'cm'].includes(unit as string)) invalid('unit');
  if ((amount === null) !== (unit === null)) invalid('unit');
  if (body.isFoul !== undefined && typeof body.isFoul !== 'boolean') invalid('isFoul');
  const incident = body.incidentType ?? null;
  if (incident !== null && !INCIDENT_TYPES.includes(incident as SessionEntryInput['incidentType'] & string)) invalid('incidentType');
  const isFoul = body.isFoul === true;
  if (body.entryType === 'attempt' && amount === null && !isFoul && incident === null) invalid('value');
  const note = body.noteText == null ? null : text(body.noteText, 'noteText', 2000);
  if (body.entryType === 'note' && !note) invalid('noteText');
  return {
    ...(body.verticalState == null ? {} : { verticalState: body.verticalState as SessionEntryInput['verticalState'] }),
    entryType: body.entryType as SessionEntryInput['entryType'], value: amount as number | null,
    unit: unit as SessionEntryInput['unit'], isFoul, incidentType: incident as SessionEntryInput['incidentType'],
    noteText: note, deviceId: body.deviceId == null ? null : text(body.deviceId, 'deviceId', 200),
  };
}

export function parseSessionEntryReplacement(value: unknown): SessionEntryReplacement {
  const body = object(value, [...ENTRY_FIELDS, 'expectedVersion']);
  const { expectedVersion, ...entry } = body;
  return { ...parseSessionEntry(entry), expectedVersion: parseVersion(expectedVersion) };
}

export function parseSessionOverride(value: unknown): SessionOverrideInput {
  const body = object(value, ['manualOverride', 'overrideReason', 'expectedVersion']);
  const amount = body.manualOverride;
  if (amount !== null && (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0)) invalid('manualOverride');
  if (amount === null && body.overrideReason != null) invalid('overrideReason');
  return { manualOverride: amount as number | null, overrideReason: amount === null ? null : text(body.overrideReason, 'overrideReason', 2000), expectedVersion: parseVersion(body.expectedVersion) };
}
