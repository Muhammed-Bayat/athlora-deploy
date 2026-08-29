import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import type { AthleteResultHistoryEntry, DashboardSummary } from '../../types';
import { DashboardPage, type DashboardPageProps } from './DashboardPage';

const dashboardApi = vi.hoisted(() => ({ getDashboardSummary: vi.fn() }));
vi.mock('../../api/dashboard', () => dashboardApi);

const EMPTY_SUMMARY: DashboardSummary = {
  state: 'summary',
  asOfDate: '2026-08-18',
  athletesCount: 0,
  activeAthletesCount: 0,
  inactiveAthletesCount: 0,
  archivedAthletesCount: 0,
  statusReviewCount: 0,
  upcomingEventCount: 0,
  seasonPbs: 0,
  activeEvent: null,
  rosterSnapshot: [],
  upcomingEvents: [],
  recentResults: [],
  recentPbs: [],
};

function history(overrides: Partial<AthleteResultHistoryEntry> = {}): AthleteResultHistoryEntry {
  return {
    athlete: { id: 'athlete-1', name: 'Ari Runner', squadNames: ['Sprint'], archivedAt: null },
    event: {
      id: 'past-event', title: 'Winter Classic', type: 'competition', discipline: '100m',
      date: '2026-08-10', time: '09:30:00', locationName: 'Central Stadium', status: 'completed',
    },
    result: {
      eventId: 'past-event', athleteId: 'athlete-1', discipline: '100m', outcome: 'valid',
      finalResult: 11.21, unit: 'seconds', placing: 1, isPb: true, isSb: true,
      manualOverride: null, overrideReason: null, overriddenBy: null, overrideAt: null,
      updatedAt: '2026-08-10T11:00:00.000Z',
    },
    effectiveResult: 11.21,
    effectiveOutcome: 'valid',
    countsTowardsStatistics: true,
    ...overrides,
  };
}

function populatedSummary(): DashboardSummary {
  const archived = history({
    athlete: { id: 'athlete-archived', name: 'Bea Sprinter', squadNames: [], archivedAt: '2026-08-12T00:00:00.000Z' },
    result: { ...history().result, athleteId: 'athlete-archived', outcome: 'dq', finalResult: null, isPb: false },
    effectiveResult: null,
    effectiveOutcome: 'dq',
    countsTowardsStatistics: false,
  });
  return {
    ...EMPTY_SUMMARY,
    athletesCount: 3,
    activeAthletesCount: 2,
    inactiveAthletesCount: 1,
    archivedAthletesCount: 1,
    statusReviewCount: 2,
    upcomingEventCount: 2,
    seasonPbs: 4,
    rosterSnapshot: [
      { athleteId: 'athlete-2', name: 'Zola Fast', squadNames: [], discipline: '100m', pb: null },
      { athleteId: 'athlete-1', name: 'Ari Runner', squadNames: ['Sprint'], discipline: '100m', pb: 11.21 },
    ],
    upcomingEvents: [
      { eventId: 'event-2', title: 'Training Two', type: 'training', discipline: '100m', date: '2026-08-20', time: null, locationName: null, status: 'scheduled', athleteCount: 0 },
      { eventId: 'event-1', title: 'Meet One', type: 'competition', discipline: '100m', date: '2026-08-21', time: '08:15:00', locationName: 'Track', status: 'scheduled', athleteCount: 2 },
    ],
    recentResults: [archived, history()],
    recentPbs: [history()],
  };
}

