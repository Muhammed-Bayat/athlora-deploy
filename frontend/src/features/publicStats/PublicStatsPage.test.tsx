import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicStatsPage } from './PublicStatsPage';

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
  club: { id: CLUB_ID, name: 'Open Track Club', branding: { description: 'Sprint-focused club.', primaryColor: null, logoUrl: null } },
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
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Ari Runner - Open Track Club' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add athlete to comparison' }));
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Bea Dash - Harbour Athletics' }));

    expect(await screen.findByRole('tab', { name: '100m' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('table', { name: '100m public athlete comparison' })).toHaveTextContent('Ari Runner');
    await userEvent.click(screen.getByRole('tab', { name: 'Long jump' }));
    expect(screen.getByRole('table', { name: 'Long jump public athlete comparison' })).toHaveTextContent('6.40 m');
    expect(mockGetPublicAthleteComparison).toHaveBeenCalledWith([clubDetail.athletes[0].athlete.id, OTHER_ATHLETE_ID], expect.any(AbortSignal), undefined);
  });

  it('lets visitors build a comparison with three clubs and three athletes', async () => {
    const THIRD_CLUB_ID = '77777777-7777-4777-8777-777777777777';
    const THIRD_ATHLETE_ID = '88888888-8888-4888-8888-888888888888';
    const harbourDetail = { ...clubDetail, club: { id: OTHER_CLUB_ID, name: 'Harbour Athletics' }, athletes: [{ ...clubDetail.athletes[0], athlete: { id: OTHER_ATHLETE_ID, name: 'Bea Dash' } }] };
    const thirdDetail = { ...clubDetail, club: { id: THIRD_CLUB_ID, name: 'Veldt Athletic Club' }, athletes: [{ ...clubDetail.athletes[0], athlete: { id: THIRD_ATHLETE_ID, name: 'Cleo Marks' } }] };
    mockListPublicClubs.mockResolvedValue({ data: [clubDetail.club, harbourDetail.club, thirdDetail.club], meta: { count: 3 } });
    mockGetPublicClubStatistics.mockImplementation((clubId: string) => Promise.resolve(clubId === CLUB_ID ? clubDetail : clubId === OTHER_CLUB_ID ? harbourDetail : thirdDetail));
    render(<PublicStatsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Public statistics view' }));
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Compare athletes' }));
    for (const clubName of ['Open Track Club', 'Harbour Athletics', 'Veldt Athletic Club']) {
      await userEvent.click(screen.getByRole('button', { name: 'Add club to comparison' }));
      await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: clubName }));
    }
    await waitFor(() => expect(mockGetPublicClubStatistics).toHaveBeenCalledTimes(3));
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
    expect(screen.getByText('3 clubs ready to compare.')).toBeInTheDocument();

    for (const optionName of ['Ari Runner - Open Track Club', 'Bea Dash - Harbour Athletics', 'Cleo Marks - Veldt Athletic Club']) {
      await userEvent.click(screen.getByRole('button', { name: 'Add athlete to comparison' }));
      await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: optionName }));
    }
    expect(screen.getByLabelText('Add athlete to comparison')).not.toBeDisabled();
    expect(screen.getByText('3 athletes ready to compare.')).toBeInTheDocument();
    expect(mockGetPublicAthleteComparison).toHaveBeenCalledWith(
      [clubDetail.athletes[0].athlete.id, OTHER_ATHLETE_ID, THIRD_ATHLETE_ID],
      expect.any(AbortSignal),
      undefined,
    );
  });

  it('allows selecting multiple athletes from the same club', async () => {
    const secondAthlete = { ...clubDetail.athletes[0], athlete: { id: '99999999-9999-4999-8999-999999999999', name: 'Dev Sprint' } };
    mockListPublicClubs.mockResolvedValue({ data: [clubDetail.club], meta: { count: 1 } });
    mockGetPublicClubStatistics.mockResolvedValue({ ...clubDetail, athletes: [clubDetail.athletes[0], secondAthlete] });
    render(<PublicStatsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Public statistics view' }));
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Compare athletes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add club to comparison' }));
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Open Track Club' }));
    await waitFor(() => expect(mockGetPublicClubStatistics).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: 'Add athlete to comparison' }));
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Ari Runner - Open Track Club' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add athlete to comparison' }));
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Dev Sprint - Open Track Club' }));

    expect(screen.getByText('2 athletes ready to compare.')).toBeInTheDocument();
    expect(screen.getByLabelText('Add athlete to comparison')).not.toBeDisabled();
    expect(mockGetPublicAthleteComparison).toHaveBeenCalledWith(
      [clubDetail.athletes[0].athlete.id, '99999999-9999-4999-8999-999999999999'],
      expect.any(AbortSignal),
      undefined,
    );
  });

  it('compares selected clubs by discipline', async () => {
    const relayAvailable = { discipline: '4x100m', label: '4 x 100m', unit: 'seconds', precision: 2, direction: 'lower' };
    const relayDisciplineRow = { ...relayAvailable, rosterAthleteCount: 4, activeAthleteCount: 4, inactiveAthleteCount: 0, archivedAthleteCount: 0, distinctAthletesWithValidResults: 3, totalResultCount: 3, validResultCount: 3, fastestValidResult: 55.26, latestValidResult: 56.4, averageValidResult: 55.9, medianValidResult: 55.9, populationStandardDeviation: null };
    const clubWithRelay = { ...clubDetail, availableDisciplines: [...clubDetail.availableDisciplines, relayAvailable], disciplines: [relayDisciplineRow] };
    const otherClubDetail = { ...clubDetail, club: { id: OTHER_CLUB_ID, name: 'Harbour Athletics' }, availableDisciplines: [...clubDetail.availableDisciplines, relayAvailable], disciplines: [relayDisciplineRow] };
    mockListPublicClubs.mockResolvedValue({ data: [clubDetail.club, otherClubDetail.club], meta: { count: 2 } });
    mockGetPublicClubStatistics.mockImplementation((clubId: string) => Promise.resolve(clubId === CLUB_ID ? clubWithRelay : otherClubDetail));
    render(<PublicStatsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Public statistics view' }));
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Compare clubs' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add club to comparison' }));
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Open Track Club' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add club to comparison' }));
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Harbour Athletics' }));

    expect(await screen.findByRole('tab', { name: 'Long jump' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '100m public club comparison' })).toHaveTextContent('Open Track Club');
    await userEvent.click(screen.getByRole('tab', { name: '4 x 100m' }));
    expect(screen.getByRole('table', { name: '4 x 100m public club comparison' })).toHaveTextContent('Open Track Club355.26 s3');
  });

  it('restores published relay session results for the selected club discipline', async () => {
    mockGetPublicClubStatistics.mockResolvedValue({
      ...clubDetail,
      availableDisciplines: [...clubDetail.availableDisciplines, { discipline: '4x100m', label: '4 x 100m', unit: 'seconds', precision: 2, direction: 'lower' }],
      disciplines: [{ discipline: '4x100m', label: '4 x 100m', unit: 'seconds', precision: 2, direction: 'lower', rosterAthleteCount: 4, activeAthleteCount: 4, inactiveAthleteCount: 0, archivedAthleteCount: 0, distinctAthletesWithValidResults: 2, totalResultCount: 3, validResultCount: 3, fastestValidResult: 55.26, latestValidResult: 56.4, averageValidResult: 55.9, medianValidResult: 55.9, populationStandardDeviation: null }],
      athletes: [{
        ...clubDetail.athletes[0],
        disciplines: [...clubDetail.athletes[0].disciplines, { discipline: '4x100m', label: '4 x 100m', unit: 'seconds', precision: 2, direction: 'lower', pb: 12.5, latestEffectiveResult: 12.5, validResultCount: 1, average: 12.5, consistency: null, improvement: null, progression: [{ date: '2026-09-01', result: 12.5 }] }],
      }],
    });
    mockGetPublicClubSessionResults.mockResolvedValue([{
      eventId: '77777777-7777-4777-8777-777777777777',
      eventTitle: 'City Relays',
      eventDate: '2026-09-01',
      sessions: [{
        id: '88888888-8888-4888-8888-888888888888',
        label: '4 x 100m Final',
        status: 'completed',
        resultState: 'final',
        disciplineCode: '4x100m',
        disciplineLabel: '4 x 100m',
        unit: 'seconds',
        precision: 2,
        results: [{
          entrantId: '99999999-9999-4999-8999-999999999999',
          name: 'Speed Demons',
          kind: 'relay',
          members: [
            { leg: 1, name: 'Ari Runner', isGuest: false },
            { leg: 2, name: 'Guest A', isGuest: true },
          ],
          value: 55.26,
          outcome: 'valid',
          placing: 1,
          isSelected: true,
          relayLegs: [{ relayMemberId: 'aaaaaaaa-1111-4111-8111-111111111111', leg: 1, name: 'Ari Runner', value: 12.5, outcome: 'valid', selectedEntryId: 'bbbbbbbb-2222-4222-8222-222222222222', isPb: true }],
        }],
      }],
    }]);
    render(<PublicStatsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Select first club' }));
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Open Track Club' }));
    await userEvent.click(await screen.findByRole('tab', { name: '4 x 100m' }));

    expect(await screen.findByRole('table', { name: '4 x 100m Final standings' })).toHaveTextContent('Speed Demons');
    const standings = screen.getByRole('table', { name: '4 x 100m Final standings' });
    expect(standings).toHaveTextContent('Ari Runner → Guest A');
    expect(standings).toHaveTextContent('55.26 s');
    expect(standings).toHaveTextContent('valid');
    expect(mockGetPublicClubSessionResults).toHaveBeenCalledWith(CLUB_ID, expect.any(AbortSignal));

    const year = new Date().getUTCFullYear();
    const clubMetrics = screen.getByLabelText(`Open Track Club ${year} published results`);
    expect(within(clubMetrics).getByText('Athletes').parentElement).toHaveTextContent(/^Athletes2$/);
    expect(within(clubMetrics).getByText('Best').parentElement).toHaveTextContent(/^Best55\.26 s$/);
    expect(within(clubMetrics).getByText('Finalized results').parentElement).toHaveTextContent(/^Finalized results3$/);
    expect(screen.getByLabelText(`Ari Runner ${year} discipline metrics`)).toHaveTextContent('12.50 s');
  });
});
