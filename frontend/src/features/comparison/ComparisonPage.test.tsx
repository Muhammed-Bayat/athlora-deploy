import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComparisonPage } from './ComparisonPage';

const mockGetTwoAthleteComparison = vi.fn();
const mockGetMultiAthleteComparison = vi.fn();
const mockListAthletes = vi.fn();
const mockListClubs = vi.fn();
const mockListClubComparisonAthletes = vi.fn();
const mockGetClubStatistics = vi.fn();
const mockGetClubComparison = vi.fn();
const mockGetClubMultiComparison = vi.fn();
const mockGetClubPublication = vi.fn();
const mockUpdateClubPublication = vi.fn();

vi.mock('../../api/comparison', () => ({
  getTwoAthleteComparison: (...args: unknown[]) => mockGetTwoAthleteComparison(...args),
  getMultiAthleteComparison: (...args: unknown[]) => mockGetMultiAthleteComparison(...args),
}));

vi.mock('../../api/athletes', () => ({
  listAthletes: (...args: unknown[]) => mockListAthletes(...args),
}));

vi.mock('../../api/clubs', () => ({
  listClubs: (...args: unknown[]) => mockListClubs(...args),
  listClubComparisonAthletes: (...args: unknown[]) => mockListClubComparisonAthletes(...args),
  getClubStatistics: (...args: unknown[]) => mockGetClubStatistics(...args),
  getClubComparison: (...args: unknown[]) => mockGetClubComparison(...args),
  getClubMultiComparison: (...args: unknown[]) => mockGetClubMultiComparison(...args),
  getClubPublication: (...args: unknown[]) => mockGetClubPublication(...args),
  updateClubPublication: (...args: unknown[]) => mockUpdateClubPublication(...args),
}));