function liveSummary(): DashboardSummary {
  return {
    ...populatedSummary(),
    state: 'live',
    activeEvent: {
      event: { id: 'live-event', title: 'City Sprint Live', type: 'competition', discipline: '100m', date: '2026-08-18', time: '10:05:00', locationName: 'City Track', status: 'in_progress' },
      progress: { participantCount: 3, athletesWithEntriesCount: 1, resolvedResultsCount: 2, entryCount: 4, completionPercent: 67 },
      latestEntries: [
        {
          athlete: { id: 'athlete-archived', name: 'Bea Sprinter', squadNames: [], archivedAt: '2026-08-12T00:00:00.000Z' },
          entry: {
            id: 'entry-1', eventId: 'live-event', athleteId: 'athlete-archived', discipline: '100m',
            entryType: 'split', value: 6.12, unit: 'seconds', isFoul: false, incidentType: 'lane_infringement',
            noteText: 'Checked at 50m', recordedBy: 'coach-1', version: 1, deviceId: null,
            createdAt: '2026-08-18T10:06:00.000Z', updatedAt: '2026-08-18T10:06:00.000Z', deletedAt: null,
          },
        },
      ],
    },
  };
}

function callbacks(): DashboardPageProps {
  return {
    onOpenRoster: vi.fn(),
    onOpenAthlete: vi.fn(),
    onOpenEvents: vi.fn(),
    onOpenEvent: vi.fn(),
    onResumeLogging: vi.fn(),
    onSummaryLoaded: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dashboardApi.getDashboardSummary.mockResolvedValue(EMPTY_SUMMARY);
});

