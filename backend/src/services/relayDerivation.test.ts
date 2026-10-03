import { describe, expect, it } from 'vitest';
import type { DisciplineDefinition, SessionEntry } from '../types/meets.js';
import { deriveRelayResult, relayLegResults, type RelayMemberRow } from './relayDerivation.js';

const relay = { defaultRules: { aggregation: 'timed', entrantType: 'relay', teamSize: 4 }, direction: 'lower', precision: 2 } as unknown as DisciplineDefinition;
const members: RelayMemberRow[] = ['r1', 'r2', 'r3', 'r4'].map((relayMemberId, index) => ({ relayMemberId, leg: index + 1, name: `Athlete ${index + 1}` }));
const split = (id: string, relayMemberId: string | null, value: number | null, rest: Partial<SessionEntry> = {}): SessionEntry => ({
  id, relayMemberId, value, entryType: 'attempt', isFoul: false, incidentType: null, deletedAt: null, unit: 'seconds', ...rest,
} as SessionEntry);
const selections = (...pairs: Array<[string, string]>) => new Map(pairs);

describe('relay leg derivation', () => {
  it('marks only the coach-selected split official for each athlete', () => {
    const entries = [split('e1', 'r1', 13.42), split('e2', 'r1', 13.9), split('e3', 'r2', 13.98), split('e4', 'r3', 14.11)];
    const legs = relayLegResults(members, entries, selections(['r1', 'e2'], ['r2', 'e3']), relay.precision);
    expect(legs.map((leg) => [leg.leg, leg.value, leg.outcome, leg.selectedEntryId])).toEqual([
      [1, 13.9, 'valid', 'e2'],
      [2, 13.98, 'valid', 'e3'],
      [3, null, 'no_result', null],
      [4, null, 'no_result', null],
    ]);
    expect(relayLegResults(members, entries, selections(['r1', 'e3']), relay.precision)[0]).toMatchObject({ value: null, outcome: 'no_result' });
  });
  it('ignores deleted, foul and non-attempt selections', () => {
    const entries = [
      split('gone', 'r1', 12.5, { deletedAt: '2026-09-01T00:00:00.000Z' }),
      split('foul', 'r2', 13.1, { isFoul: true }),
      split('incident', 'r3', 13.2, { incidentType: 'dq', value: null }),
      split('round', 'r4', 13.456),
    ];
    const legs = relayLegResults(members, entries, selections(['r1', 'gone'], ['r2', 'foul'], ['r3', 'incident'], ['r4', 'round']), 2);
    expect(legs.map((leg) => leg.value)).toEqual([null, null, null, 13.46]);
    expect(deriveRelayResult(relay, members, entries, selections(['r1', 'gone'], ['r2', 'foul'], ['r3', 'incident'], ['r4', 'round']))).toMatchObject({ value: null, outcome: 'no_result' });
  });
  it('sums the four official legs and rounds once to discipline precision', () => {
    const entries = members.map((member, index) => split(`e${index}`, member.relayMemberId, [13.42, 13.98, 14.11, 13.75][index]));
    const all = selections(...members.map((member, index) => [member.relayMemberId, `e${index}`] as [string, string]));
    expect(deriveRelayResult(relay, members, entries, all)).toMatchObject({ value: 55.26, outcome: 'valid' });
    expect(deriveRelayResult(relay, members, entries, selections(['r1', 'e0']))).toMatchObject({ value: null, outcome: 'no_result' });
  });
  it('lets a team-level incident void the team while ignoring legacy team-wide numbers', () => {
    const entries = [split('e1', 'r1', 13), split('legacy', null, 62.1)];
    expect(deriveRelayResult(relay, members, entries, new Map())).toMatchObject({ value: null, outcome: 'no_result' });
    expect(deriveRelayResult(relay, members, [...entries, split('dq', null, null, { incidentType: 'dq' })], new Map())).toMatchObject({ value: null, outcome: 'dq' });
    const all = selections(...members.map((member, index) => [member.relayMemberId, `e${index + 1}`] as [string, string]));
    expect(deriveRelayResult(relay, members, [split('e1', 'r1', 13), split('e2', 'r2', 13.5), split('e3', 'r3', 14), split('e4', 'r4', 14.5), split('legacy', null, 62.1)], all)).toMatchObject({ value: 55, outcome: 'valid' });
  });
});
