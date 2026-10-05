import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMPLETED_COMPETITION_FILTER,
  FINAL_INDIVIDUAL_PERFORMANCES,
  FINAL_PERFORMANCES,
  FINAL_RELAY_LEG_PERFORMANCES,
  performanceFlags,
} from './disciplineStatistics.js';
import { VERTICAL_PERFORMANCES } from './verticalStatistics.js';

const servicesDir = dirname(fileURLToPath(import.meta.url));
const readSource = (file: string): string => readFileSync(join(servicesDir, file), 'utf8');

const CANCELLED_PREDICATE = "e.status <> 'cancelled'";

const SHARED_RELATIONS: Array<[name: string, relation: string]> = [
  ['FINAL_INDIVIDUAL_PERFORMANCES', FINAL_INDIVIDUAL_PERFORMANCES],
  ['FINAL_RELAY_LEG_PERFORMANCES', FINAL_RELAY_LEG_PERFORMANCES],
  ['FINAL_PERFORMANCES', FINAL_PERFORMANCES],
  ['VERTICAL_PERFORMANCES', VERTICAL_PERFORMANCES],
];

/** Every service whose personal-best numbers are produced by SQL rather than by a flag on a row. */
const SQL_BEST_MARK_SOURCES = [
  'disciplineStatistics.ts',
  'comparison.ts',
  'leaderboard.ts',
  'publicStatisticsReport.ts',
  'athleteAnalytics.ts',
  'statistics.ts',
  'verticalStatistics.ts',
];

/** Surfaces that derive a best mark somewhere other than through the shared relations. */
const DERIVED_BEST_MARK_SOURCES: Array<[file: string, probe: string, count: number]> = [
  ['dashboard.ts', "event_type = 'competition' AND event_status = 'completed'", 5],
  ['sessionPerformances.ts', "access.event.status === 'completed'", 3],
  ['meets.ts', "access.event.status !== 'completed'", 1],
  ['timeline.ts', "row.event_status === 'completed' && row.event_type === 'competition'", 1],
];

describe('the shared personal-best predicate', () => {
  it('is the one place that defines what may become a best mark', () => {
    expect(COMPLETED_COMPETITION_FILTER).toBe("e.status = 'completed' AND e.type = 'competition'");
  });

  it.each(SHARED_RELATIONS)('gates %s with the shared predicate and never with the cancelled-only predicate', (_name, relation) => {
    expect(relation).toContain(COMPLETED_COMPETITION_FILTER);
    expect(relation).not.toContain(CANCELLED_PREDICATE);
  });
});

describe('surfaces that report a personal or season best', () => {
  it.each(SQL_BEST_MARK_SOURCES)('%s never accepts a merely non-cancelled event as a best mark', (file) => {
    const source = readSource(file);
    expect(source).not.toContain(CANCELLED_PREDICATE);
  });

  it.each(DERIVED_BEST_MARK_SOURCES)('%s applies the completed-competition rule to every best mark it derives', (file, probe, count) => {
    expect(readSource(file).split(probe).length - 1).toBe(count);
  });

  it('gates the public athlete statistics PB/SB aggregate with the shared predicate', () => {
    const athleteStatistics = readSource('publicStatistics.ts').split('export async function listPublicClubs')[0];
    expect(athleteStatistics).not.toContain(CANCELLED_PREDICATE);
    expect(athleteStatistics.split('${COMPLETED_COMPETITION_FILTER}').length - 1).toBe(2);
  });
});

describe('direction-aware best marks', () => {
  const year = '2026';

  it('treats a faster time as a personal best for lower-is-better disciplines', () => {
    const prior = [{ value: 11.02, date: '2026-03-01' }];
    expect(performanceFlags(10.95, prior, 'lower', year)).toEqual({ isPb: true, isSb: true });
    expect(performanceFlags(11.10, prior, 'lower', year)).toEqual({ isPb: false, isSb: false });
  });

  it('treats a higher clearance as a personal best for higher-is-better disciplines', () => {
    const prior = [{ value: 1.80, date: '2026-03-01' }];
    expect(performanceFlags(1.85, prior, 'higher', year)).toEqual({ isPb: true, isSb: true });
    expect(performanceFlags(1.75, prior, 'higher', year)).toEqual({ isPb: false, isSb: false });
  });

  it('never lets a lower clearance become a best mark for higher-is-better disciplines', () => {
    const prior = [{ value: 1.80, date: '2025-05-01' }];
    expect(performanceFlags(1.80, prior, 'higher', year)).toEqual({ isPb: false, isSb: true });
    expect(performanceFlags(1.70, prior, 'higher', year)).toEqual({ isPb: false, isSb: true });
  });
});