const ATHLETE_1 = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Alice Sprint', coachId: 'u1', dob: null, gender: null, notes: null, archivedAt: null, status: 'active' as const, statusChangedAt: '2026-01-01T00:00:00.000Z', statusChangedBy: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const ATHLETE_2 = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Bob Dash', coachId: 'u1', dob: null, gender: null, notes: null, archivedAt: null, status: 'active' as const, statusChangedAt: '2026-01-01T00:00:00.000Z', statusChangedBy: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const ATHLETE_3 = { ...ATHLETE_2, id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', name: 'Cara Bolt' };
const CLUB_1 = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', workspaceId: 'w1', name: 'Alpha Athletics', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const CLUB_2 = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', workspaceId: 'w2', name: 'Bravo Track', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const CLUB_3 = { ...CLUB_2, id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', workspaceId: 'w3', name: 'Cascade Running' };

const comparisonResult = {
  athletes: [
    {
      athlete: { id: ATHLETE_1.id, name: 'Alice Sprint', squadNames: [], archivedAt: null },
      pb: 11.20,
      latestEffectiveResult: 11.30,
      latestEffectiveOutcome: 'valid',
      validResultCount: 5,
      totalResultCount: 7,
      average: 11.35,
      consistency: 0.12,
      improvement: 0.30,
      progression: [
        { event: { id: 'e1', title: 'Race 1', type: 'competition', discipline: '100m', date: '2026-01-01', time: '10:00', locationName: null, status: 'completed' }, result: { eventId: 'e1', athleteId: ATHLETE_1.id, discipline: '100m', outcome: 'valid', finalResult: 11.50, unit: 'seconds', placing: 1, isPb: true, isSb: true, manualOverride: null, overrideReason: null, overriddenBy: null, overrideAt: null, updatedAt: '2026-01-01T00:00:00.000Z' }, effectiveResult: 11.50, effectiveOutcome: 'valid', countsTowardsStatistics: true, runningPb: null, isNewPb: true },
        { event: { id: 'e2', title: 'Race 2', type: 'competition', discipline: '100m', date: '2026-02-01', time: '10:00', locationName: null, status: 'completed' }, result: { eventId: 'e2', athleteId: ATHLETE_1.id, discipline: '100m', outcome: 'valid', finalResult: 11.30, unit: 'seconds', placing: 1, isPb: true, isSb: true, manualOverride: null, overrideReason: null, overriddenBy: null, overrideAt: null, updatedAt: '2026-02-01T00:00:00.000Z' }, effectiveResult: 11.30, effectiveOutcome: 'valid', countsTowardsStatistics: true, runningPb: 11.50, isNewPb: true },
      ],
    },
    {
      athlete: { id: ATHLETE_2.id, name: 'Bob Dash', squadNames: [], archivedAt: null },
      pb: 11.50,
      latestEffectiveResult: 11.60,
      latestEffectiveOutcome: 'valid',
      validResultCount: 3,
      totalResultCount: 3,
      average: 11.55,
      consistency: 0.08,
      improvement: 0.20,
      progression: [
        { event: { id: 'e3', title: 'Race 3', type: 'competition', discipline: '100m', date: '2026-01-15', time: '10:00', locationName: null, status: 'completed' }, result: { eventId: 'e3', athleteId: ATHLETE_2.id, discipline: '100m', outcome: 'valid', finalResult: 11.80, unit: 'seconds', placing: 2, isPb: true, isSb: true, manualOverride: null, overrideReason: null, overriddenBy: null, overrideAt: null, updatedAt: '2026-01-01T00:00:00.000Z' }, effectiveResult: 11.80, effectiveOutcome: 'valid', countsTowardsStatistics: true, runningPb: null, isNewPb: true },
        { event: { id: 'e4', title: 'Race 4', type: 'competition', discipline: '100m', date: '2026-02-15', time: '10:00', locationName: null, status: 'completed' }, result: { eventId: 'e4', athleteId: ATHLETE_2.id, discipline: '100m', outcome: 'valid', finalResult: 11.60, unit: 'seconds', placing: 2, isPb: true, isSb: true, manualOverride: null, overrideReason: null, overriddenBy: null, overrideAt: null, updatedAt: '2026-02-15T00:00:00.000Z' }, effectiveResult: 11.60, effectiveOutcome: 'valid', countsTowardsStatistics: true, runningPb: 11.80, isNewPb: true },
      ],
    },
  ],
};

const clubStatistics = {
  club: { id: CLUB_1.id, name: CLUB_1.name },
  roster: { active: 4, inactive: 1, archived: 2, total: 7 },
  distinctAthletesWithValidResults: 5,
  total100mResultCount: 20,
  valid100mResultCount: 17,
  fastestValidTime: 10.91,
  latestValidTime: 11.42,
  averageValidTime: 11.70,
  medianValidTime: 11.68,
  populationStandardDeviation: 0.22,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListAthletes.mockResolvedValue({ data: [ATHLETE_1, ATHLETE_2, ATHLETE_3] });
  mockListClubs.mockResolvedValue({ data: [CLUB_1, CLUB_2, CLUB_3], meta: { count: 3 } });
  mockListClubComparisonAthletes.mockImplementation((clubId: string) => Promise.resolve({
    data: clubId === CLUB_1.id
      ? [{ id: ATHLETE_1.id, name: 'Alice Sprint', status: 'active' }]
      : [{ id: ATHLETE_2.id, name: 'Bob Dash', status: 'active' }],
    meta: { count: 1 },
  }));
  mockGetClubPublication.mockResolvedValue({ publicResultsEnabled: false, publicScheduleEnabled: false });
});

function renderPage(params?: Record<string, string>) {
  const search = params ? `?${new URLSearchParams(params).toString()}` : '';
  return render(
    <MemoryRouter initialEntries={[`/console/comparison${search}`]}>
      <ComparisonPage />
    </MemoryRouter>,
  );
}

async function choose(label: string, option: string) {
  await userEvent.click(screen.getByRole('button', { name: label }));
  await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: option }));
}

