import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProgressionDetail } from '../../types';
import { ProgressionChart } from './ProgressionChart';

const statisticsApi = vi.hoisted(() => ({ getAthleteProgression: vi.fn() }));

vi.mock('../../api/statistics', () => statisticsApi);

const ATHLETE_ID = '11111111-1111-4111-8111-111111111111';

const progression: ProgressionDetail = {
  athlete: { id: ATHLETE_ID, name: 'Ari Runner', archivedAt: null },
  entries: [
    {
      event: {
        id: '22222222-2222-4222-8222-222222222222',
        title: 'City Sprint',
        type: 'competition',
        discipline: '100m',
        date: '2026-08-17',
        time: '10:00:00',
        locationName: 'Central Track',
        status: 'completed',
      },
      result: {
        eventId: '22222222-2222-4222-8222-222222222222',
        athleteId: ATHLETE_ID,
        discipline: '100m',
        outcome: 'valid',
        finalResult: 11.05,
        unit: 'seconds',
        placing: 1,
        isPb: true,
        isSb: true,
        manualOverride: null,
        overrideReason: null,
        overriddenBy: null,
        overrideAt: null,
        updatedAt: '2026-08-17T10:00:00.000Z',
      },
      effectiveResult: 11.05,
      effectiveOutcome: 'valid',
      countsTowardsStatistics: true,
      runningPb: null,
      isNewPb: true,
    },
  ],
  pagination: { nextCursor: null, count: 1, total: 1 },
  summary: { allTimePb: 11.05, totalResults: 1, totalValid: 1 },
};

describe('ProgressionChart', () => {
  it('renders a non-empty progression response and formatted personal best', async () => {
    statisticsApi.getAthleteProgression.mockResolvedValue(progression);

    render(<ProgressionChart athleteId={ATHLETE_ID} athleteName="Ari Runner" />);

    expect(await screen.findByRole('heading', { name: 'All-time 100m progression' })).toBeInTheDocument();
    expect(screen.getByText('All-time PB: 11.05s · 1 of 1 valid')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Ari Runner 100m progression chart' })).toBeInTheDocument();
  });

  it('shows the result value when a point receives keyboard focus', async () => {
    statisticsApi.getAthleteProgression.mockResolvedValue(progression);

    render(<ProgressionChart athleteId={ATHLETE_ID} athleteName="Ari Runner" />);

    const point = await screen.findByRole('img', { name: '17 Aug 2026: 11.05s, personal best' });
    fireEvent.focus(point);

    expect(screen.getByRole('tooltip')).toHaveTextContent('17 Aug 2026');
    expect(screen.getByRole('tooltip')).toHaveTextContent('11.05s');
  });

  it('never plots a DQ, DNS or DNF row on the chart', async () => {
    const disqualification: ProgressionDetail['entries'][number] = {
      ...progression.entries[0],
      event: { ...progression.entries[0].event, id: '33333333-3333-4333-8333-333333333333', title: 'City Sprint DQ', date: '2026-08-18' },
      result: {
        ...progression.entries[0].result,
        eventId: '33333333-3333-4333-8333-333333333333',
        outcome: 'dq',
        finalResult: null,
        unit: null,
        isPb: false,
        isSb: false,
      },
      effectiveResult: null,
      effectiveOutcome: 'dq',
      countsTowardsStatistics: false,
      runningPb: 11.05,
      isNewPb: false,
    };
    statisticsApi.getAthleteProgression.mockResolvedValue({
      ...progression,
      entries: [progression.entries[0], disqualification],
      pagination: { nextCursor: null, count: 2, total: 2 },
      summary: { allTimePb: 11.05, totalResults: 2, totalValid: 1 },
    });

    render(<ProgressionChart athleteId={ATHLETE_ID} athleteName="Ari Runner" />);

    expect(await screen.findByRole('heading', { name: 'All-time 100m progression' })).toBeInTheDocument();
    expect(screen.getByText('All-time PB: 11.05s · 1 of 2 valid')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '17 Aug 2026: 11.05s, personal best' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /18 Aug 2026/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /dq/i })).not.toBeInTheDocument();
  });

  it('uses the shared personal-best chart token', async () => {
    statisticsApi.getAthleteProgression.mockResolvedValue(progression);

    render(<ProgressionChart athleteId={ATHLETE_ID} athleteName="Ari Runner" />);

    const point = await screen.findByRole('img', { name: '17 Aug 2026: 11.05s, personal best' });
    expect(point).toHaveAttribute('fill', 'var(--chart-pb)');
    expect(point).toHaveAttribute('stroke', 'var(--chart-pb-outline)');
  });
});
