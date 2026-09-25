import { describe, expect, it } from 'vitest';
import type { DisciplineDefinition, SessionEntry } from '../types/meets.js';
import { authoritativeResult, sessionPlaces, type PlaceCandidate } from './sessionResultPolicy.js';

const timed = { defaultRules: { aggregation: 'timed', entrantType: 'individual' }, direction: 'lower', precision: 2 } as DisciplineDefinition;
const measured = { ...timed, defaultRules: { aggregation: 'best', entrantType: 'individual' }, direction: 'higher' } as DisciplineDefinition;
const vertical = { ...measured, defaultRules: { aggregation: 'vertical', entrantType: 'individual' } } as DisciplineDefinition;
const config = { startingHeight: 1.5, heightIncrement: 0.05, failureLimit: 3, round: 'final' as const };
const entry = (id: string, value: number | null, rest: Partial<SessionEntry> = {}): SessionEntry => ({ id, value, entryType: 'attempt', isFoul: false, incidentType: null, deletedAt: null, unit: 'metres', ...rest } as SessionEntry);
const candidate = (id: string, definition: DisciplineDefinition, entries: SessionEntry[], selected = entries[0]?.id): PlaceCandidate => ({ entrantId: id, entries, eligible: true, score: authoritativeResult(definition, entries, selected ?? null, config) });

describe('authoritative session result policy', () => {
  it('requires an explicit timed source, preserves inputs, rounds precision and ranks ascending with genuine ties', () => {
    const entries = [entry('a', 12.5), entry('b', 11)];
    expect(authoritativeResult(timed, entries, null).value).toBeNull();
    expect(authoritativeResult(timed, entries, 'a').value).toBe(12.5);
    expect(entries.map(e => e.value)).toEqual([12.5, 11]);
    expect([...sessionPlaces(timed, [candidate('first', timed, [entry('1', 10.901)]), candidate('tied', timed, [entry('2', 10.9)]), candidate('third', timed, entries, 'a')]).values()]).toEqual([1, 1, 3]);
  });
  it('derives measured best legal automatically and breaks equal marks by subsequent legal attempts', () => {
    const a = [entry('a', 6), entry('b', 5.5), entry('foul', 9, { isFoul: true })];
    const b = [entry('c', 6), entry('d', 5.4)];
    expect(authoritativeResult(measured, a, 'b').value).toBe(6);
    expect([...sessionPlaces(measured, [candidate('second', measured, b), candidate('first', measured, a), candidate('tied', measured, a)]).values()]).toEqual([3, 1, 1]);
  });
  it('uses existing vertical countback and retains unresolved ties', () => {
    const clear = entry('c', 1.5, { verticalState: 'clearance', attemptOrder: 2 });
    const failed = entry('f', 1.5, { verticalState: 'failure', attemptOrder: 1 });
    expect([...sessionPlaces(vertical, [candidate('third', vertical, [failed, clear]), candidate('first', vertical, [clear]), candidate('tie', vertical, [clear])]).values()]).toEqual([3, 1, 1]);
    expect(authoritativeResult(vertical, [clear, entry('dnf', null, { entryType: 'note', incidentType: 'dnf' })], null, config)).toMatchObject({ outcome: 'dnf', value: null });
  });
  it.each(['dns', 'dnf', 'dq'] as const)('excludes %s even with a selected time', incidentType => {
    const c = candidate('invalid', timed, [entry('time', 10), entry('incident', null, { entryType: 'note', incidentType })]);
    expect(c.score).toMatchObject({ outcome: incidentType, value: null });
    expect(sessionPlaces(timed, [c]).get('invalid')).toBeNull();
  });
  it('excludes withdrawn, no mark, no height, deleted and foul sources', () => {
    for (const d of [timed, measured, vertical]) {
      expect(sessionPlaces(d, [candidate('empty', d, [])]).get('empty')).toBeNull();
    }
    expect(authoritativeResult(timed, [entry('x', 10, { deletedAt: 'now' })], 'x').value).toBeNull();
    expect(authoritativeResult(measured, [entry('x', 6, { isFoul: true })], null).value).toBeNull();
    const c = { ...candidate('withdrawn', timed, [entry('x', 10)]), eligible: false };
    expect(sessionPlaces(timed, [c]).get('withdrawn')).toBeNull();
  });
});
