import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import type { AthleteDisciplineStatistics } from '../../api/statistics';
import type { Athlete, AthleteResultHistoryEntry, AthleteStatisticsDetail, ResultOutcome, Squad } from '../../types';
import { AthleteDetailPage } from './AthleteDetailPage';

const athleteApi = vi.hoisted(() => ({ getAthlete: vi.fn(), updateAthlete: vi.fn() }));
const meetsApi = vi.hoisted(() => ({ listDisciplines: vi.fn() }));
const statisticsApi = vi.hoisted(() => ({ getAthleteStatistics: vi.fn(), getAthleteDisciplineStatistics: vi.fn(), getAthleteProgression: vi.fn(), getAthleteDisciplineProgression: vi.fn() }));
const squadsApi = vi.hoisted(() => ({ listSquads: vi.fn() }));
const injuriesApi = vi.hoisted(() => ({ listInjuries: vi.fn() }));
vi.mock('../../api/athletes', () => athleteApi);
vi.mock('../../api/statistics', () => statisticsApi);
vi.mock('../../api/squads', () => squadsApi);
vi.mock('../../api/injuries', () => injuriesApi);
vi.mock('../../api/meets', () => meetsApi);
vi.mock('../fitness/FitnessView', () => ({
  FitnessView: ({ athleteName, onBack }: { athleteName: string; onBack: () => void }) => <section><h1>Fitness & injury map</h1><p>{athleteName}</p><button type="button" onClick={onBack}>Back to performance</button></section>,
}));

