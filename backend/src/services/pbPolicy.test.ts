import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMPLETED_COMPETITION_FILTER,
  FINAL_INDIVIDUAL_PERFORMANCES,
  FINAL_PERFORMANCES,
  FINAL_RELAY_LEG_PERFORMANCES,
  NON_CANCELLED_EVENT_FILTER,
  performanceFlags,
} from './disciplineStatistics.js';
import { VERTICAL_PERFORMANCES } from './verticalStatistics.js';

const servicesDir = dirname(fileURLToPath(import.meta.url));
const readSource = (file: string): string => readFileSync(join(servicesDir, file), 'utf8');

/**
 * Statistics read every non-cancelled row; only a completed competition may mint a best mark.
 * Relations carry the difference as a boolean column rather than narrowing the row set.
 */
const SHARED_RELATIONS: Array<[name: string, relation: string]> = [
  ['FINAL_INDIVIDUAL_PERFORMANCES', FINAL_INDIVIDUAL_PERFORMANCES],
  ['FINAL_RELAY_LEG_PERFORMANCES', FINAL_RELAY_LEG_PERFORMANCES],
  ['FINAL_PERFORMANCES', FINAL_PERFORMANCES],
  ['VERTICAL_PERFORMANCES', VERTICAL_PERFORMANCES],
];

/** Every SQL surface that reports a personal or seasonal best. */
const SQL_BEST_MARK_SOURCES: Array<[file: string, probe: string, count: number]> = [
  ['disciplineStatistics.ts', 'FILTER (WHERE counts_for_best', 4],
  ['statistics.ts', 'AND e.counts_for_best', 2],
  ['verticalStatistics.ts', 'FILTER (WHERE counts_for_best', 2],
  ['publicStatistics.ts', 'FILTER (WHERE counts_for_best', 1],
  ['comparison.ts', "MIN(effective_result) FILTER (WHERE effective_outcome = 'valid' AND counts_for_best)", 1],
  ['comparison.ts', 'row.counts_for_best', 3],
  ['athleteAnalytics.ts', 'history.filter(countsAsBest)', 1],
  ['athleteAnalytics.ts', 'seasonResults.filter(countsAsBest)', 1],
  ['leaderboard.ts', '${COMPLETED_COMPETITION_FILTER}', 3],
  ['publicStatisticsReport.ts', '${COMPLETED_COMPETITION_FILTER}', 3],
];

/** Progression charts plot only points from a completed competition. */
const PROGRESSION_SOURCES: Array<[file: string, count: number]> = [
  ['progression.ts', 2],
  ['disciplineProgression.ts', 2],
  ['publicStatistics.ts', 2],
];

/** Surfaces that derive a best mark somewhere other than through the shared relations. */
const DERIVED_BEST_MARK_SOURCES: Array<[file: string, probe: string, count: number]> = [
  ['dashboard.ts', "event_type = 'competition' AND event_status = 'completed'", 5],
  ['sessionPerformances.ts', 'access.event.status === \'completed\'', 3],
  ['meets.ts', 'access.event.status !== \'completed\'', 1],
  ['timeline.ts', "row.event_status === 'completed' && row.event_type === 'competition'", 1],
];

/** Statistics still list a merely non-cancelled event; only the best mark is narrowed. */
const ROW_SET_SOURCES = [
  'disciplineStatistics.ts',
  'statistics.ts',
  'verticalStatistics.ts',
  'publicStatistics.ts',
  'comparison.ts',
  'athleteAnalytics.ts',
];

describe('the shared personal-best predicate', () => {
  it('is the one place that defines what may become a best mark', () => {
    expect(COMPLETED_COMPETITION_FILTER).toBe("e.status = 'completed' AND e.type = 'competition'");
    expect(NON_CANCELLED_EVENT_FILTER).toBe("e.status <> 'cancelled'");
  });

  it.each(SHARED_RELATIONS)('%s projects the predicate as a flag instead of narrowing the row set', (_name, relation) => {
    expect(relation).toContain(`${COMPLETED_COMPETITION_FILTER} AS counts_for_best`);
    expect(relation).toContain(NON_CANCELLED_EVENT_FILTER);
    const withoutFlag = relation.split(`${COMPLETED_COMPETITION_FILTER} AS counts_for_best`).join('');
    expect(withoutFlag).not.toContain("e.status = 'completed'");
  });
});

describe('surfaces that report a personal or season best', () => {
  it.each(SQL_BEST_MARK_SOURCES)('%s reads its best mark through %s', (file, probe, count) => {
    expect(readSource(file).split(probe).length - 1).toBe(count);
  });

  it.each(DERIVED_BEST_MARK_SOURCES)('%s applies the completed-competition rule to every best mark it derives', (file, probe, count) => {
    expect(readSource(file).split(probe).length - 1).toBe(count);
  });

  it.each(PROGRESSION_SOURCES)('%s plots its chart from the completed-competition set only', (file, count) => {
    expect(readSource(file).split('AND ${COMPLETED_COMPETITION_FILTER}').length - 1).toBe(count);
  });

  it.each(ROW_SET_SOURCES)('%s still counts a merely non-cancelled event in its row set', (file) => {
    const source = readSource(file);
    expect(source.includes('NON_CANCELLED_EVENT_FILTER') || source.includes(NON_CANCELLED_EVENT_FILTER)).toBe(true);
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
