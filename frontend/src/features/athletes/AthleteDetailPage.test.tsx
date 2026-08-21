import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import type { Athlete, AthleteResultHistoryEntry, AthleteStatisticsDetail, ResultOutcome } from '../../types';
import { AthleteDetailPage } from './AthleteDetailPage';

const athleteApi = vi.hoisted(() => ({ getAthlete: vi.fn(), updateAthlete: vi.fn() }));
const statisticsApi = vi.hoisted(() => ({ getAthleteStatistics: vi.fn() }));
vi.mock('../../api/athletes', () => athleteApi);
vi.mock('../../api/statistics', () => statisticsApi);
vi.mock('../fitness/FitnessView', () => ({
  FitnessView: ({ athleteName, onBack }: { athleteName: string; onBack: () => void }) => <section><h1>Fitness & injury map</h1><p>{athleteName}</p><button type="button" onClick={onBack}>Back to performance</button></section>,
}));

const ATHLETE_ID = '11111111-1111-4111-8111-111111111111';

function athlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: ATHLETE_ID,
    coachId: '22222222-2222-4222-8222-222222222222',
    name: 'Ari Runner',
    dob: '2004-02-29',
    gender: 'Open',
    squad: 'Sprint A',
    notes: 'Starts focus',
    archivedAt: null,
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
    athlete: { id: ATHLETE_ID, name: 'Ari Runner', squad: 'Sprint A', archivedAt: null },
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
    athlete: { id: ATHLETE_ID, name: 'Ari Runner', squad: 'Sprint A', archivedAt: null },
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
  vi.clearAllMocks();
  athleteApi.getAthlete.mockResolvedValue(athlete());
  statisticsApi.getAthleteStatistics.mockResolvedValue(statistics());
});

describe('AthleteDetailPage', () => {
  it('shows a focused identity, current-year KPIs, profile, active state, empty history, and back behavior', async () => {
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
    expect(screen.getByText('100m')).toBeInTheDocument();
    expect(screen.getByText('29 Feb 2004')).toBeInTheDocument();
    expect(screen.getAllByText(/years/)).toHaveLength(2);
    expect(screen.getByText('10.95s')).toBeInTheDocument();
    expect(screen.getByText('11.05s')).toBeInTheDocument();
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
  });

  it('uses explicit placeholders for a partial archived profile', async () => {
    athleteApi.getAthlete.mockResolvedValue(athlete({ dob: null, gender: null, squad: null, notes: null, archivedAt: '2026-08-01T00:00:00.000Z' }));
    renderDetail();

    expect(await screen.findByText('Archived athlete')).toBeInTheDocument();
    expect(screen.getAllByText('Not provided')).toHaveLength(5);
    expect(screen.getByText('No valid result')).toBeInTheDocument();
    expect(screen.getByText('No valid result this year')).toBeInTheDocument();
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

  it('keeps profile useful when statistics fails and retries statistics independently', async () => {
    statisticsApi.getAthleteStatistics
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'Statistics failed'))
      .mockResolvedValueOnce(statistics({ pb: 11.2 }));
    const user = userEvent.setup();
    renderDetail();

    expect(await screen.findByText('Statistics unavailable')).toBeInTheDocument();
    expect(screen.getByText('29 Feb 2004')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry statistics' }));
    expect(await screen.findByText('11.20s')).toBeInTheDocument();
    expect(statisticsApi.getAthleteStatistics).toHaveBeenCalledTimes(2);
    expect(athleteApi.getAthlete).toHaveBeenCalledOnce();
  });

  it('shows independent loading and retries a failed profile without refetching statistics', async () => {
    let resolveStatistics!: (value: AthleteStatisticsDetail) => void;
    athleteApi.getAthlete.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline')).mockResolvedValueOnce(athlete());
    statisticsApi.getAthleteStatistics.mockReturnValue(new Promise((resolve) => { resolveStatistics = resolve; }));
    const user = userEvent.setup();
    renderDetail();

    expect(screen.getByText('Loading performance statistics...')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Athlete performance' }).closest('section')).toHaveAttribute('aria-busy', 'true');
    expect(await screen.findByText('Profile unavailable')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry profile' }));
    expect(await screen.findByText('29 Feb 2004')).toBeInTheDocument();
    expect(statisticsApi.getAthleteStatistics).toHaveBeenCalledOnce();
    await act(async () => resolveStatistics(statistics()));
    expect(await screen.findByText('No competition results yet.')).toBeInTheDocument();
  });

  it('edits the profile with the shared form and updates displayed data', async () => {
    const updated = athlete({ name: 'Ari Updated', squad: 'Elite', notes: null, updatedAt: '2026-08-17T12:00:00.000Z' });
    athleteApi.updateAthlete.mockResolvedValue(updated);
    const user = userEvent.setup();
    const { onAthleteUpdated } = renderDetail();
    await screen.findByRole('heading', { name: 'Ari Runner' });
    await user.click(screen.getByRole('button', { name: 'Edit profile' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit athlete' });
    await user.clear(within(dialog).getByLabelText('Athlete name'));
    await user.type(within(dialog).getByLabelText('Athlete name'), 'Ari Updated');
    await user.clear(within(dialog).getByLabelText(/discipline group/i));
    await user.type(within(dialog).getByLabelText(/discipline group/i), 'Elite');
    await user.clear(within(dialog).getByLabelText(/coach notes/i));
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(athleteApi.updateAthlete).toHaveBeenCalledWith(ATHLETE_ID, {
      name: 'Ari Updated', dob: '2004-02-29', gender: 'Open', squad: 'Elite', notes: null,
    }));
    expect(await screen.findByRole('heading', { name: 'Ari Updated' })).toBeInTheDocument();
    expect(screen.getAllByText('Elite')).toHaveLength(2);
    expect(onAthleteUpdated).toHaveBeenCalledWith(updated);
  });
});