describe('ComparisonPage', () => {
  it('renders the comparison page heading and mode selector', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Compare 100m Performance');
    expect(screen.getByRole('button', { name: 'Comparison mode' })).toHaveTextContent('Athlete vs athlete in my club');
  });

  it('preloads club choices so changing comparison mode does not refetch them', async () => {
    renderPage();

    await waitFor(() => expect(mockListClubs).toHaveBeenCalledTimes(1));
    await choose('Comparison mode', 'Club vs club');

    expect(mockListClubs).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'Add club to comparison' })).not.toBeDisabled();
  });

  it('lets a coach publish the club results independently of the schedule', async () => {
    mockUpdateClubPublication.mockResolvedValue({ publicResultsEnabled: true, publicScheduleEnabled: false });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Publish results' }));

    expect(mockUpdateClubPublication).toHaveBeenCalledWith(true, false);
    expect(await screen.findByRole('button', { name: 'Stop publishing' })).toBeInTheDocument();
    expect(screen.getAllByText('Public')).toHaveLength(1);
    expect(screen.getAllByText('Private')).toHaveLength(1);
  });

  it('lets a coach publish the club schedule independently of the results', async () => {
    mockUpdateClubPublication.mockResolvedValue({ publicResultsEnabled: false, publicScheduleEnabled: true });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Publish schedule' }));

    expect(mockUpdateClubPublication).toHaveBeenCalledWith(false, true);
    expect(await screen.findByRole('button', { name: 'Stop publishing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish results' })).toBeInTheDocument();
    expect(screen.getAllByText('Public')).toHaveLength(1);
    expect(screen.getAllByText('Private')).toHaveLength(1);
  });

  it('shows the same-club athlete prompt until two distinct athletes are selected', () => {
    renderPage({ athlete1Id: ATHLETE_1.id });
    expect(screen.getByText('Select exactly two different athletes from your club.')).toBeInTheDocument();
  });

  it('shows the same-club athlete prompt when an athlete is selected twice', () => {
    renderPage({ athlete1Id: ATHLETE_1.id, athlete2Id: ATHLETE_1.id });
    expect(screen.getByText('Select exactly two different athletes from your club.')).toBeInTheDocument();
  });

  it('loads and displays same-club comparison metrics', async () => {
    mockGetTwoAthleteComparison.mockResolvedValue(comparisonResult);
    renderPage({ athlete1Id: ATHLETE_1.id, athlete2Id: ATHLETE_2.id });

    expect(await screen.findByText('Alice Sprint PB')).toBeInTheDocument();
    expect(screen.getByText('Bob Dash PB')).toBeInTheDocument();
    expect(screen.getByText('11.20s')).toBeInTheDocument();
    expect(mockGetTwoAthleteComparison).toHaveBeenCalledWith(ATHLETE_1.id, ATHLETE_2.id, undefined);
  });

  it('propagates a selected historical season to athlete discovery and comparison', async () => {
    mockGetTwoAthleteComparison.mockResolvedValue(comparisonResult);
    renderPage({ year: '2024', athlete1Id: ATHLETE_1.id, athlete2Id: ATHLETE_2.id });

    expect(await screen.findByRole('heading', { name: 'Alice Sprint vs Bob Dash: 2024 100m Progression' })).toBeInTheDocument();
    expect(mockListAthletes).toHaveBeenCalledWith({ year: '2024' });
    expect(mockGetTwoAthleteComparison).toHaveBeenCalledWith(ATHLETE_1.id, ATHLETE_2.id, undefined, '2024');
  });

  it('propagates the all-time season to athlete discovery and comparison', async () => {
    mockGetTwoAthleteComparison.mockResolvedValue(comparisonResult);
    renderPage({ year: 'all', athlete1Id: ATHLETE_1.id, athlete2Id: ATHLETE_2.id });

    await screen.findByText('Alice Sprint PB');
    expect(mockListAthletes).toHaveBeenCalledWith({ year: 'all' });
    expect(mockGetTwoAthleteComparison).toHaveBeenCalledWith(ATHLETE_1.id, ATHLETE_2.id, undefined, 'all');
  });

  it('displays the metrics table for athletes', async () => {
    mockGetTwoAthleteComparison.mockResolvedValue(comparisonResult);
    renderPage({ athlete1Id: ATHLETE_1.id, athlete2Id: ATHLETE_2.id });

    await screen.findByText('Alice Sprint PB');
    await userEvent.click(screen.getByRole('button', { name: 'Table' }));

    expect(screen.getByRole('table', { name: /two-athlete comparison metrics/i })).toBeInTheDocument();
    expect(screen.getByText('Consistency (SD)')).toBeInTheDocument();
  });

  it('uses the multi-athlete API and renders every selected athlete', async () => {
    const third = { ...comparisonResult.athletes[1], athlete: { ...comparisonResult.athletes[1].athlete, id: ATHLETE_3.id, name: ATHLETE_3.name } };
    mockGetMultiAthleteComparison.mockResolvedValue({ athletes: [...comparisonResult.athletes, third] });
    renderPage({ athlete1Id: ATHLETE_1.id, athlete2Id: ATHLETE_2.id, athlete3Id: ATHLETE_3.id });

    expect(await screen.findByText('Cara Bolt PB')).toBeInTheDocument();
    expect(mockGetMultiAthleteComparison).toHaveBeenCalledWith([ATHLETE_1.id, ATHLETE_2.id, ATHLETE_3.id], undefined);
    expect(new Set(Array.from(document.querySelectorAll('[data-series-color]'), (line) => line.getAttribute('data-series-color'))).size).toBe(3);
    await userEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getByRole('columnheader', { name: ATHLETE_3.name })).toBeInTheDocument();
  });

  it('removes either athlete from a same-club comparison', async () => {
    mockGetTwoAthleteComparison.mockResolvedValue(comparisonResult);
    renderPage({ athlete1Id: ATHLETE_1.id, athlete2Id: ATHLETE_2.id });

    await userEvent.click(await screen.findByRole('button', { name: 'Remove Alice Sprint' }));

    expect(await screen.findByText('Select exactly two different athletes from your club.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add athlete to comparison' })).toBeInTheDocument();
  });

  it('shows loading and error states for athlete comparisons', async () => {
    mockGetTwoAthleteComparison.mockReturnValue(new Promise(() => {}));
    renderPage({ athlete1Id: ATHLETE_1.id, athlete2Id: ATHLETE_2.id });
    expect(screen.getByRole('status')).toHaveTextContent('Loading comparison data...');
  });

  it('shows comparison errors', async () => {
    mockGetTwoAthleteComparison.mockRejectedValue(new Error('Network error'));
    renderPage({ athlete1Id: ATHLETE_1.id, athlete2Id: ATHLETE_2.id });
    expect(await screen.findByText('Comparison unavailable')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('provides an accessible athlete progression chart', async () => {
    mockGetTwoAthleteComparison.mockResolvedValue(comparisonResult);
    renderPage({ athlete1Id: ATHLETE_1.id, athlete2Id: ATHLETE_2.id });

    await screen.findByText('Alice Sprint PB');
    const chart = screen.getByRole('img', { name: /progression chart/i });
    expect(chart).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: `Alice Sprint vs Bob Dash: ${new Date().getUTCFullYear()} 100m Progression` })).toBeInTheDocument();
    fireEvent.pointerMove(screen.getByTestId('comparison-line-hit-area-1'), { clientX: 120, clientY: 120 });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Alice Sprint');
  });

  it('searches each selected club roster before comparing athletes across clubs', async () => {
    mockGetTwoAthleteComparison.mockResolvedValue(comparisonResult);
    renderPage({ mode: 'athlete-cross-club' });

    await choose('Add club for athlete comparison', CLUB_1.name);
    await choose('Add club for athlete comparison', CLUB_2.name);

    await userEvent.click(screen.getByRole('button', { name: 'Search athletes from selected clubs' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search athletes from selected clubs' }), 'Al');
    await userEvent.click(await screen.findByRole('option', { name: `${ATHLETE_1.name} - ${CLUB_1.name}` }));

    await userEvent.click(screen.getByRole('button', { name: 'Search athletes from selected clubs' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search athletes from selected clubs' }), 'Bo');
    await userEvent.click(await screen.findByRole('option', { name: `${ATHLETE_2.name} - ${CLUB_2.name}` }));

    await waitFor(() => expect(mockGetTwoAthleteComparison).toHaveBeenCalledWith(
      ATHLETE_1.id,
      ATHLETE_2.id,
      'cross-club',
    ));
    expect(mockListClubComparisonAthletes).toHaveBeenCalledWith(CLUB_1.id, 'Al', expect.any(AbortSignal));
    expect(mockListClubComparisonAthletes).toHaveBeenCalledWith(CLUB_2.id, 'Bo', expect.any(AbortSignal));
  });

  it('allows multiple athletes from one selected club alongside another club', async () => {
    const third = { ...comparisonResult.athletes[1], athlete: { ...comparisonResult.athletes[1].athlete, id: ATHLETE_3.id, name: ATHLETE_3.name } };
    mockGetMultiAthleteComparison.mockResolvedValue({ athletes: [comparisonResult.athletes[0], third, comparisonResult.athletes[1]] });
    mockListClubComparisonAthletes.mockImplementation((clubId: string) => Promise.resolve({
      data: clubId === CLUB_1.id
        ? [{ id: ATHLETE_1.id, name: ATHLETE_1.name, status: 'active' }, { id: ATHLETE_3.id, name: ATHLETE_3.name, status: 'active' }]
        : [{ id: ATHLETE_2.id, name: ATHLETE_2.name, status: 'active' }],
      meta: { count: clubId === CLUB_1.id ? 2 : 1 },
    }));
    renderPage({ mode: 'athlete-cross-club' });

    await choose('Add club for athlete comparison', CLUB_1.name);
    await choose('Add club for athlete comparison', CLUB_2.name);
    await userEvent.click(screen.getByRole('button', { name: 'Search athletes from selected clubs' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search athletes from selected clubs' }), 'Al');
    await userEvent.click(await screen.findByRole('option', { name: `${ATHLETE_1.name} - ${CLUB_1.name}` }));
    await userEvent.click(screen.getByRole('button', { name: 'Search athletes from selected clubs' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search athletes from selected clubs' }), 'Ca');
    await userEvent.click(await screen.findByRole('option', { name: `${ATHLETE_3.name} - ${CLUB_1.name}` }));
    await userEvent.click(screen.getByRole('button', { name: 'Search athletes from selected clubs' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search athletes from selected clubs' }), 'Bo');
    await userEvent.click(await screen.findByRole('option', { name: `${ATHLETE_2.name} - ${CLUB_2.name}` }));

    await waitFor(() => expect(mockGetMultiAthleteComparison).toHaveBeenCalledWith(
      [ATHLETE_1.id, ATHLETE_3.id, ATHLETE_2.id],
      'cross-club',
    ));
    expect(screen.getByRole('list', { name: 'Selected comparison athletes' })).toHaveTextContent(`${CLUB_1.name}: ${ATHLETE_1.name}`);
    expect(screen.getByRole('list', { name: 'Selected comparison athletes' })).toHaveTextContent(`${CLUB_1.name}: ${ATHLETE_3.name}`);
    expect(screen.getByRole('list', { name: 'Selected comparison athletes' })).toHaveTextContent(`${CLUB_2.name}: ${ATHLETE_2.name}`);
  });

  it('removes a cross-club athlete through its selected chip', async () => {
    mockGetTwoAthleteComparison.mockResolvedValue(comparisonResult);
    renderPage({ mode: 'athlete-cross-club' });

    await choose('Add club for athlete comparison', CLUB_1.name);
    await choose('Add club for athlete comparison', CLUB_2.name);
    await userEvent.click(screen.getByRole('button', { name: 'Search athletes from selected clubs' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search athletes from selected clubs' }), 'Al');
    await userEvent.click(await screen.findByRole('option', { name: `${ATHLETE_1.name} - ${CLUB_1.name}` }));
    await userEvent.click(screen.getByRole('button', { name: 'Search athletes from selected clubs' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search athletes from selected clubs' }), 'Bo');
    await userEvent.click(await screen.findByRole('option', { name: `${ATHLETE_2.name} - ${CLUB_2.name}` }));
    await screen.findByText('Alice Sprint PB');

    await userEvent.click(screen.getByRole('button', { name: 'Remove Alice Sprint' }));

    expect(await screen.findByText('Select at least two clubs, then add two to five athletes across them.')).toBeInTheDocument();
  });

  it('removes a cross-club athlete and its club selection', async () => {
    mockGetTwoAthleteComparison.mockResolvedValue(comparisonResult);
    renderPage({ mode: 'athlete-cross-club', club1Id: CLUB_1.id, club2Id: CLUB_2.id, athlete1Id: ATHLETE_1.id, athlete2Id: ATHLETE_2.id });

    await userEvent.click(await screen.findByRole('button', { name: 'Remove Alice Sprint' }));

    expect(await screen.findByText('Select at least two clubs, then add two to five athletes across them.')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Selected comparison clubs' })).toHaveTextContent(CLUB_2.name);
  });

  it('removes either club from a club comparison', async () => {
    mockGetClubComparison.mockResolvedValue({ clubs: [] });
    renderPage({ mode: 'club-comparison', club1Id: CLUB_1.id, club2Id: CLUB_2.id });

    await userEvent.click(await screen.findByRole('button', { name: 'Remove Alpha Athletics' }));

    expect(await screen.findByText(`Select exactly two different clubs to compare their ${new Date().getUTCFullYear()} 100m performance.`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add club to comparison' })).toBeInTheDocument();
  });

  it('shows a retry action when club discovery fails', async () => {
    mockListClubs.mockRejectedValueOnce(new Error('Club service unavailable'));
    renderPage({ mode: 'club-statistics' });

    expect(await screen.findByText('Club list unavailable')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry club list' }));

    await waitFor(() => expect(mockListClubs).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Club service unavailable')).not.toBeInTheDocument();
  });

  it('shows club statistics for a selected club', async () => {
    mockGetClubStatistics.mockResolvedValue(clubStatistics);
    renderPage({ mode: 'club-statistics', club1Id: CLUB_1.id });

    expect(await screen.findByRole('table', { name: new RegExp(`alpha athletics ${new Date().getUTCFullYear()} 100m statistics`, 'i') })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Club statistics summary' })).toHaveTextContent('10.91s');
    expect(mockGetClubStatistics).toHaveBeenCalledWith(CLUB_1.id);
  });

  it('compares two clubs side by side', async () => {
    mockGetClubComparison.mockResolvedValue({ clubs: [clubStatistics, { ...clubStatistics, club: { id: CLUB_2.id, name: CLUB_2.name } }] });
    renderPage({ mode: 'club-comparison', club1Id: CLUB_1.id, club2Id: CLUB_2.id });

    const table = await screen.findByRole('table', { name: `${new Date().getUTCFullYear()} club comparison metrics` });
    expect(within(table).getByRole('columnheader', { name: 'Bravo Track' })).toBeInTheDocument();
    expect(mockGetClubComparison).toHaveBeenCalledWith(CLUB_1.id, CLUB_2.id);
  });

  it('uses the multi-club API and renders every selected club', async () => {
    mockGetClubMultiComparison.mockResolvedValue({ clubs: [clubStatistics, { ...clubStatistics, club: { id: CLUB_2.id, name: CLUB_2.name } }, { ...clubStatistics, club: { id: CLUB_3.id, name: CLUB_3.name } }] });
    renderPage({ mode: 'club-comparison', club1Id: CLUB_1.id, club2Id: CLUB_2.id, club3Id: CLUB_3.id });

    expect(await screen.findByRole('columnheader', { name: CLUB_3.name })).toBeInTheDocument();
    expect(mockGetClubMultiComparison).toHaveBeenCalledWith([CLUB_1.id, CLUB_2.id, CLUB_3.id]);
  });
});
