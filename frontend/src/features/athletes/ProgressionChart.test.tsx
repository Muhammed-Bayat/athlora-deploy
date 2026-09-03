import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProgressionDetail } from '../../types';
import { ProgressionChart } from './ProgressionChart';

const statisticsApi = vi.hoisted(() => ({ getAthleteProgression: vi.fn() }));

vi.mock('../../api/statistics', () => statisticsApi);

const ATHLETE_ID = '11111111-1111-4111-8111-111111111111';

const progression: ProgressionDetail = {
  athlete: { id: ATHLETE_ID, name: 'Ari Runner', squadNames: [], archivedAt: null },
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
});
