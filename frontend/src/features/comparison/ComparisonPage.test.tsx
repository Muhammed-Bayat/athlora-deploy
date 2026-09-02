import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ComparisonPage } from './ComparisonPage';

const mockGetTwoAthleteComparison = vi.fn();
const mockListAthletes = vi.fn();

vi.mock('../../api/comparison', () => ({
  getTwoAthleteComparison: (...args: unknown[]) => mockGetTwoAthleteComparison(...args),
}));

vi.mock('../../api/athletes', () => ({
  listAthletes: (...args: unknown[]) => mockListAthletes(...args),
}));

const ATHLETE_1 = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Alice Sprint', coachId: 'u1', dob: null, gender: null, notes: null, archivedAt: null, status: 'active' as const, statusChangedAt: '2026-01-01T00:00:00.000Z', statusChangedBy: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const ATHLETE_2 = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Bob Dash', coachId: 'u1', dob: null, gender: null, notes: null, archivedAt: null, status: 'active' as const, statusChangedAt: '2026-01-01T00:00:00.000Z', statusChangedBy: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };

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
        { event: { id: 'e3', title: 'Race 3', type: 'competition', discipline: '100m', date: '2026-01-15', time: '10:00', locationName: null, status: 'completed' }, result: { eventId: 'e3', athleteId: ATHLETE_2.id, discipline: '100m', outcome: 'valid', finalResult: 11.80, unit: 'seconds', placing: 2, isPb: true, isSb: true, manualOverride: null, overrideReason: null, overriddenBy: null, overrideAt: null, updatedAt: '2026-01-15T00:00:00.000Z' }, effectiveResult: 11.80, effectiveOutcome: 'valid', countsTowardsStatistics: true, runningPb: null, isNewPb: true },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListAthletes.mockResolvedValue({ data: [ATHLETE_1, ATHLETE_2] });
});

function renderPage(params?: Record<string, string>) {
  const search = params ? `?${new URLSearchParams(params).toString()}` : '';
  return render(
    <MemoryRouter initialEntries={[`/console/comparison${search}`]}>
      <ComparisonPage />
    </MemoryRouter>,
  );
}

describe('ComparisonPage', () => {
  it('renders the comparison page heading', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Two-Athlete 100m Comparison');
  });

  it('shows empty prompt when no athletes are selected', async () => {
    renderPage();
    expect(screen.getByText(/Select exactly two different athletes/)).toBeInTheDocument();
  });

  it('shows empty prompt when only one athlete is selected', async () => {
    renderPage({ athlete1Id: ATHLETE_1.id });
    expect(screen.getByText(/Select exactly two different athletes/)).toBeInTheDocument();
  });

  it('shows empty prompt when same athlete is selected twice', async () => {
    renderPage({ athlete1Id: ATHLETE_1.id, athlete2Id: ATHLETE_1.id });
    expect(screen.getByText(/Select exactly two different athletes/)).toBeInTheDocument();
  });

  it('loads and displays comparison metrics for two athletes', async () => {
    mockGetTwoAthleteComparison.mockResolvedValue(comparisonResult);
    renderPage({ athlete1Id: ATHLETE_1.id, athlete2Id: ATHLETE_2.id });

    expect(await screen.findByText('Alice Sprint PB')).toBeInTheDocument();
    expect(screen.getByText('Bob Dash PB')).toBeInTheDocument();
    expect(screen.getByText('Alice Sprint latest')).toBeInTheDocument();
    expect(screen.getByText('Bob Dash latest')).toBeInTheDocument();
  });

  it('displays chart/table toggle and table view shows metrics', async () => {
    mockGetTwoAthleteComparison.mockResolvedValue(comparisonResult);
    renderPage({ athlete1Id: ATHLETE_1.id, athlete2Id: ATHLETE_2.id });

    await screen.findByText('Alice Sprint PB');

    const tableButton = screen.getByRole('button', { name: 'Table' });
    await userEvent.click(tableButton);

    expect(screen.getByRole('table', { name: /comparison metrics/i })).toBeInTheDocument();
    expect(screen.getByText('PB')).toBeInTheDocument();
    expect(screen.getByText('Latest effective result')).toBeInTheDocument();
    expect(screen.getByText('Valid result count')).toBeInTheDocument();
    expect(screen.getByText('Average')).toBeInTheDocument();
    expect(screen.getByText('Consistency (SD)')).toBeInTheDocument();
    expect(screen.getByText('Improvement')).toBeInTheDocument();
  });

  it('shows loading state while fetching comparison', async () => {
    mockGetTwoAthleteComparison.mockReturnValue(new Promise(() => {}));
    renderPage({ athlete1Id: ATHLETE_1.id, athlete2Id: ATHLETE_2.id });

    expect(screen.getByText(/Loading two-athlete comparison/)).toBeInTheDocument();
  });

  it('shows error state when comparison fails', async () => {
    mockGetTwoAthleteComparison.mockRejectedValue(new Error('Network error'));
    renderPage({ athlete1Id: ATHLETE_1.id, athlete2Id: ATHLETE_2.id });

    expect(await screen.findByText('Comparison unavailable')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('provides accessible chart with textual equivalent', async () => {
    mockGetTwoAthleteComparison.mockResolvedValue(comparisonResult);
    renderPage({ athlete1Id: ATHLETE_1.id, athlete2Id: ATHLETE_2.id });

    await screen.findByText('Alice Sprint PB');

    const chart = screen.getByRole('img', { name: /progression chart/i });
    expect(chart).toBeInTheDocument();
    expect(chart.querySelector('title')).toBeTruthy();
  });

  it('preserves athlete selection in URL query params', async () => {
    mockGetTwoAthleteComparison.mockResolvedValue(comparisonResult);
    renderPage({ athlete1Id: ATHLETE_1.id, athlete2Id: ATHLETE_2.id });

    await screen.findByText('Alice Sprint PB');

    expect(mockGetTwoAthleteComparison).toHaveBeenCalledWith(ATHLETE_1.id, ATHLETE_2.id);
  });
});