describe('DashboardPage', () => {
  it('shows an accessible loading status and reports the loaded summary', async () => {
    let resolveSummary!: (summary: DashboardSummary) => void;
    dashboardApi.getDashboardSummary.mockReturnValue(new Promise((resolve) => { resolveSummary = resolve; }));
    const props = callbacks();
    render(<DashboardPage {...props} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading dashboard');
    resolveSummary(EMPTY_SUMMARY);
    expect(await screen.findByRole('heading', { name: 'Performance. In motion.' })).toBeInTheDocument();
    expect(props.onSummaryLoaded).toHaveBeenCalledWith(EMPTY_SUMMARY);
  });

  it('renders onboarding actions for an empty summary', async () => {
    const user = userEvent.setup();
    const props = callbacks();
    render(<DashboardPage {...props} />);

    expect(await screen.findByRole('heading', { name: 'No athletes yet' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No upcoming events' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open roster' }));
    await user.click(screen.getByRole('button', { name: 'Open events' }));
    expect(props.onOpenRoster).toHaveBeenCalledOnce();
    expect(props.onOpenEvents).toHaveBeenCalledOnce();
  });

  it('preserves populated summary ordering and opens exact athletes and events', async () => {
    dashboardApi.getDashboardSummary.mockResolvedValue(populatedSummary());
    const user = userEvent.setup();
    const props = callbacks();
    render(<DashboardPage {...props} />);

    const roster = await screen.findByRole('region', { name: 'Roster snapshot' });
    const rosterButtons = within(roster).getAllByRole('button').filter((button) => button.textContent?.includes('Personal best'));
    expect(rosterButtons.map((button) => button.textContent)).toEqual([
      expect.stringContaining('Zola Fast'),
      expect.stringContaining('Ari Runner'),
    ]);
    expect(roster).toHaveTextContent('No PB');
    await user.click(rosterButtons[0]);

    const events = screen.getByRole('region', { name: 'Upcoming events' });
    const eventButton = within(events).getByRole('button', { name: /Training Two/ });
    await user.click(eventButton);
    expect(props.onOpenAthlete).toHaveBeenCalledWith('athlete-2');
    expect(props.onOpenEvent).toHaveBeenCalledWith('event-2');
  });

  it('renders the signature summary hero with real aggregate values', async () => {
    dashboardApi.getDashboardSummary.mockResolvedValue(populatedSummary());
    render(<DashboardPage {...callbacks()} />);

    const hero = await screen.findByRole('region', { name: 'Performance. In motion.' });
    expect(hero).toHaveTextContent(/Good (morning|afternoon|evening), Coach/);
    expect(hero).toHaveTextContent(/2 of 3 athletes are active, with 2 upcoming events and 4 season PBs on the board/);
    expect(within(hero).getByText('Local time')).toBeInTheDocument();
    expect(within(hero).getByText('Active roster')).toBeInTheDocument();
    expect(hero).toHaveTextContent('2 athletes active in your roster');
  });

  it('cleans up the summary hero clock when it unmounts', async () => {
    const clearInterval = vi.spyOn(window, 'clearInterval');
    const page = render(<DashboardPage {...callbacks()} />);
    await screen.findByRole('heading', { name: 'Performance. In motion.' });

    page.unmount();

    expect(clearInterval).toHaveBeenCalled();
    clearInterval.mockRestore();
  });

  it('uses singular summary copy for a one-athlete roster', async () => {
    dashboardApi.getDashboardSummary.mockResolvedValue({
      ...EMPTY_SUMMARY,
      athletesCount: 1,
      activeAthletesCount: 1,
    });
    render(<DashboardPage {...callbacks()} />);

    const hero = await screen.findByRole('region', { name: 'Performance. In motion.' });
    expect(hero).toHaveTextContent(/1 of 1 athlete is active/);
  });

  it('shows effective outcomes, PBs, and archived historical athletes', async () => {
    dashboardApi.getDashboardSummary.mockResolvedValue(populatedSummary());
    const user = userEvent.setup();
    const props = callbacks();
    render(<DashboardPage {...props} />);

    const results = await screen.findByRole('region', { name: 'Recent results' });
    const archivedResult = within(results).getByRole('button', { name: /Bea Sprinter/ });
    expect(archivedResult).toHaveTextContent('Archived');
    expect(archivedResult).toHaveTextContent('Disqualified');
    expect(within(screen.getByRole('region', { name: 'Recent PBs' })).getByText('PB')).toBeInTheDocument();
    await user.click(archivedResult);
    expect(props.onOpenAthlete).toHaveBeenCalledWith('athlete-archived');
  });

  it('renders live progress and supplied entries and resumes the exact event', async () => {
    dashboardApi.getDashboardSummary.mockResolvedValue(liveSummary());
    const user = userEvent.setup();
    const props = callbacks();
    render(<DashboardPage {...props} />);

    expect(await screen.findByRole('heading', { name: 'City Sprint Live' })).toBeInTheDocument();
    const progress = screen.getByRole('region', { name: 'Live event progress' });
    expect(progress).toHaveTextContent('3Participants');
    expect(progress).toHaveTextContent('1Logged');
    expect(progress).toHaveTextContent('2Remaining');
    expect(screen.getByRole('progressbar', { name: 'Event completion' })).toHaveAttribute('aria-valuenow', '67');
    expect(screen.getByText('6.12s')).toBeInTheDocument();
    expect(screen.getByText('Lane infringement')).toBeInTheDocument();
    expect(screen.getByText('Checked at 50m')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(screen.queryByText('Local time')).not.toBeInTheDocument();
    expect(screen.queryByText(/Good (morning|afternoon|evening), Coach/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resume live logging' }));
    expect(props.onResumeLogging).toHaveBeenCalledWith('live-event');
  });

  it('maps API failures and retries', async () => {
    dashboardApi.getDashboardSummary
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline'))
      .mockResolvedValueOnce(EMPTY_SUMMARY);
    const user = userEvent.setup();
    render(<DashboardPage {...callbacks()} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not reach Athlora');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Performance. In motion.' })).toBeInTheDocument();
    expect(dashboardApi.getDashboardSummary).toHaveBeenCalledTimes(2);
  });

  it('ignores a response after unmount', async () => {
    let resolveSummary!: (summary: DashboardSummary) => void;
    dashboardApi.getDashboardSummary.mockReturnValue(new Promise((resolve) => { resolveSummary = resolve; }));
    const props = callbacks();
    const page = render(<DashboardPage {...props} />);
    page.unmount();
    resolveSummary(EMPTY_SUMMARY);
    await waitFor(() => expect(props.onSummaryLoaded).not.toHaveBeenCalled());
  });
});
