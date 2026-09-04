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
import { WorkspaceContext } from '../auth/WorkspaceContext';

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
      squadNames: ['Sprint'],
      archivedAt: null,
      status: 'active' as const,
    },
    statusReviewRequired: false,
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
    vi.mocked(eventsApi.getEvent).mockResolvedValue(mockActiveEvent);
    vi.mocked(athletesApi.listAthletes).mockResolvedValue({ data: [], meta: { count: 0 } });
  });

  function renderPage(initialEventId?: string) {
    return render(
      <CurrentUserProvider user={currentUser}>
        <LiveLoggingPage initialEventId={initialEventId} />
      </CurrentUserProvider>,
    );
  }

  function renderAssistantPage(initialEventId?: string) {
    return render(
      <WorkspaceContext.Provider value={{
        activeWorkspace: { id: 'workspace-1', name: 'Sprint squad', timezone: 'UTC', role: 'assistant' },
        workspaces: [], selectWorkspace: () => undefined, refreshWorkspaces: async () => undefined,
      }}>
        <CurrentUserProvider user={{ ...currentUser, role: 'assistant' }}>
          <LiveLoggingPage initialEventId={initialEventId} />
        </CurrentUserProvider>
      </WorkspaceContext.Provider>,
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

  it('lets assistants start, complete, and operate live logging', async () => {
    vi.mocked(eventsApi.listEvents).mockResolvedValue({ data: [{ ...mockEvent, id: 'ev-scheduled' }, mockActiveEvent], meta: { count: 2 } });
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValue({ data: [mockParticipant], meta: { count: 1 } });
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValue({ data: [], meta: { count: 0 } });
    vi.mocked(resultsApi.listResults).mockResolvedValue({ data: [], meta: { count: 0 } });

    const user = userEvent.setup();
    renderAssistantPage();

    expect(await screen.findByRole('button', { name: 'Start Event' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open Live Logger ›' }));
    expect(await screen.findByRole('button', { name: 'Record' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Complete Event' })).toBeInTheDocument();
  });

  it('resumes the active event supplied by dashboard navigation', async () => {
    vi.mocked(eventsApi.listEvents).mockResolvedValue({ data: [mockActiveEvent], meta: { count: 1 } });
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValue({ data: [mockParticipant], meta: { count: 1 } });
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValue({ data: [mockTimelineEntry], meta: { count: 1 } });
    vi.mocked(resultsApi.listResults).mockResolvedValue({ data: [mockResult], meta: { count: 1 } });

    renderPage(mockActiveEvent.id);

    expect(await screen.findByRole('heading', { name: mockActiveEvent.title })).toBeInTheDocument();
    expect(participantsApi.listEventParticipants).toHaveBeenCalledWith(mockActiveEvent.id);
    expect(timelineApi.listTimelineEntries).toHaveBeenCalledWith(mockActiveEvent.id);
  });

  it('returns to event selection when a dashboard event is no longer live', async () => {
    const completed = { ...mockActiveEvent, status: 'completed' as const };
    vi.mocked(eventsApi.getEvent).mockResolvedValue(completed);
    vi.mocked(eventsApi.listEvents)
      .mockResolvedValueOnce({ data: [mockActiveEvent], meta: { count: 1 } })
      .mockResolvedValueOnce({ data: [], meta: { count: 0 } });
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValue({ data: [], meta: { count: 0 } });
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValue({ data: [], meta: { count: 0 } });
    vi.mocked(resultsApi.listResults).mockResolvedValue({ data: [], meta: { count: 0 } });

    renderPage(mockActiveEvent.id);

    expect(await screen.findByText(/no longer in progress/i)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'No events available' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete Event' })).not.toBeInTheDocument();
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

    const input = await screen.findByLabelText(/Finish time for Amara Chen/i);
    expect(input).toHaveAttribute('inputmode', 'decimal');
    expect(input).toHaveAttribute('step', '0.01');
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
    await user.type(await screen.findByLabelText(/Finish time for Amara Chen/), '10.987');
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
    expect(await screen.findByLabelText(/Finish time for Amara Chen/)).toBeInTheDocument();
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
    await screen.findByLabelText(/Finish time for Amara Chen/);
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

  it('reloads a stale entry and lets the coach continue with the latest version', async () => {
    vi.mocked(eventsApi.listEvents).mockResolvedValue({
      data: [mockActiveEvent],
      meta: { count: 1 },
    });
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValue({
      data: [mockParticipant],
      meta: { count: 1 },
    });
    vi.mocked(timelineApi.listTimelineEntries)
      .mockResolvedValueOnce({ data: [mockTimelineEntry], meta: { count: 1 } })
      .mockResolvedValue({ data: [{ ...mockTimelineEntry, version: 2 }], meta: { count: 1 } });
    vi.mocked(resultsApi.listResults).mockResolvedValue({
      data: [mockResult],
      meta: { count: 1 },
    });
    vi.mocked(timelineApi.updateTimelineEntry)
      .mockRejectedValueOnce(new ApiError(
        409,
        'TIMELINE_ENTRY_VERSION_CONFLICT',
        'Timeline entry version conflict',
      ))
      .mockResolvedValueOnce({ ...mockTimelineEntry, version: 3, value: 10.44 });

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /Open Live Logger ›/i }));

    const editButton = await screen.findByRole('button', { name: /Edit/i });
    await userEvent.click(editButton);

    const saveButton = screen.getByRole('button', { name: /Save Changes/i });
    await userEvent.click(saveButton);

    expect(await screen.findByText(/changed on another device/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Edit Timeline Entry' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus());

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    expect(timelineApi.updateTimelineEntry).toHaveBeenLastCalledWith(
      'ev-1',
      'entry-1',
      { expectedVersion: 2, value: 10.45, incidentType: null },
    );
  });

  it('locks a valid finish correction and sends no invalid note field', async () => {
    vi.mocked(eventsApi.listEvents).mockResolvedValue({ data: [mockActiveEvent], meta: { count: 1 } });
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValue({ data: [mockParticipant], meta: { count: 1 } });
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValue({ data: [mockTimelineEntry], meta: { count: 1 } });
    vi.mocked(resultsApi.listResults).mockResolvedValue({ data: [mockResult], meta: { count: 1 } });
    let resolveEdit!: (entry: typeof mockTimelineEntry) => void;
    vi.mocked(timelineApi.updateTimelineEntry).mockReturnValueOnce(
      new Promise((resolve) => { resolveEdit = resolve; }),
    );
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /Open Live Logger/ }));
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const value = screen.getByLabelText('Finish Time / Value (seconds)');
    await user.clear(value);
    await user.type(value, '10.44');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(timelineApi.updateTimelineEntry).toHaveBeenCalledWith(
      'ev-1',
      'entry-1',
      { expectedVersion: 1, value: 10.44, incidentType: null },
    );
    resolveEdit({ ...mockTimelineEntry, value: 10.44, version: 2 });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit Timeline Entry' })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus());
  });

  it('edits notes with a note-only payload', async () => {
    const noteEntry = {
      ...mockTimelineEntry,
      id: 'entry-note',
      entryType: 'note' as const,
      value: null,
      unit: null,
      noteText: 'Tailwind increasing',
    };
    vi.mocked(eventsApi.listEvents).mockResolvedValue({ data: [mockActiveEvent], meta: { count: 1 } });
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValue({ data: [mockParticipant], meta: { count: 1 } });
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValue({ data: [noteEntry], meta: { count: 1 } });
    vi.mocked(resultsApi.listResults).mockResolvedValue({ data: [], meta: { count: 0 } });
    vi.mocked(timelineApi.updateTimelineEntry).mockResolvedValue({ ...noteEntry, noteText: 'Wind legal', version: 2 });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /Open Live Logger/ }));
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(screen.queryByLabelText('Finish Time / Value (seconds)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Incident Type')).not.toBeInTheDocument();
    const note = screen.getByLabelText('Note / Comment');
    await user.clear(note);
    await user.type(note, 'Wind legal');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(timelineApi.updateTimelineEntry).toHaveBeenCalledWith(
      'ev-1',
      'entry-note',
      { expectedVersion: 1, noteText: 'Wind legal' },
    );
  });

  it('confirms undo accessibly and sends the current version', async () => {
    vi.mocked(eventsApi.listEvents).mockResolvedValue({ data: [mockActiveEvent], meta: { count: 1 } });
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValue({ data: [mockParticipant], meta: { count: 1 } });
    vi.mocked(timelineApi.listTimelineEntries)
      .mockResolvedValueOnce({ data: [mockTimelineEntry], meta: { count: 1 } })
      .mockResolvedValue({ data: [], meta: { count: 0 } });
    vi.mocked(resultsApi.listResults).mockResolvedValue({ data: [mockResult], meta: { count: 1 } });
    vi.mocked(timelineApi.deleteTimelineEntry).mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /Open Live Logger/ }));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    const dialog = screen.getByRole('dialog', { name: 'Undo timeline entry' });
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Undo entry' }));

    expect(timelineApi.deleteTimelineEntry).toHaveBeenCalledWith(
      'ev-1',
      'entry-1',
      { expectedVersion: 1 },
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Undo timeline entry' })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Chronological Timeline' })).toHaveFocus());
  });

  it('exits the logger when the backend reports that the event closed', async () => {
    const completed = { ...mockActiveEvent, status: 'completed' as const };
    vi.mocked(eventsApi.listEvents)
      .mockResolvedValueOnce({ data: [mockActiveEvent], meta: { count: 1 } })
      .mockResolvedValueOnce({ data: [completed], meta: { count: 1 } });
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValue({ data: [mockParticipant], meta: { count: 1 } });
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValue({ data: [], meta: { count: 0 } });
    vi.mocked(resultsApi.listResults).mockResolvedValue({ data: [], meta: { count: 0 } });
    vi.mocked(timelineApi.createTimelineEntry).mockRejectedValue(
      new ApiError(409, 'EVENT_NOT_IN_PROGRESS', 'Logging is only open while the event is in progress'),
    );
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /Open Live Logger/ }));
    await user.type(await screen.findByLabelText(/Finish time for Amara Chen/), '10.45');
    await user.click(screen.getByRole('button', { name: 'Record' }));

    expect(await screen.findByText(/no longer in progress/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Finish time for Amara Chen/)).not.toBeInTheDocument();
    expect(screen.queryByText(/version conflict/i)).not.toBeInTheDocument();
  });

  it('keeps core logging open when secondary standings data fails', async () => {
    vi.mocked(eventsApi.listEvents).mockResolvedValue({ data: [mockActiveEvent], meta: { count: 1 } });
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValue({ data: [mockParticipant], meta: { count: 1 } });
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValue({ data: [], meta: { count: 0 } });
    vi.mocked(resultsApi.listResults).mockRejectedValue(new Error('Results unavailable'));
    vi.mocked(athletesApi.listAthletes).mockRejectedValue(new Error('History unavailable'));
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /Open Live Logger/ }));

    expect(await screen.findByLabelText(/Finish time for Amara Chen/)).toBeEnabled();
    expect(await screen.findByRole('status')).toHaveTextContent('Logging remains open');
  });

  it('does not open controls when fresh event detail says the event already completed', async () => {
    const completed = { ...mockActiveEvent, status: 'completed' as const };
    vi.mocked(eventsApi.listEvents)
      .mockResolvedValueOnce({ data: [mockActiveEvent], meta: { count: 1 } })
      .mockResolvedValueOnce({ data: [completed], meta: { count: 1 } });
    vi.mocked(eventsApi.getEvent).mockResolvedValue(completed);
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValue({ data: [mockParticipant], meta: { count: 1 } });
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValue({ data: [], meta: { count: 0 } });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /Open Live Logger/ }));

    expect(await screen.findByText(/no longer in progress/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Finish time for Amara Chen/)).not.toBeInTheDocument();
  });

  it('removes a completed event from the local live-event list', async () => {
    const completed = { ...mockActiveEvent, status: 'completed' as const };
    vi.mocked(eventsApi.listEvents).mockResolvedValue({ data: [mockActiveEvent], meta: { count: 1 } });
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValue({ data: [mockParticipant], meta: { count: 1 } });
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValue({ data: [], meta: { count: 0 } });
    vi.mocked(resultsApi.listResults).mockResolvedValue({ data: [], meta: { count: 0 } });
    vi.mocked(eventsApi.updateEvent).mockResolvedValue(completed);
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /Open Live Logger/ }));
    await user.click(screen.getByRole('button', { name: 'Complete Event' }));

    expect(await screen.findByText('No events available')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open Live Logger/ })).not.toBeInTheDocument();
  });

  it('reports when a closed-event list refresh also fails', async () => {
    vi.mocked(eventsApi.listEvents)
      .mockResolvedValueOnce({ data: [mockActiveEvent], meta: { count: 1 } })
      .mockRejectedValueOnce(new Error('Event list refresh failed'));
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValue({ data: [mockParticipant], meta: { count: 1 } });
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValue({ data: [], meta: { count: 0 } });
    vi.mocked(resultsApi.listResults).mockResolvedValue({ data: [], meta: { count: 0 } });
    vi.mocked(timelineApi.createTimelineEntry).mockRejectedValue(
      new ApiError(409, 'EVENT_NOT_IN_PROGRESS', 'Logging closed'),
    );
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /Open Live Logger/ }));
    await user.type(await screen.findByLabelText(/Finish time for Amara Chen/), '10.45');
    await user.click(screen.getByRole('button', { name: 'Record' }));

    expect(await screen.findByText(/could not be refreshed/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Event list refresh failed');
  });

  it('keeps ordinary edit errors inside the modal and focuses the alert', async () => {
    vi.mocked(eventsApi.listEvents).mockResolvedValue({ data: [mockActiveEvent], meta: { count: 1 } });
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValue({ data: [mockParticipant], meta: { count: 1 } });
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValue({ data: [mockTimelineEntry], meta: { count: 1 } });
    vi.mocked(resultsApi.listResults).mockResolvedValue({ data: [mockResult], meta: { count: 1 } });
    vi.mocked(timelineApi.updateTimelineEntry).mockRejectedValue(new ApiError(500, 'SAVE_FAILED', 'Could not save entry'));
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /Open Live Logger/ }));
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Timeline Entry' });
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Could not save entry');
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it('keeps mutation controls locked until refreshed standings settle', async () => {
    let resultLoads = 0;
    let resolveResults!: (value: { data: (typeof mockResult)[]; meta: { count: number } }) => void;
    vi.mocked(eventsApi.listEvents).mockResolvedValue({ data: [mockActiveEvent], meta: { count: 1 } });
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValue({ data: [mockParticipant], meta: { count: 1 } });
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValue({ data: [], meta: { count: 0 } });
    vi.mocked(resultsApi.listResults).mockImplementation(() => {
      resultLoads += 1;
      if (resultLoads === 1) return Promise.resolve({ data: [], meta: { count: 0 } });
      return new Promise((resolve) => { resolveResults = resolve; });
    });
    vi.mocked(timelineApi.createTimelineEntry).mockResolvedValue(mockTimelineEntry);
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /Open Live Logger/ }));
    await user.type(await screen.findByLabelText(/Finish time for Amara Chen/), '10.45');
    await user.click(screen.getByRole('button', { name: 'Record' }));

    expect(await screen.findByRole('button', { name: 'Logging...' })).toBeDisabled();
    expect(screen.getByText('Refreshing live standings...')).toBeInTheDocument();
    resolveResults({ data: [mockResult], meta: { count: 1 } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'False Start' })).toBeEnabled());
    expect(await screen.findByText('Finish time recorded successfully.')).toBeInTheDocument();
  });

  it('validates and sends an exact penalty correction payload', async () => {
    const penalty = {
      ...mockTimelineEntry,
      id: 'entry-penalty',
      entryType: 'penalty' as const,
      value: null,
      unit: null,
      incidentType: 'false_start' as const,
    };
    vi.mocked(eventsApi.listEvents).mockResolvedValue({ data: [mockActiveEvent], meta: { count: 1 } });
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValue({ data: [mockParticipant], meta: { count: 1 } });
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValue({ data: [penalty], meta: { count: 1 } });
    vi.mocked(resultsApi.listResults).mockResolvedValue({ data: [], meta: { count: 0 } });
    vi.mocked(timelineApi.updateTimelineEntry).mockResolvedValue({ ...penalty, incidentType: 'dq', version: 2 });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /Open Live Logger/ }));
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Timeline Entry' });
    await user.selectOptions(within(dialog).getByLabelText('Incident Type'), '');
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Choose an incident');
    await user.selectOptions(within(dialog).getByLabelText('Incident Type'), 'dq');
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    expect(timelineApi.updateTimelineEntry).toHaveBeenCalledWith(
      'ev-1',
      'entry-penalty',
      { expectedVersion: 1, value: null, incidentType: 'dq' },
    );
  });

  it('acknowledges a committed finish when refresh fails and clears stale loading', async () => {
    let resolveStaleResults!: (value: { data: (typeof mockResult)[]; meta: { count: number } }) => void;
    vi.mocked(eventsApi.listEvents).mockResolvedValue({ data: [mockActiveEvent], meta: { count: 1 } });
    vi.mocked(eventsApi.getEvent)
      .mockResolvedValueOnce(mockActiveEvent)
      .mockRejectedValueOnce(new Error('Latest event data unavailable'));
    vi.mocked(participantsApi.listEventParticipants).mockResolvedValue({ data: [mockParticipant], meta: { count: 1 } });
    vi.mocked(timelineApi.listTimelineEntries).mockResolvedValue({ data: [], meta: { count: 0 } });
    vi.mocked(resultsApi.listResults).mockReturnValue(
      new Promise((resolve) => { resolveStaleResults = resolve; }),
    );
    vi.mocked(timelineApi.createTimelineEntry).mockResolvedValue(mockTimelineEntry);
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /Open Live Logger/ }));
    const input = await screen.findByLabelText(/Finish time for Amara Chen/);
    await user.type(input, '10.45');
    await user.click(screen.getByRole('button', { name: 'Record' }));

    expect(await screen.findByText(/Finish time recorded successfully.*Latest event data could not be loaded/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Latest event data unavailable');
    expect(input).toHaveValue(null);
    resolveStaleResults({ data: [mockResult], meta: { count: 1 } });
    await waitFor(() => expect(screen.queryByText('Refreshing live standings...')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
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
        squads: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Senior', archivedAt: null, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }],
        notes: null,
        archivedAt: '2026-08-01T00:00:00.000Z',
        status: 'archived',
        statusChangedAt: '2026-08-01T00:00:00.000Z',
        statusChangedBy: currentUser.id,
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
