import { describe, expect, it } from 'vitest';
import { parseEntrantCreate, parseSessionCreate, parseSessionEntry, parseSessionEntryReplacement, parseSessionOverride, parseSessionTarget } from './meets.js';
import { parseSessionSyncActions } from '../services/sessionSync.js';

const id = '11111111-1111-4111-8111-111111111111';
describe('multi-discipline contracts', () => {
  it('rejects incomplete targets and tenant/audit fields instead of inferring identity', () => {
    expect(parseSessionTarget({ disciplineSessionId: id, entrantId: id })).toEqual({ disciplineSessionId: id, entrantId: id });
    for (const target of [{ disciplineSessionId: id }, { entrantId: id }, { disciplineSessionId: id, entrantId: id, athleteId: id }]) expect(() => parseSessionTarget(target)).toThrow();
    expect(() => parseSessionCreate({ disciplineDefinitionId: id, label: 'Heat', workspaceId: id })).toThrow();
  });
  it('validates discriminated entrant fields and unique relay members', () => {
    expect(parseEntrantCreate({ kind: 'guest', name: ' Guest ' })).toEqual({ kind: 'guest', name: 'Guest' });
    expect(() => parseEntrantCreate({ kind: 'guest', name: 'Guest', athleteId: id })).toThrow();
    expect(() => parseEntrantCreate({ kind: 'relay', name: 'Team', memberIds: [id, id] })).toThrow();
    expect(() => parseEntrantCreate({ kind: 'athlete', athleteId: id, name: 'Spoofed' })).toThrow();
  });
  it('permits measured/foul entries and rejects invalid numeric, unit, version and override shapes', () => {
    expect(parseSessionEntry({ entryType: 'attempt', isFoul: true })).toMatchObject({ value: null, unit: null, isFoul: true });
    expect(parseSessionEntry({ entryType: 'attempt', value: 6.2, unit: 'metres' })).toMatchObject({ value: 6.2, unit: 'metres' });
    for (const value of [-1, 0, Infinity, NaN]) expect(() => parseSessionEntry({ entryType: 'attempt', value, unit: 'seconds' })).toThrow();
    expect(() => parseSessionEntryReplacement({ entryType: 'attempt', isFoul: true, expectedVersion: 0 })).toThrow();
    expect(() => parseSessionOverride({ manualOverride: 12, expectedVersion: 1 })).toThrow();
    expect(() => parseSessionOverride({ manualOverride: null, overrideReason: 'stale', expectedVersion: 1 })).toThrow();
  });
  it('rejects mixed legacy/session batches and malformed identifiers before writes', () => {
    const action = { actionId: id, actionType: 'create_entry', payload: {}, clientTimestamp: '2026-09-01T00:00:00Z' };
    expect(() => parseSessionSyncActions([action])).toThrow();
    expect(() => parseSessionSyncActions([{ ...action, target: { disciplineSessionId: id, entrantId: id } }, action])).toThrow();
    expect(() => parseSessionSyncActions([{ ...action, target: { disciplineSessionId: id, entrantId: 'bad' } }])).toThrow();
  });
});