const ATHLETE_ID = '11111111-1111-4111-8111-111111111111';
const SPRINT_ID = '33333333-3333-4333-8333-333333333333';
const ELITE_ID = '44444444-4444-4444-8444-444444444444';
function squad(id: string, name: string): Squad {
  return { id, name, archivedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
}

function athlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: ATHLETE_ID,
    coachId: '22222222-2222-4222-8222-222222222222',
    name: 'Ari Runner',
    dob: '2004-02-29',
    gender: 'Open',
    squads: [squad(SPRINT_ID, 'Sprint A')],
    preferredDisciplineIds: [],
    seasonGoals: [],
    notes: 'Starts focus',
    archivedAt: null,
    status: 'active',
    statusChangedAt: '2026-01-01T00:00:00.000Z',
    statusChangedBy: '22222222-2222-4222-8222-222222222222',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function history(
  title: string,
  outcome: ResultOutcome,
  overrides: Partial<AthleteResultHistoryEntry> = {},
): AthleteResultHistoryEntry {
  const valid = outcome === 'valid';
  return {
    athlete: { id: ATHLETE_ID, name: 'Ari Runner', squadNames: ['Sprint A'], archivedAt: null },
    event: {
      id: `event-${title}`,
      title,
      type: 'competition',
      discipline: '100m',
      date: '2026-08-10',
      time: null,
      locationName: null,
      status: 'completed',
    },
    result: {
      eventId: `event-${title}`,
      athleteId: ATHLETE_ID,
      discipline: '100m',
      outcome,
      finalResult: valid ? 11.24 : null,
      unit: valid ? 'seconds' : null,
      placing: null,
      isPb: false,
      isSb: false,
      manualOverride: null,
      overrideReason: null,
      overriddenBy: null,
      overrideAt: null,
      updatedAt: `2026-08-10T10:00:00.000Z-${title}`,
    },
    effectiveResult: valid ? 11.24 : null,
    effectiveOutcome: outcome,
    countsTowardsStatistics: valid,
    ...overrides,
  };
}

function statistics(overrides: Partial<AthleteStatisticsDetail> = {}): AthleteStatisticsDetail {
  return {
    athleteId: ATHLETE_ID,
    discipline: '100m',
    unit: 'seconds',
    pb: null,
    sb: null,
    resultsCount: 0,
    latestResult: null,
    latestOutcome: 'no_result',
    updatedAt: '2026-08-17T10:00:00.000Z',
    athlete: { id: ATHLETE_ID, name: 'Ari Runner', squadNames: ['Sprint A'], archivedAt: null },
    resultCounts: { allTime: 0, currentYear: 0, competitionAllTime: 0, trainingAllTime: 0 },
    latest: null,
    recentResults: { competitions: [], training: [] },
    ...overrides,
  };
}

function renderDetail(onBack = vi.fn(), onAthleteUpdated = vi.fn()) {
  return { onBack, onAthleteUpdated, ...render(<AthleteDetailPage athleteId={ATHLETE_ID} onBack={onBack} onAthleteUpdated={onAthleteUpdated} />) };
}

beforeEach(() => {
  squadsApi.listSquads.mockResolvedValue({ data: [squad(SPRINT_ID, 'Sprint A'), squad(ELITE_ID, 'Elite')], meta: { count: 2 } });
  vi.clearAllMocks();
  athleteApi.getAthlete.mockResolvedValue(athlete());
  statisticsApi.getAthleteStatistics.mockResolvedValue(statistics());
  statisticsApi.getAthleteDisciplineStatistics.mockResolvedValue([]);
  statisticsApi.getAthleteProgression.mockResolvedValue({ athlete: { id: ATHLETE_ID, name: 'Ari Runner', squadNames: [], archivedAt: null }, entries: [], pagination: { nextCursor: null, count: 0, total: 0 }, summary: { allTimePb: null, totalResults: 0, totalValid: 0 } });
  statisticsApi.getAthleteDisciplineProgression.mockResolvedValue({ entries: [], summary: { personalBest: null, resultCount: 0 } });
  injuriesApi.listInjuries.mockResolvedValue([]);
  meetsApi.listDisciplines.mockResolvedValue({ data: [], meta: { count: 0 } });
});

describe('AthleteDetailPage', () => {
  it('shows active injuries in the compact summary and excludes resolved history', async () => {
    injuriesApi.listInjuries.mockResolvedValueOnce([{
      id: 'injury-1', workspaceId: 'workspace', athleteId: ATHLETE_ID, bodyRegion: 'Leg', region: 'Leg', area: 'Knee', side: 'Both', severity: 'Moderate', notes: null, occurrenceDate: '2026-08-01', expectedReturnDate: null, resolvedDate: null, resolutionNotes: null, createdBy: 'coach', updatedBy: null, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', deletedAt: null, deletedBy: null,
    }]);
    renderDetail();

    expect(await screen.findByText('1 active injury')).toBeInTheDocument();
    expect(screen.getByText('Moderate active injury status')).toBeInTheDocument();
    expect(injuriesApi.listInjuries).toHaveBeenCalledWith(ATHLETE_ID, undefined, 'active');
  });

  it('shows selected disciplines in the header and profile', async () => {
    meetsApi.listDisciplines.mockResolvedValue({ data: [
      { id: SPRINT_ID, code: '100m', version: 1, kind: 'track', unit: 'seconds', direction: 'lower', defaultRules: { aggregation: 'timed', entrantType: 'individual' }, precision: 2, presentation: { label: '100m', unitLabel: 's' }, createdAt: '2026-01-01T00:00:00.000Z', source: 'test' },
      { id: ELITE_ID, code: 'long_jump', version: 1, kind: 'field', unit: 'metres', direction: 'higher', defaultRules: { aggregation: 'best', entrantType: 'individual' }, precision: 2, presentation: { label: 'Long jump', unitLabel: 'm' }, createdAt: '2026-01-01T00:00:00.000Z', source: 'test' },
    ], meta: { count: 2 } });
    athleteApi.getAthlete.mockResolvedValue(athlete({ preferredDisciplineIds: [SPRINT_ID, ELITE_ID], seasonGoals: [{ id: '55555555-5555-4555-8555-555555555555', disciplineDefinitionId: SPRINT_ID, targetValue: 11.2, targetUnit: 'seconds', targetDate: '2026-12-31', status: 'completed', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }] }));
    renderDetail();

    expect(await screen.findByText('Discipline groups')).toBeInTheDocument();
    expect(screen.getAllByText('100m, Long jump')).toHaveLength(1);
    expect(screen.getByRole('list', { name: 'Disciplines' })).toHaveTextContent('100mLong jump');
    expect(within(screen.getByRole('tablist', { name: 'Result history discipline' })).getByRole('tab', { name: '100m' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('heading', { name: 'Season goals' })).not.toBeInTheDocument();
  });

  it('shows selected disciplines as tabs, including a discipline without results', async () => {
    meetsApi.listDisciplines.mockResolvedValue({ data: [
      { id: SPRINT_ID, code: '100m', version: 1, kind: 'track', unit: 'seconds', direction: 'lower', defaultRules: { aggregation: 'timed', entrantType: 'individual' }, precision: 2, presentation: { label: '100m' }, createdAt: '2026-01-01T00:00:00.000Z', source: 'test' },
      { id: ELITE_ID, code: 'long_jump', version: 1, kind: 'field', unit: 'metres', direction: 'higher', defaultRules: { aggregation: 'best', entrantType: 'individual' }, precision: 2, presentation: { label: 'Long jump' }, createdAt: '2026-01-01T00:00:00.000Z', source: 'test' },
    ], meta: { count: 2 } });
    athleteApi.getAthlete.mockResolvedValue(athlete({ preferredDisciplineIds: [SPRINT_ID, ELITE_ID] }));
    statisticsApi.getAthleteDisciplineStatistics.mockResolvedValue([{ athleteId: ATHLETE_ID, athleteName: 'Ari Runner', discipline: '100m', label: '100m', unit: 'seconds', direction: 'lower', precision: 2, pb: 10.95, sb: 11.05, resultCount: 8, seasonCount: 3, seasonAverage: 11.2, seasonTotal: 33.6, placing: 1 }]);
    const user = userEvent.setup();
    renderDetail();

    const tablist = await screen.findByRole('tablist', { name: 'Discipline performance statistics' });
    expect(within(tablist).getByRole('tab', { name: '100m' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('10.95 s')).toBeInTheDocument();
    await user.click(within(tablist).getByRole('tab', { name: 'Long jump' }));
    expect(screen.getAllByText('No valid result')).toHaveLength(2);
    expect(screen.getByText('No finalized Long jump results yet.')).toBeInTheDocument();
  });

  it('renders every returned result in the selected discipline progression graph', async () => {
    meetsApi.listDisciplines.mockResolvedValue({ data: [
      { id: SPRINT_ID, code: '100m', version: 1, kind: 'track', unit: 'seconds', direction: 'lower', defaultRules: { aggregation: 'timed', entrantType: 'individual' }, precision: 2, presentation: { label: '100m' }, createdAt: '2026-01-01T00:00:00.000Z', source: 'test' },
      { id: ELITE_ID, code: 'long_jump', version: 1, kind: 'field', unit: 'metres', direction: 'higher', defaultRules: { aggregation: 'best', entrantType: 'individual' }, precision: 2, presentation: { label: 'Long jump' }, createdAt: '2026-01-01T00:00:00.000Z', source: 'test' },
    ], meta: { count: 2 } });
    athleteApi.getAthlete.mockResolvedValue(athlete({ preferredDisciplineIds: [SPRINT_ID, ELITE_ID] }));
    statisticsApi.getAthleteDisciplineStatistics.mockResolvedValue([
      { athleteId: ATHLETE_ID, athleteName: 'Ari Runner', discipline: '100m', label: '100m', unit: 'seconds', direction: 'lower', precision: 2, pb: 11.25, sb: 11.25, resultCount: 2, seasonCount: 2, seasonAverage: 11.38, seasonTotal: 22.75, placing: 1 },
      { athleteId: ATHLETE_ID, athleteName: 'Ari Runner', discipline: 'long_jump', label: 'Long jump', unit: 'metres', direction: 'higher', precision: 2, pb: 5.5, sb: 5.5, resultCount: 1, seasonCount: 1, seasonAverage: 5.5, seasonTotal: 5.5, placing: 1 },
    ]);
    statisticsApi.getAthleteDisciplineProgression.mockImplementation((_athleteId: string, disciplineDefinitionId: string) => Promise.resolve(
      disciplineDefinitionId === SPRINT_ID
        ? { entries: [{ eventId: 'legacy-100m', eventDate: '2026-08-01', eventTitle: 'Legacy meet', value: 11.5, isNewPb: true }, { eventId: 'session-100m', eventDate: '2026-09-01', eventTitle: 'Final', value: 11.25, isNewPb: true }], summary: { personalBest: 11.25, resultCount: 2 } }
        : { entries: [{ eventId: 'long-jump', eventDate: '2026-09-02', eventTitle: 'Long jump final', value: 5.5, isNewPb: true }], summary: { personalBest: 5.5, resultCount: 1 } },
    ));

    const user = userEvent.setup();
    renderDetail();

    const graph = await screen.findByRole('img', { name: '100m performance graph' });
    expect(screen.getByText('2 finalized results')).toBeInTheDocument();
    expect(graph.querySelectorAll('circle')).toHaveLength(2);
    expect(graph).toHaveTextContent('Legacy meet, 2026-08-01: 11.50 s (PB)');
    expect(graph).toHaveTextContent('Final, 2026-09-01: 11.25 s (PB)');

    await user.click(within(screen.getByRole('tablist', { name: 'Discipline performance statistics' })).getByRole('tab', { name: 'Long jump' }));
    const longJumpGraph = await screen.findByRole('img', { name: 'Long jump performance graph' });
    expect(screen.getByText('1 finalized result')).toBeInTheDocument();
    expect(longJumpGraph.querySelectorAll('circle')).toHaveLength(1);
    expect(longJumpGraph).toHaveTextContent('Long jump final, 2026-09-02: 5.50 m (PB)');
  });

  it('shows a focused identity, profile, active state, empty history, and back behavior', async () => {
    statisticsApi.getAthleteStatistics.mockResolvedValue(statistics({
      pb: 10.95,
      sb: 11.05,
      resultCounts: { allTime: 8, currentYear: 3, competitionAllTime: 5, trainingAllTime: 3 },
    }));
    const user = userEvent.setup();
    const { onBack } = renderDetail();

    const heading = await screen.findByRole('heading', { name: 'Ari Runner' });
    expect(heading).toHaveFocus();
    expect(screen.getByText('AR')).toBeInTheDocument();
    expect(screen.getByText('Active athlete')).toBeInTheDocument();
    expect(screen.getByText('No disciplines selected')).toBeInTheDocument();
    expect(screen.getByText('29 Feb 2004')).toBeInTheDocument();
    expect(screen.getAllByText(/years/)).toHaveLength(2);
    expect(screen.getByText('No disciplines selected. Edit this athlete to add disciplines.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Competitions 0' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Training 0' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByText('No competition results yet.')).toBeInTheDocument();
    expect(screen.queryByText('No training results yet.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fitness' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Training 0' }));
    expect(screen.getByText('No training results yet.')).toBeInTheDocument();
    expect(screen.queryByText('No competition results yet.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fitness' }));
    expect(await screen.findByRole('heading', { name: 'Fitness & injury map' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to performance' }));
    expect(screen.getByRole('button', { name: 'Fitness' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Back to roster' }));
    expect(onBack).toHaveBeenCalledOnce();
  }, 30_000);

  it('uses explicit placeholders for a partial archived profile', async () => {
    athleteApi.getAthlete.mockResolvedValue(athlete({ dob: null, gender: null, squads: [], notes: null, archivedAt: '2026-08-01T00:00:00.000Z', status: 'archived' }));
    renderDetail();

    expect(await screen.findByText('Archived athlete')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Not provided')).toHaveLength(6);
  });

  it('labels valid, PB, SB, override, cancelled, and raw result context', async () => {
    const overridden = history('City Final', 'valid');
    overridden.event.status = 'cancelled';
    overridden.result = { ...overridden.result, finalResult: 11.24, manualOverride: 11.1, overrideReason: 'Timing review', isPb: true, isSb: true };
    overridden.effectiveResult = 11.1;
    overridden.countsTowardsStatistics = false;
    statisticsApi.getAthleteStatistics.mockResolvedValue(statistics({ recentResults: { competitions: [overridden], training: [] } }));
    renderDetail();

    expect(await screen.findByText('City Final')).toBeInTheDocument();
    expect(screen.getByText('11.10s')).toBeInTheDocument();
    expect(screen.getByText('Valid 100m result')).toBeInTheDocument();
    expect(screen.getByText('Override')).toBeInTheDocument();
    expect(screen.getByText('Personal best (PB)')).toBeInTheDocument();
    expect(screen.getByText('Season best (SB)')).toBeInTheDocument();
    expect(screen.getByText('Cancelled event')).toBeInTheDocument();
    expect(screen.getByText(/Raw result:/)).toHaveTextContent('11.24s');
    expect(screen.getByText('Excluded from statistics')).toBeInTheDocument();
    expect(screen.queryByText('Valid result')).not.toBeInTheDocument();
  });

  it('switches result tabs with click and roving keyboard navigation', async () => {
    const competition = history('City Final', 'valid');
    const training = history('Block session', 'valid');
    training.event = { ...training.event, id: 'training-event', title: 'Block session', type: 'training' };
    statisticsApi.getAthleteStatistics.mockResolvedValue(statistics({
      recentResults: { competitions: [competition], training: [training] },
    }));
    const user = userEvent.setup();
    renderDetail();

    const competitionsTab = await screen.findByRole('tab', { name: 'Competitions 1' });
    const trainingTab = screen.getByRole('tab', { name: 'Training 1' });
    expect(screen.getByText('City Final')).toBeInTheDocument();
    expect(screen.queryByText('Block session')).not.toBeInTheDocument();

    await user.click(trainingTab);
    expect(trainingTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Block session')).toBeInTheDocument();
    expect(screen.queryByText('City Final')).not.toBeInTheDocument();

    await user.keyboard('{ArrowLeft}');
    expect(competitionsTab).toHaveFocus();
    expect(competitionsTab).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{End}');
    expect(trainingTab).toHaveFocus();
    await user.keyboard('{Home}');
    expect(competitionsTab).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(trainingTab).toHaveFocus();
  });

  it('defaults to training when competitions are empty and keeps independent empty states', async () => {
    const training = history('Flying 30s', 'valid');
    training.event = { ...training.event, type: 'training' };
    statisticsApi.getAthleteStatistics.mockResolvedValue(statistics({
      recentResults: { competitions: [], training: [training] },
    }));
    const user = userEvent.setup();
    renderDetail();

    const trainingTab = await screen.findByRole('tab', { name: 'Training 1' });
    expect(trainingTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Flying 30s')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Competitions 0' }));
    expect(screen.getByText('No competition results yet.')).toBeInTheDocument();
    expect(screen.queryByText('No training results yet.')).not.toBeInTheDocument();
  });

  it('shows DQ, DNF, DNS, no-result, and non-scoring incidents as visible text', async () => {
    const pending = history('Pending race', 'no_result');
    pending.countsTowardsStatistics = false;
    statisticsApi.getAthleteStatistics.mockResolvedValue(statistics({
      recentResults: {
        competitions: [history('DQ race', 'dq'), history('DNF race', 'dnf'), history('DNS race', 'dns'), pending],
        training: [],
      },
    }));
    renderDetail();

    expect(await screen.findByText('DQ race')).toBeInTheDocument();
    expect(screen.getByText('Disqualified')).toBeInTheDocument();
    expect(screen.getByText('Did not finish')).toBeInTheDocument();
    expect(screen.getByText('Did not start')).toBeInTheDocument();
    expect(screen.getByText('No result')).toBeInTheDocument();
    expect(screen.getAllByText('Non-scoring')).not.toHaveLength(0);
  });

  it('keeps the profile useful when discipline statistics fail and retries independently', async () => {
    meetsApi.listDisciplines.mockResolvedValue({ data: [{ id: SPRINT_ID, code: '100m', version: 1, kind: 'track', unit: 'seconds', direction: 'lower', defaultRules: { aggregation: 'timed', entrantType: 'individual' }, precision: 2, presentation: { label: '100m' }, createdAt: '2026-01-01T00:00:00.000Z', source: 'test' }], meta: { count: 1 } });
    athleteApi.getAthlete.mockResolvedValue(athlete({ preferredDisciplineIds: [SPRINT_ID] }));
    statisticsApi.getAthleteDisciplineStatistics
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'Statistics failed'))
      .mockResolvedValueOnce([{ athleteId: ATHLETE_ID, athleteName: 'Ari Runner', discipline: '100m', label: '100m', unit: 'seconds', direction: 'lower', precision: 2, pb: 11.2, sb: 11.2, resultCount: 1, seasonCount: 1, seasonAverage: 11.2, seasonTotal: 11.2, placing: 1 }]);
    const user = userEvent.setup();
    renderDetail();

    expect(await screen.findByText('Statistics unavailable')).toBeInTheDocument();
    expect(screen.getByText('29 Feb 2004')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry statistics' }));
    expect(await screen.findAllByText('11.20 s')).toHaveLength(2);
    expect(statisticsApi.getAthleteDisciplineStatistics).toHaveBeenCalledTimes(2);
    expect(athleteApi.getAthlete).toHaveBeenCalledOnce();
  });

  it('shows independent loading and retries a failed profile without refetching statistics', async () => {
    let resolveStatistics!: (value: AthleteDisciplineStatistics[]) => void;
    athleteApi.getAthlete.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline')).mockResolvedValueOnce(athlete());
    statisticsApi.getAthleteDisciplineStatistics.mockReturnValue(new Promise((resolve) => { resolveStatistics = resolve; }));
    const user = userEvent.setup();
    renderDetail();

    expect(screen.getByText('Loading discipline statistics...')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Athlete performance' }).closest('section')).toHaveAttribute('aria-busy', 'true');
    expect(await screen.findByText('Profile unavailable')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry profile' }));
    expect(await screen.findByText('29 Feb 2004')).toBeInTheDocument();
    expect(statisticsApi.getAthleteDisciplineStatistics).toHaveBeenCalledOnce();
    await act(async () => resolveStatistics([]));
    expect(await screen.findByText('No competition results yet.')).toBeInTheDocument();
  });

  it('edits the profile with the shared form and updates displayed data', async () => {
    meetsApi.listDisciplines.mockResolvedValue({ data: [
      { id: SPRINT_ID, code: '100m', version: 1, kind: 'track', unit: 'seconds', direction: 'lower', defaultRules: { aggregation: 'timed', entrantType: 'individual' }, precision: 2, presentation: { label: '100m' }, createdAt: '2026-01-01T00:00:00.000Z', source: 'test' },
      { id: ELITE_ID, code: 'long_jump', version: 1, kind: 'field', unit: 'metres', direction: 'higher', defaultRules: { aggregation: 'best', entrantType: 'individual' }, precision: 2, presentation: { label: 'Long jump' }, createdAt: '2026-01-01T00:00:00.000Z', source: 'test' },
    ], meta: { count: 2 } });
    const updated = athlete({ name: 'Ari Updated', notes: null, preferredDisciplineIds: [SPRINT_ID, ELITE_ID], updatedAt: '2026-08-17T12:00:00.000Z' });
    athleteApi.updateAthlete.mockResolvedValue(updated);
    const user = userEvent.setup();
    const { onAthleteUpdated } = renderDetail();
    await screen.findByRole('heading', { name: 'Ari Runner' });
    await user.click(screen.getByRole('button', { name: 'Edit profile' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit athlete' });
    await user.clear(within(dialog).getByLabelText('Athlete name'));
    await user.type(within(dialog).getByLabelText('Athlete name'), 'Ari Updated');
    await user.click(await within(dialog).findByRole('checkbox', { name: /100m/ }));
    await user.click(within(dialog).getByRole('checkbox', { name: /Long jump/ }));
    await user.clear(within(dialog).getByLabelText(/coach notes/i));
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(athleteApi.updateAthlete).toHaveBeenCalledWith(ATHLETE_ID, {
      name: 'Ari Updated', dob: '2004-02-29', gender: 'Open', squadIds: [SPRINT_ID], notes: null, preferredDisciplineIds: [SPRINT_ID, ELITE_ID], seasonGoals: [],
    }));
    expect(await screen.findByRole('heading', { name: 'Ari Updated' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Disciplines' })).toHaveTextContent('100mLong jump');
    expect(onAthleteUpdated).toHaveBeenCalledWith(updated);
  });
});
