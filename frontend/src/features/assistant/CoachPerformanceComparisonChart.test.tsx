import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CoachPerformanceAnalysis } from '../../api/analytics';
import { CoachPerformanceComparisonChart } from './CoachPerformanceComparisonChart';

const discipline = { code: '100m', label: '100m', unit: 'seconds' as const, precision: 2, direction: 'lower' as const };

function point(date: string, value: number, athlete: string) {
  return { date, time: null, value, event: { id: `${athlete}-${date}`, title: 'Club meet', type: 'competition' as const } };
}

const analysis: CoachPerformanceAnalysis = {
  selectedRange: { dateFrom: '2026-07-01', dateTo: '2026-09-30' },
  lifecycleStatus: 'active',
  athletes: [
    {
      athlete: { id: 'athlete-a', name: 'Ari Runner', status: 'active' },
      disciplines: [{
        discipline, recordCount: 2, first: point('2026-07-01', 12.4, 'a'), latest: point('2026-09-01', 12.1, 'a'),
        best: { personalBest: 12.1, seasonBest: 12.1, selectedRangeBest: 12.1, season: { selected: 2026, startDate: '2026-01-01', endDate: '2027-01-01' } },
        improvement: 0.3, improvementPercent: 2.42, recentTrend: null, consistency: null, plateau: null, sufficientData: true, insufficientDataReason: null,
        history: [point('2026-07-01', 12.4, 'a'), point('2026-09-01', 12.1, 'a')],
      }],
    },
    {
      athlete: { id: 'athlete-b', name: 'Bea Sprinter', status: 'active' },
      disciplines: [{
        discipline, recordCount: 2, first: point('2026-07-01', 13, 'b'), latest: point('2026-09-01', 12.5, 'b'),
        best: { personalBest: 12.5, seasonBest: 12.5, selectedRangeBest: 12.5, season: { selected: 2026, startDate: '2026-01-01', endDate: '2027-01-01' } },
        improvement: 0.5, improvementPercent: 3.85, recentTrend: null, consistency: null, plateau: null, sufficientData: true, insufficientDataReason: null,
        history: [point('2026-07-01', 13, 'b'), point('2026-09-01', 12.5, 'b')],
      }],
    },
  ],
  comparison: {
    methodology: 'Eligible athlete-discipline changes are ranked by direction-aware percentage change from the first to latest valid result in the selected range; times improve when lower, while distances and heights improve when higher. Raw values from different disciplines are not compared directly.',
    eligibleAthleteDisciplineCount: 2,
    mostImproved: null,
    mostDeclined: null,
    insufficientDataReason: null,
    relativeImprovementRanking: {
      methodology: 'Athletes are ranked descriptively by their strongest eligible direction-aware first-to-latest percentage change in the selected range. Timed events improve when lower, while distances and heights improve when higher. Each athlete appears once with the discipline that produced that relative change; this is not an official athletics ranking or a comparison of raw performances across disciplines.',
      eligibility: 'At least two distinct valid normalized results with a positive first result are required for an athlete-discipline comparison.',
      limit: 50,
      eligibleAthleteCount: 2,
      entries: [],
      insufficientDataReason: null,
    },
  },
};

describe('CoachPerformanceComparisonChart', () => {
  it('renders one distinguishable progression series and legend item per athlete', () => {
    render(<CoachPerformanceComparisonChart analysis={analysis} disciplineCode="100m" />);

    expect(screen.getByRole('img', { name: '100m performance comparison chart' })).toBeInTheDocument();
    expect(screen.getByText(/Lower values are better/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Performance comparison legend' })).toHaveTextContent('Ari Runner');
    expect(screen.getByRole('list', { name: 'Performance comparison legend' })).toHaveTextContent('Bea Sprinter');
    expect(document.querySelectorAll('polyline')).toHaveLength(2);
  });
});
