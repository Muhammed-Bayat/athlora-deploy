import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { compareVertical, deriveVertical, verticalPlacings } from './verticalScoring.js';
import { verticalRecords } from './verticalStatistics.js';
import { parseVerticalConfig, validateVerticalDefinition } from '../validation/verticalMeets.js';
import type { DisciplineDefinition, SessionEntryInput, VerticalConfig } from '../types/meets.js';

const config: VerticalConfig = { startingHeight: 1.5, heightIncrement: 0.05, failureLimit: 3, round: 'final' };
const attempt = (value: number, verticalState: SessionEntryInput['verticalState'] = 'clearance'): SessionEntryInput => ({ entryType: 'attempt', value, verticalState, unit: 'metres', isFoul: false, incidentType: null, noteText: null, deviceId: null });
const score = (entries: SessionEntryInput[], rules = config) => deriveVertical(entries, rules);
describe('high jump vertical rules', () => {
  const code = 'high_jump';
  const definition: DisciplineDefinition = { id: 'test', code, version: 1, kind: 'vertical', unit: 'metres', direction: 'higher', defaultRules: { aggregation: 'vertical', entrantType: 'individual', failureLimit: 3, heightIncrement: 0.02, round: 'final' }, precision: 2, presentation: { label: code, unitLabel: 'm' }, createdAt: '', source: 'test' };
  it('validates the definition and seeds its senior defaults', () => {
    expect(() => validateVerticalDefinition(definition)).not.toThrow();
    const sql = readFileSync(new URL('../db/migrations/0031_vertical_events_catalogue.sql', import.meta.url), 'utf8');
    expect(sql).toContain(`'${code}',1,'vertical','metres','higher'`);
    expect(sql).toContain(`"heightIncrement":${definition.defaultRules.heightIncrement}`);
  });
  it('derives first clearance and highest of multiple clearances', () => {
    expect(score([attempt(1.5)]).value).toBe(1.5);
    expect(score([attempt(1.5, 'failure'), attempt(1.5), attempt(1.6)])).toMatchObject({ value: 1.6, outcome: 'valid', consecutiveFailures: 0 });
  });
  it('passes close a height, preserve failures and allow skipped heights', () => {
    expect(score([attempt(1.5, 'failure'), attempt(1.5, 'pass'), attempt(1.6, 'failure')])).toMatchObject({ value: null, consecutiveFailures: 1 });
    expect(score([attempt(1.5, 'pass'), attempt(1.65)])).toMatchObject({ value: 1.65, totalFailures: 0 });
    expect(() => score([attempt(1.5, 'pass'), attempt(1.5)])).toThrow();
  });
  it('eliminates on consecutive failures across heights and rejects later attempts', () => {
    const failures = [attempt(1.5, 'failure'), attempt(1.55, 'failure'), attempt(1.6, 'failure')];
    expect(score(failures)).toMatchObject({ value: null, outcome: 'no_result', eliminated: true });
    expect(() => score([...failures, attempt(1.65)])).toThrow();
    expect(score([attempt(1.5, 'failure'), attempt(1.5, 'failure')], { ...config, failureLimit: 2 }).eliminated).toBe(true);
    expect(score([attempt(1.5, 'failure'), attempt(1.5), attempt(1.55, 'failure'), attempt(1.55, 'failure')]).eliminated).toBe(false);
  });
  it('treats a skipped height as breaking the consecutive-failure streak', () => {
    const skipped = [attempt(1.5, 'failure'), attempt(1.5, 'failure'), attempt(1.5, 'pass'), attempt(1.55, 'failure'), attempt(1.55, 'failure')];
    expect(score(skipped)).toMatchObject({ eliminated: false, consecutiveFailures: 2, totalFailures: 4 });
    expect(() => score([...skipped, attempt(1.6)])).not.toThrow();
    expect(score([...skipped, attempt(1.55, 'failure')])).toMatchObject({ eliminated: true, consecutiveFailures: 3 });
    expect(score([attempt(1.5, 'pass')]).consecutiveFailures).toBe(0);
  });
  it('void and deleted attempts are not clearances or failures', () => {
    expect(score([attempt(1.5, 'void')])).toMatchObject({ outcome: 'no_result', consecutiveFailures: 0 });
    expect(deriveVertical([{ ...attempt(1.5), deletedAt: '2026-01-01' }], config).value).toBeNull();
    expect(() => score([attempt(1.5, 'failure'), attempt(1.5, 'void'), attempt(1.5, 'failure'), attempt(1.5, 'failure'), attempt(1.55)])).toThrow();
  });
  it('counts failures at best height then total failures across the competition', () => {
    const first = score([attempt(1.5), attempt(1.55), attempt(1.6, 'failure')]);
    const second = score([attempt(1.5), attempt(1.55, 'failure'), attempt(1.55)]);
    const third = score([attempt(1.5, 'failure'), attempt(1.5), attempt(1.55)]);
    expect(first).toMatchObject({ value: 1.55, failuresAtBest: 0, totalFailures: 1 });
    expect(second).toMatchObject({ value: 1.55, failuresAtBest: 1, totalFailures: 1 });
    expect(third).toMatchObject({ value: 1.55, failuresAtBest: 0, totalFailures: 1 });
    expect(compareVertical(first, second)).toBeLessThan(0);
    expect(compareVertical(first, third)).toBe(0);
    expect(compareVertical(first, score([attempt(1.5), attempt(1.55)]))).toBeGreaterThan(0);
    expect(score([attempt(1.5)])).toMatchObject({ value: 1.5, failuresAtBest: 0, totalFailures: 0 });
  });
  it('counts failures after the final clearance towards the countback total', () => {
    expect(score([attempt(1.5), attempt(1.6, 'failure'), attempt(1.6, 'failure'), attempt(1.6, 'failure')]))
      .toMatchObject({ value: 1.5, failuresAtBest: 0, totalFailures: 3, eliminated: true });
    expect(score([attempt(1.5, 'failure'), attempt(1.5), attempt(1.6, 'failure'), attempt(1.6, 'failure'), attempt(1.6, 'failure')]))
      .toMatchObject({ value: 1.5, failuresAtBest: 1, totalFailures: 4, eliminated: true });
    expect(score([attempt(1.5, 'failure'), attempt(1.5, 'pass'), attempt(1.6)]))
      .toMatchObject({ value: 1.6, failuresAtBest: 0, totalFailures: 1 });
    expect(score([attempt(1.6, 'failure'), attempt(1.6, 'failure'), attempt(1.6, 'failure')]))
      .toMatchObject({ value: null, failuresAtBest: 0, totalFailures: 3, eliminated: true });
  });
  it('rejects incompatible definitions', () => {
    for (const change of [{ unit: 'seconds' }, { precision: 3 }, { direction: 'lower' }]) expect(() => validateVerticalDefinition({ ...definition, ...change } as DisciplineDefinition)).toThrow();
  });
});
it('rejects invalid progression, heights, limits and rounds', () => {
  for (const change of [{ startingHeight: 0 }, { startingHeight: -1 }, { startingHeight: Infinity }, { startingHeight: 1.501 }, { heightIncrement: 0 }, { heightIncrement: -0.05 }, { failureLimit: 0 }, { failureLimit: 1.5 }, { round: 'round-six' }]) expect(() => parseVerticalConfig({ ...config, ...change })).toThrow();
  expect(() => score([attempt(1.51)])).toThrow();
  expect(() => score([attempt(1.55), attempt(1.5)])).toThrow();
});
it('preserves genuine ties with competition placing regardless of entrant identity or input order', () => {
  const rows = [{ entrantId: 'z', score: score([attempt(1.5)]) }, { entrantId: 'a', score: score([attempt(1.5)]) }, { entrantId: 'b', score: score([attempt(1.5, 'failure'), attempt(1.5)]) }, { entrantId: 'n', score: score([attempt(1.5, 'pass')]) }];
  for (const input of [rows, [...rows].reverse()]) {
    expect(Object.fromEntries(verticalPlacings(input))).toEqual({ z: 1, a: 1, b: 3, n: null });
  }
});
it('PB and SB only improve with a finalized higher clearance', () => {
  const history = [{ value: 1.8, date: '2025-01-01' }, { value: 1.7, date: '2026-01-01' }];
  expect(verticalRecords(1.85, true, '2026-09-01', history)).toEqual({ isPb: true, isSb: true });
  expect(verticalRecords(1.75, true, '2026-09-01', history)).toEqual({ isPb: false, isSb: true });
  expect(verticalRecords(1.65, true, '2026-09-01', history)).toEqual({ isPb: false, isSb: false });
  expect(verticalRecords(1.85, false, '2026-09-01', history)).toEqual({ isPb: false, isSb: false });
  for (const state of ['failure', 'pass', 'void'] as const) expect(verticalRecords(score([attempt(1.5, state)]).value, true, '2026-09-01', history)).toEqual({ isPb: false, isSb: false });
});
