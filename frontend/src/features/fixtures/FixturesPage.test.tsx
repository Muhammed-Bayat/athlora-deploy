import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import type { Athlete, AthleticsEvent, EventParticipantSummary, FixtureDetail, Result } from '../../types';
import { FixturesPage } from './FixturesPage';

const fixtureApi = vi.hoisted(() => ({
  addGuestFixtureParticipant: vi.fn(),
  createGuestFixtureEntry: vi.fn(),
  listGuestFixtureParticipants: vi.fn(),
  listGuestFixtureResults: vi.fn(),
  listGuestFixtures: vi.fn(),
  overrideGuestFixtureResult: vi.fn(),
  removeGuestFixtureParticipant: vi.fn(),
  updateGuestFixtureParticipant: vi.fn(),
  withdrawGuestFixture: vi.fn(),
}));
const athleteApi = vi.hoisted(() => ({ listAthletes: vi.fn() }));

vi.mock('../../api/fixtures', () => fixtureApi);
vi.mock('../../api/athletes', () => athleteApi);
vi.mock('../auth/WorkspaceContext', () => ({
  useWorkspace: () => ({ activeWorkspace: { id: 'guest-workspace', role: 'coach' } }),
}));

const EVENT_ID = 'event-1';
const SECOND_EVENT_ID = 'event-2';
const ARI_ID = 'athlete-1';
const BEA_ID = 'athlete-2';

function event(overrides: Partial<AthleticsEvent> = {}): AthleticsEvent {
  return {
    id: EVENT_ID,
    createdBy: 'host-user',
    type: 'competition',
    discipline: '100m',
    title: 'City Sprint Meet',
    date: '2026-09-01',
    time: '09:30:00',
    locationName: 'Central Stadium',
    latitude: null,
    longitude: null,
    status: 'scheduled',
    createdAt: '2026-08-16T10:00:00.000Z',
    updatedAt: '2026-08-16T10:00:00.000Z',
    ...overrides,
  };
}

function fixture(overrides: Partial<FixtureDetail> = {}): FixtureDetail {
  return {
    event: event(),
    revision: 1,
    teamStatus: 'accepted',
    teams: [],
    ...overrides,
  };
}

function athlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: ARI_ID,
    coachId: 'coach-1',
    name: 'Ari Runner',
    dob: null,
    gender: null,
    squads: [],
    preferredDisciplineIds: [],
    seasonGoals: [],
    notes: null,
    archivedAt: null,
    status: 'active',
    statusChangedAt: '2026-08-16T10:00:00.000Z',
    statusChangedBy: 'coach-1',
    createdAt: '2026-08-16T10:00:00.000Z',
    updatedAt: '2026-08-16T10:00:00.000Z',
    ...overrides,
  };
}

function participant(overrides: Partial<EventParticipantSummary> = {}): EventParticipantSummary {
  return {
    eventId: EVENT_ID,
    athleteId: ARI_ID,
    rsvpStatus: 'pending',
    athlete: { id: ARI_ID, name: 'Ari Runner', archivedAt: null, status: 'active' },
    statusReviewRequired: false,
    ...overrides,
  };
}

