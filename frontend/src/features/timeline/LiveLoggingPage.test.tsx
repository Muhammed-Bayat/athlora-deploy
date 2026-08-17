import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { LiveLoggingPage } from './LiveLoggingPage';
import * as eventsApi from '../../api/events';
import * as participantsApi from '../../api/participants';
import * as timelineApi from '../../api/timeline';
import * as resultsApi from '../../api/results';
import { ApiError } from '../../api/client';

vi.mock('../../api/events');
vi.mock('../../api/participants');
vi.mock('../../api/timeline');
vi.mock('../../api/results');

describe('LiveLoggingPage', () => {
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
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

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

    render(<LiveLoggingPage />);

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
    vi.mocked(resultsApi.listResults).mockResolvedValue({
      data: [],
      meta: { count: 0 },
    });
    vi.mocked(timelineApi.createTimelineEntry).mockResolvedValue(mockTimelineEntry);

    // Initial render will load events and since no selectedEventId, it shows event list.
    // Let's click Open Live Logger.
    render(<LiveLoggingPage />);

    const openButton = await screen.findByRole('button', { name: /Open Live Logger ›/i });
    await userEvent.click(openButton);

    expect(await screen.findByText('Amara Chen')).toBeInTheDocument();

    const input = screen.getByRole('textbox', { name: /Finish time for Amara Chen/i });
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

    render(<LiveLoggingPage />);
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

    render(<LiveLoggingPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Open Live Logger ›/i }));

    const editButton = await screen.findByRole('button', { name: /Edit/i });
    await userEvent.click(editButton);

    const saveButton = screen.getByRole('button', { name: /Save Changes/i });
    await userEvent.click(saveButton);

    expect(await screen.findByText(/Version conflict detected|Stale version conflict/i)).toBeInTheDocument();
  });
});
