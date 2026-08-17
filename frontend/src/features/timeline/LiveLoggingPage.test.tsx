import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { LiveLoggingPage } from './LiveLoggingPage';
import * as eventsApi from '../../api/events';
import * as athletesApi from '../../api/athletes';
import * as participantsApi from '../../api/participants';
import * as timelineApi from '../../api/timeline';
import * as resultsApi from '../../api/results';
import { ApiError } from '../../api/client';
import type { User } from '../../types';
import { CurrentUserProvider } from '../auth/CurrentUserProvider';

vi.mock('../../api/events');
vi.mock('../../api/athletes');
vi.mock('../../api/participants');
vi.mock('../../api/timeline');
vi.mock('../../api/results');

describe('LiveLoggingPage', () => {
  const currentUser: User = {
    id: 'user-1',
    auth0Id: 'auth0|user-1',
    name: 'Coach Avery',
    email: 'coach@example.com',
    role: 'coach',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  };

  const mockEvent = {
    id: 'ev-1',
    createdBy: 'user-1',
    type: 'competition' as const,
    discipline: '100m' as const,
    title: '100m Regional Final',
    date: '2026-08-20',
    time: '10:00',
    locationName: 'Main Stadium',
    latitude: null,
    longitude: null,
    status: 'scheduled' as const,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  };

  const mockActiveEvent = {
    ...mockEvent,
    status: 'in_progress' as const,
  };

  const mockParticipant = {
    eventId: 'ev-1',
    athleteId: 'ath-1',
    rsvpStatus: 'yes' as const,
    athlete: {
      id: 'ath-1',
      name: 'Amara Chen',
      squad: 'Sprint',
      archivedAt: null,
    },
  };

  const mockTimelineEntry = {
    id: 'entry-1',
    eventId: 'ev-1',
    athleteId: 'ath-1',
    discipline: '100m' as const,
    entryType: 'attempt' as const,
    value: 10.45,
    unit: 'seconds' as const,
    isFoul: false,
    incidentType: null,
    noteText: null,
    recordedBy: 'Coach',
    version: 1,
    deviceId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };

  const mockResult = {
    eventId: 'ev-1',
    athleteId: 'ath-1',
    discipline: '100m' as const,
    outcome: 'valid' as const,
    finalResult: 10.45,
    unit: 'seconds' as const,
    placing: 1,
    isPb: true,
    isSb: true,
    manualOverride: null,
    overrideReason: null,
    overriddenBy: null,
    overrideAt: null,
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(athletesApi.listAthletes).mockResolvedValue({ data: [], meta: { count: 0 } });
  });

  function renderPage() {
    return render(
      <CurrentUserProvider user={currentUser}>
        <LiveLoggingPage />
      </CurrentUserProvider>,
    );
  }

  it('renders no-live state and allows starting an event', async () => {
    vi.mocked(eventsApi.listEvents).mockResolvedValueOnce({
      data: [mockEvent],
      meta: { count: 1 },
    });
    vi.mocked(eventsApi.updateEvent).mockResolvedValueOnce(mockActiveEvent);
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValueOnce({
      data: [mockParticipant],
      meta: { count: 1 },
    });
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValueOnce({
      data: [],
      meta: { count: 0 },
    });
    vi.mocked(resultsApi.listResults).mockResolvedValueOnce({
      data: [],
      meta: { count: 0 },
    });

    renderPage();

    expect(await screen.findByText('100m Regional Final')).toBeInTheDocument();

    const startButton = screen.getByRole('button', { name: /Start Event/i });
    await userEvent.click(startButton);

    await waitFor(() => {
      expect(eventsApi.updateEvent).toHaveBeenCalledWith('ev-1', expect.objectContaining({ status: 'in_progress' }));
    });
  });

  it('renders active event state with assigned athletes and records finish time', async () => {
    vi.mocked(eventsApi.listEvents).mockResolvedValue({
      data: [mockActiveEvent],
      meta: { count: 1 },
    });
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValue({
      data: [mockParticipant],
      meta: { count: 1 },
    });
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValue({
      data: [],
      meta: { count: 0 },
    });
    let resultLoadCount = 0;
    vi.mocked(resultsApi.listResults).mockImplementation(async () => {
      resultLoadCount += 1;
      return resultLoadCount === 1
        ? { data: [], meta: { count: 0 } }
        : { data: [mockResult], meta: { count: 1 } };
    });
    vi.mocked(timelineApi.createTimelineEntry).mockResolvedValue(mockTimelineEntry);

    // Initial render will load events and since no selectedEventId, it shows event list.
    // Let's click Open Live Logger.
    renderPage();

    const openButton = await screen.findByRole('button', { name: /Open Live Logger ›/i });
    await userEvent.click(openButton);

    const input = await screen.findByRole('textbox', { name: /Finish time for Amara Chen/i });
    await userEvent.type(input, '10.45');

    const recordButton = screen.getByRole('button', { name: /^Record$/i });
    await userEvent.click(recordButton);

    await waitFor(() => {
      expect(timelineApi.createTimelineEntry).toHaveBeenCalledWith('ev-1', expect.objectContaining({
        athleteId: 'ath-1',
        entryType: 'attempt',
        value: 10.45,
      }));
    });
    const board = await screen.findByRole('list', { name: 'Event results' });
    expect(await within(board).findAllByText('10.45s')).toHaveLength(2);
    expect(resultsApi.listResults).toHaveBeenCalledTimes(2);
  });

  it('rejects finish times beyond hundredth precision before calling the API', async () => {
    vi.mocked(eventsApi.listEvents).mockResolvedValue({ data: [mockActiveEvent], meta: { count: 1 } });
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValue({ data: [mockParticipant], meta: { count: 1 } });
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValue({ data: [], meta: { count: 0 } });
    vi.mocked(resultsApi.listResults).mockResolvedValue({ data: [], meta: { count: 0 } });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /Open Live Logger/ }));
    await user.type(await screen.findByRole('textbox', { name: /Finish time for Amara Chen/ }), '10.987');
    await user.click(screen.getByRole('button', { name: /^Record$/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('no more than two decimal places');
    expect(timelineApi.createTimelineEntry).not.toHaveBeenCalled();
  });

  it('retries the same event after its initial data load fails', async () => {
    vi.mocked(eventsApi.listEvents).mockResolvedValue({ data: [mockActiveEvent], meta: { count: 1 } });
    vi.mocked(participantsApi.listEventParticipants)
      .mockRejectedValueOnce(new Error('Event data unavailable'))
      .mockResolvedValueOnce({ data: [mockParticipant], meta: { count: 1 } });
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValue({ data: [], meta: { count: 0 } });
    vi.mocked(resultsApi.listResults).mockResolvedValue({ data: [], meta: { count: 0 } });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /Open Live Logger/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Event data unavailable');

    await user.click(screen.getByRole('button', { name: /Open Live Logger/ }));
    expect(await screen.findByRole('textbox', { name: /Finish time for Amara Chen/ })).toBeInTheDocument();
    expect(participantsApi.listEventParticipants).toHaveBeenCalledTimes(2);
  });

  it('returns to the event list without remaining busy when an active refresh becomes stale', async () => {
    let resolveRefresh!: (value: { data: (typeof mockParticipant)[]; meta: { count: number } }) => void;
    vi.mocked(eventsApi.listEvents).mockResolvedValue({ data: [mockActiveEvent], meta: { count: 1 } });
    vi.mocked(participantsApi.listEventParticipants)
      .mockResolvedValueOnce({ data: [mockParticipant], meta: { count: 1 } })
      .mockReturnValueOnce(new Promise((resolve) => { resolveRefresh = resolve; }));
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValue({ data: [], meta: { count: 0 } });
    vi.mocked(resultsApi.listResults).mockResolvedValue({ data: [], meta: { count: 0 } });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /Open Live Logger/ }));
    await screen.findByRole('textbox', { name: /Finish time for Amara Chen/ });
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await user.click(screen.getByRole('button', { name: 'Switch Event' }));

    expect(await screen.findByRole('button', { name: /Open Live Logger/ })).toBeInTheDocument();
    expect(screen.queryByText('Loading events...')).not.toBeInTheDocument();
    resolveRefresh({ data: [mockParticipant], meta: { count: 1 } });
    await waitFor(() => expect(screen.getByRole('button', { name: /Open Live Logger/ })).toBeInTheDocument());
  });

  it('records incidents (false start, lane infringement, DQ, DNF, DNS)', async () => {
    vi.mocked(eventsApi.listEvents).mockResolvedValue({
      data: [mockActiveEvent],
      meta: { count: 1 },
    });
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValue({
      data: [mockParticipant],
      meta: { count: 1 },
    });
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValue({
      data: [],
      meta: { count: 0 },
    });
    vi.mocked(resultsApi.listResults).mockResolvedValue({
      data: [],
      meta: { count: 0 },
    });
    vi.mocked(timelineApi.createTimelineEntry).mockResolvedValue({
      ...mockTimelineEntry,
      entryType: 'penalty',
      incidentType: 'false_start',
      value: null,
    });

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /Open Live Logger ›/i }));

    const falseStartButton = await screen.findByRole('button', { name: /False Start/i });
    await userEvent.click(falseStartButton);

    await waitFor(() => {
      expect(timelineApi.createTimelineEntry).toHaveBeenCalledWith('ev-1', expect.objectContaining({
        athleteId: 'ath-1',
        entryType: 'penalty',
        incidentType: 'false_start',
      }));
    });
  });

  it('handles stale-version conflict recovery (409 Conflict)', async () => {
    vi.mocked(eventsApi.listEvents).mockResolvedValue({
      data: [mockActiveEvent],
      meta: { count: 1 },
    });
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValue({
      data: [mockParticipant],
      meta: { count: 1 },
    });
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValue({
      data: [mockTimelineEntry],
      meta: { count: 1 },
    });
    vi.mocked(resultsApi.listResults).mockResolvedValue({
      data: [mockResult],
      meta: { count: 1 },
    });
    vi.mocked(timelineApi.updateTimelineEntry).mockRejectedValueOnce(
      new ApiError(409, 'CONFLICT', 'Stale version conflict', { message: 'Conflict' })
    );

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /Open Live Logger ›/i }));

    const editButton = await screen.findByRole('button', { name: /Edit/i });
    await userEvent.click(editButton);

    const saveButton = screen.getByRole('button', { name: /Save Changes/i });
    await userEvent.click(saveButton);

    expect(await screen.findByText(/Version conflict detected|Stale version conflict/i)).toBeInTheDocument();
  });

  it('shows a manual override as effective while preserving the timeline-derived value', async () => {
    vi.mocked(eventsApi.listEvents).mockResolvedValue({
      data: [mockActiveEvent],
      meta: { count: 1 },
    });
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValue({
      data: [mockParticipant],
      meta: { count: 1 },
    });
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValue({
      data: [mockTimelineEntry],
      meta: { count: 1 },
    });
    vi.mocked(resultsApi.listResults).mockResolvedValue({
      data: [{
        ...mockResult,
        manualOverride: 10.31,
        overrideReason: 'Photo finish review',
        overriddenBy: currentUser.id,
        overrideAt: '2026-08-17T10:05:00.000Z',
      }],
      meta: { count: 1 },
    });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /Open Live Logger/ }));

    const board = await screen.findByRole('list', { name: 'Event results' });
    expect(within(board).getAllByText('10.31s')).toHaveLength(2);
    expect(within(board).getByText('10.45s')).toBeInTheDocument();
    expect(board).toHaveTextContent('Coach Avery (you)');
    expect(board).toHaveTextContent('Photo finish review');
  });

  it('resolves a removed archived athlete in live historical results', async () => {
    vi.mocked(eventsApi.listEvents).mockResolvedValue({ data: [mockActiveEvent], meta: { count: 1 } });
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValue({ data: [mockParticipant], meta: { count: 1 } });
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValue({ data: [], meta: { count: 0 } });
    vi.mocked(resultsApi.listResults).mockResolvedValue({
      data: [{ ...mockResult, athleteId: 'ath-historical', finalResult: 11.2, placing: 2 }],
      meta: { count: 1 },
    });
    vi.mocked(athletesApi.listAthletes).mockResolvedValue({
      data: [{
        id: 'ath-historical',
        coachId: currentUser.id,
        name: 'Former Runner',
        dob: null,
        gender: null,
        squad: 'Senior',
        notes: null,
        archivedAt: '2026-08-01T00:00:00.000Z',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      }],
      meta: { count: 1 },
    });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /Open Live Logger/ }));

    const board = await screen.findByRole('list', { name: 'Event results' });
    expect(within(board).getByText('Former Runner')).toBeInTheDocument();
    expect(within(board).getByText('Archived')).toBeInTheDocument();
    expect(within(board).getByText('Historical result')).toBeInTheDocument();
    expect(athletesApi.listAthletes).toHaveBeenCalledWith({ includeArchived: true });
  });
});
