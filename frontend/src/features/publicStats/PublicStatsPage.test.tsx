import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicStatsPage } from './PublicStatsPage';

const mockListPublicClubs = vi.fn();
const mockGetPublicClubStatistics = vi.fn();

vi.mock('../../api/publicStatistics', () => ({
  listPublicClubs: (...args: unknown[]) => mockListPublicClubs(...args),
  getPublicClubStatistics: (...args: unknown[]) => mockGetPublicClubStatistics(...args),
}));

const CLUB_ID = '33333333-3333-4333-8333-333333333333';
const clubDetail = {
  club: { id: CLUB_ID, name: 'Open Track Club' },
  roster: { active: 1, inactive: 0, archived: 0, total: 1 },
  distinctAthletesWithValidResults: 1,
  total100mResultCount: 3,
  valid100mResultCount: 3,
  fastestValidTime: 10.91,
  latestValidTime: 11.02,
  averageValidTime: 11.1,
  medianValidTime: 11.1,
  populationStandardDeviation: 0.13,
  athletes: [{ athlete: { id: '44444444-4444-4444-8444-444444444444', name: 'Ari Runner' }, pb: 10.91, latestEffectiveResult: 11.02, validResultCount: 3, totalResultCount: 3, average: 11.1, consistency: 0.13, improvement: 0.24 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListPublicClubs.mockResolvedValue({ data: [clubDetail.club], meta: { count: 1 } });
  mockGetPublicClubStatistics.mockResolvedValue(clubDetail);
});

describe('PublicStatsPage', () => {
  it('uses the themed listbox to load a published club and render its athlete card metrics', async () => {
    render(<PublicStatsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Select first club' }));
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Open Track Club' }));

    expect(await screen.findByRole('heading', { name: 'Open Track Club' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Ari Runner' })).toBeInTheDocument();
    expect(screen.getByLabelText('Ari Runner all-time 100m metrics')).toHaveTextContent('Improvement');
    expect(mockGetPublicClubStatistics).toHaveBeenCalledWith(CLUB_ID, expect.any(AbortSignal));
  });
});
