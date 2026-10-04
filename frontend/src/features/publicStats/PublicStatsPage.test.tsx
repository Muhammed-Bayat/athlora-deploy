import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicStatsPage } from './PublicStatsPage';
import { resolveApiUrl } from '../../api/client';

const mockListPublicClubs = vi.fn();
const mockListPublicSeasons = vi.fn();
const mockGetPublicClubStatistics = vi.fn();
const mockGetPublicAthleteComparison = vi.fn();
const mockGetPublicClubSessionResults = vi.fn();

vi.mock('../../api/publicStatistics', () => ({
  listPublicClubs: (...args: unknown[]) => mockListPublicClubs(...args),
  listPublicSeasons: (...args: unknown[]) => mockListPublicSeasons(...args),
  getPublicClubStatistics: (...args: unknown[]) => mockGetPublicClubStatistics(...args),
  getPublicAthleteComparison: (...args: unknown[]) => mockGetPublicAthleteComparison(...args),
  getPublicClubSessionResults: (...args: unknown[]) => mockGetPublicClubSessionResults(...args),
}));

const CLUB_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_CLUB_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_ATHLETE_ID = '66666666-6666-4666-8666-666666666666';
const clubDetail = {
  club: { id: CLUB_ID, name: 'Open Track Club', branding: { description: 'Sprint-focused club.', primaryColor: null, logoUrl: null, coverUrl: '/api/v1/media/clubs/club/cover.png' } },
  roster: { active: 1, inactive: 0, archived: 0, total: 1 },
  distinctAthletesWithValidResults: 1,
  total100mResultCount: 3,
  valid100mResultCount: 3,
  fastestValidTime: 10.91,
  latestValidTime: 11.02,
  averageValidTime: 11.1,
  medianValidTime: 11.1,
  populationStandardDeviation: 0.13,
  availableDisciplines: [{ discipline: '100m', label: '100m', unit: 'seconds', precision: 2, direction: 'lower' }, { discipline: 'long_jump', label: 'Long jump', unit: 'metres', precision: 2, direction: 'higher' }],
  athletes: [{ athlete: { id: '44444444-4444-4444-8444-444444444444', name: 'Ari Runner' }, pb: 10.91, latestEffectiveResult: 11.02, validResultCount: 3, totalResultCount: 3, average: 11.1, consistency: 0.13, improvement: 0.24, disciplines: [{ discipline: '100m', label: '100m', unit: 'seconds', precision: 2, direction: 'lower', pb: 10.91, latestEffectiveResult: 11.02, validResultCount: 3, average: 11.1, consistency: 0.13, improvement: 0.24, progression: [{ date: '2026-01-10', result: 11.2 }, { date: '2026-02-10', result: 10.91 }] }, { discipline: 'long_jump', label: 'Long jump', unit: 'metres', precision: 2, direction: 'higher', pb: 6.4, latestEffectiveResult: 6.4, validResultCount: 2, average: 6.2, consistency: 0.2, improvement: 0.3, progression: [{ date: '2026-01-10', result: 6.1 }, { date: '2026-02-10', result: 6.4 }] }] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListPublicClubs.mockResolvedValue({ data: [clubDetail.club], meta: { count: 1 } });
  mockListPublicSeasons.mockResolvedValue([new Date().getUTCFullYear()]);
  mockGetPublicClubStatistics.mockResolvedValue(clubDetail);
  mockGetPublicAthleteComparison.mockResolvedValue({ athletes: [] });
  mockGetPublicClubSessionResults.mockResolvedValue([]);
});

describe('PublicStatsPage', () => {
  it('uses the themed listbox to load a published club and render its athlete card metrics', async () => {
    render(<PublicStatsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Select first club' }));
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Open Track Club' }));

    expect(await screen.findByRole('heading', { name: 'Open Track Club' })).toBeInTheDocument();
    expect(screen.getByTestId('club-cover-image')).toHaveAttribute('src', resolveApiUrl(clubDetail.club.branding.coverUrl));
    expect(await screen.findByRole('heading', { name: 'Ari Runner' })).toBeInTheDocument();
    expect(screen.getByLabelText(`Ari Runner ${new Date().getUTCFullYear()} discipline metrics`)).toHaveTextContent('100m');
    const longJump = screen.getByRole('tab', { name: 'Long jump' });
    await userEvent.click(longJump);
    expect(longJump).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText(`Ari Runner ${new Date().getUTCFullYear()} discipline metrics`)).toHaveTextContent('6.40 m');
    expect(screen.queryByText('View public schedule →')).not.toBeInTheDocument();
    expect(mockGetPublicClubStatistics).toHaveBeenCalledWith(CLUB_ID, expect.any(AbortSignal));
  });

  it('compares selected athletes from different published clubs by discipline', async () => {
    const otherClubDetail = {
      ...clubDetail,
      club: { id: OTHER_CLUB_ID, name: 'Harbour Athletics' },
      athletes: [{ ...clubDetail.athletes[0], athlete: { id: OTHER_ATHLETE_ID, name: 'Bea Dash' } }],
    };
    mockListPublicClubs.mockResolvedValue({ data: [clubDetail.club, otherClubDetail.club], meta: { count: 2 } });
    mockGetPublicClubStatistics.mockImplementation((clubId: string) => Promise.resolve(clubId === CLUB_ID ? clubDetail : otherClubDetail));
    mockGetPublicAthleteComparison.mockResolvedValue({ athletes: [
      { ...clubDetail.athletes[0], club: clubDetail.club, progression: [{ date: '2026-01-10', result: 11.2 }, { date: '2026-02-10', result: 10.91 }] },
      { ...otherClubDetail.athletes[0], club: otherClubDetail.club, progression: [{ date: '2026-01-20', result: 11.4 }, { date: '2026-02-20', result: 11.1 }] },
    ] });
    render(<PublicStatsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Public statistics view' }));
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Compare athletes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add club to comparison' }));
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Open Track Club' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add club to comparison' }));
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Harbour Athletics' }));
    await screen.findByText('Open Track Club');

    await userEvent.click(screen.getByRole('button', { name: 'Add athlete to comparison' }));
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Ari Runner' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add athlete to comparison' }));
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Bea Dash' }));

    expect(await screen.findByRole('tab', { name: '100m' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('table', { name: '100m public athlete comparison' })).toHaveTextContent('Ari Runner');
    await userEvent.click(screen.getByRole('tab', { name: 'Long jump' }));
    expect(screen.getByRole('table', { name: 'Long jump public athlete comparison' })).toHaveTextContent('6.40 m');
    expect(mockGetPublicAthleteComparison).toHaveBeenCalledWith([clubDetail.athletes[0].athlete.id, OTHER_ATHLETE_ID], expect.any(AbortSignal), undefined);
  });

  it('compares selected clubs by discipline', async () => {
    const otherClubDetail = { ...clubDetail, club: { id: OTHER_CLUB_ID, name: 'Harbour Athletics' } };
    mockListPublicClubs.mockResolvedValue({ data: [clubDetail.club, otherClubDetail.club], meta: { count: 2 } });
    mockGetPublicClubStatistics.mockImplementation((clubId: string) => Promise.resolve(clubId === CLUB_ID ? clubDetail : otherClubDetail));
    render(<PublicStatsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Public statistics view' }));
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Compare clubs' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add club to comparison' }));
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Open Track Club' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add club to comparison' }));
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Harbour Athletics' }));

    expect(await screen.findByRole('tab', { name: 'Long jump' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '100m public club comparison' })).toHaveTextContent('Open Track Club');
  });
});