function result(overrides: Partial<Result> = {}): Result {
  return {
    eventId: EVENT_ID,
    athleteId: ARI_ID,
    discipline: '100m',
    outcome: 'valid',
    finalResult: 11.2,
    unit: 'seconds',
    placing: 1,
    isPb: false,
    isSb: false,
    manualOverride: null,
    overrideReason: null,
    overriddenBy: null,
    overrideAt: null,
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

const empty = { data: [], meta: { count: 0 } };

beforeEach(() => {
  vi.clearAllMocks();
  fixtureApi.listGuestFixtures.mockResolvedValue(empty);
  athleteApi.listAthletes.mockResolvedValue({ data: [athlete(), athlete({ id: BEA_ID, name: 'Bea Sprinter' })], meta: { count: 2 } });
  fixtureApi.listGuestFixtureParticipants.mockResolvedValue(empty);
  fixtureApi.listGuestFixtureResults.mockResolvedValue(empty);
  fixtureApi.addGuestFixtureParticipant.mockResolvedValue(undefined);
  fixtureApi.createGuestFixtureEntry.mockResolvedValue(undefined);
  fixtureApi.overrideGuestFixtureResult.mockResolvedValue(undefined);
  fixtureApi.removeGuestFixtureParticipant.mockResolvedValue(undefined);
  fixtureApi.updateGuestFixtureParticipant.mockResolvedValue(undefined);
  fixtureApi.withdrawGuestFixture.mockResolvedValue(undefined);
});

describe('FixturesPage', () => {
  it('shows loading before displaying the empty accepted-fixtures state', async () => {
    let resolveFixtures!: (value: typeof empty) => void;
    fixtureApi.listGuestFixtures.mockReturnValue(new Promise((resolve) => { resolveFixtures = resolve; }));

    render(<FixturesPage />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading fixtures...');
    expect(screen.queryByText('No accepted fixtures')).not.toBeInTheDocument();
    resolveFixtures(empty);
    expect(await screen.findByText('No accepted fixtures')).toBeInTheDocument();
  });

  it('shows fixture loading errors', async () => {
    fixtureApi.listGuestFixtures.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Fixture service is unavailable'));

    render(<FixturesPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Fixture service is unavailable');
  });

  it('switches fixtures and lets a coach assign athletes and update RSVP', async () => {
    const secondFixture = fixture({ event: event({ id: SECOND_EVENT_ID, title: 'Regional Relay', date: '2026-09-08' }) });
    fixtureApi.listGuestFixtures.mockResolvedValue({ data: [fixture(), secondFixture], meta: { count: 2 } });
    fixtureApi.listGuestFixtureParticipants.mockImplementation(async (eventId: string) => ({
      data: eventId === EVENT_ID ? [participant()] : [],
      meta: { count: eventId === EVENT_ID ? 1 : 0 },
    }));
    const user = userEvent.setup();

    render(<FixturesPage />);

    expect(await screen.findByRole('heading', { name: 'City Sprint Meet' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Fixture'), SECOND_EVENT_ID);
    expect(await screen.findByRole('heading', { name: 'Regional Relay' })).toBeInTheDocument();
    expect(fixtureApi.listGuestFixtureParticipants).toHaveBeenCalledWith(SECOND_EVENT_ID);

    await user.selectOptions(screen.getByLabelText('Fixture'), EVENT_ID);
    await screen.findByLabelText('RSVP for Ari Runner');
    await user.selectOptions(screen.getByLabelText('Assign active athlete'), BEA_ID);
    await user.click(screen.getByRole('button', { name: 'Assign athlete' }));
    await waitFor(() => expect(fixtureApi.addGuestFixtureParticipant).toHaveBeenCalledWith(EVENT_ID, BEA_ID));

    await user.selectOptions(screen.getByLabelText('RSVP for Ari Runner'), 'yes');
    await waitFor(() => expect(fixtureApi.updateGuestFixtureParticipant).toHaveBeenCalledWith(EVENT_ID, ARI_ID, 'yes'));
  });

  it('records and corrects a live fixture result', async () => {
    fixtureApi.listGuestFixtures.mockResolvedValue({ data: [fixture({ event: event({ status: 'in_progress' }) })], meta: { count: 1 } });
    fixtureApi.listGuestFixtureParticipants.mockResolvedValue({ data: [participant()], meta: { count: 1 } });
    fixtureApi.listGuestFixtureResults.mockResolvedValue({ data: [result()], meta: { count: 1 } });
    const user = userEvent.setup();

    render(<FixturesPage />);

    await screen.findByRole('heading', { name: 'Record or correct our result' });
    await user.selectOptions(screen.getByLabelText('Athlete'), ARI_ID);
    await user.type(screen.getByLabelText('Finish time (seconds)'), '11.05');
    await user.click(screen.getByRole('button', { name: 'Record time' }));
    await waitFor(() => expect(fixtureApi.createGuestFixtureEntry).toHaveBeenCalledWith(EVENT_ID, {
      athleteId: ARI_ID, entryType: 'attempt', value: 11.05, unit: 'seconds',
    }));

    await user.type(screen.getByLabelText('Finish time (seconds)'), '10.95');
    await user.type(screen.getByLabelText('Correction reason'), 'Timing review');
    await user.click(screen.getByRole('button', { name: 'Apply correction' }));
    await waitFor(() => expect(fixtureApi.overrideGuestFixtureResult).toHaveBeenCalledWith(EVENT_ID, ARI_ID, {
      manualOverride: 10.95, overrideReason: 'Timing review',
    }));
  });

  it('blocks roster and result changes until a revised invitation is accepted', async () => {
    fixtureApi.listGuestFixtures.mockResolvedValue({
      data: [fixture({ teamStatus: 'reacceptance_required' })], meta: { count: 1 },
    });
    fixtureApi.listGuestFixtureParticipants.mockResolvedValue({ data: [participant()], meta: { count: 1 } });

    render(<FixturesPage />);

    expect(await screen.findByText(/reaccepts the updated invitation link/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign athlete' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('RSVP for Ari Runner')).toBeDisabled();
  });
});
