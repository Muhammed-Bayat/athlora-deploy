import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import type { AthleticsEvent } from '../../types';
import { EventDetailPage } from './EventDetailPage';

const eventApi = vi.hoisted(() => ({ getEvent: vi.fn(), updateEvent: vi.fn(), cancelEvent: vi.fn(), archiveEvent: vi.fn(), unarchiveEvent: vi.fn() }));
const fixtureApi = vi.hoisted(() => ({ getGuestFixture: vi.fn() }));
const workspace = vi.hoisted(() => ({ role: 'coach', id: 'host-workspace' }));

vi.mock('../../api/events', () => eventApi);
vi.mock('../../api/fixtures', () => fixtureApi);
vi.mock('../auth/CurrentUserContext', () => ({ useCurrentUser: () => ({ id: 'coach-1', name: 'Coach Avery' }) }));
vi.mock('../auth/WorkspaceContext', () => ({ useWorkspace: () => ({ activeWorkspace: workspace }) }));
vi.mock('../realtime/useRealtimeRoom', () => ({ useRealtimeRoom: vi.fn() }));
vi.mock('./EventWeatherPanel', () => ({ EventWeatherPanel: () => <p>Weather forecast</p> }));
vi.mock('./VenuePreview', () => ({ VenuePreview: () => <p>Venue map</p> }));
vi.mock('./PublicLoggerPanel', () => ({ PublicLoggerPanel: () => <section aria-label="Public logger links">Public logger links</section> }));
vi.mock('./FixtureHostPanel', () => ({ FixtureHostPanel: () => <section aria-label="Host fixture controls">Host fixture controls</section> }));
vi.mock('./MeetRosterPanel', () => ({ MeetRosterPanel: ({ isGuest }: { isGuest: boolean }) => <section aria-label="Multi-discipline roster">{isGuest ? 'Guest discipline tabs' : 'Host discipline tabs'}</section> }));
vi.mock('./EventFinalResults', () => ({ EventFinalResults: () => <section aria-label="Event final results">Event final results</section> }));
vi.mock('./GuestRosterPanel', () => ({ GuestRosterPanel: ({ scheduled }: { scheduled: boolean }) => <section aria-label="Guest roster">Guest roster {scheduled ? 'editable' : 'read only'}</section> }));
vi.mock('../results/EventResultsSection', () => ({ EventResultsSection: () => <section aria-label="Event results">Event results</section> }));
vi.mock('../results/ResultCorrectionForm', () => ({ ResultCorrectionForm: () => null }));
vi.mock('./EventsPage', () => ({
  EventForm: ({ event, onSave }: { event: AthleticsEvent; onSave: (payload: object) => Promise<void> }) => <button onClick={() => void onSave({ ...event, title: 'Updated meet' })}>Save updated event</button>,
  ParticipantManager: ({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) => <button onClick={() => onBusyChange(true)}>Start roster update</button>,
  errorMessage: (error: unknown) => error instanceof Error ? error.message : 'Unexpected error',
  formattedDate: (date: string) => date,
  formattedStatus: (status: string) => status,
  formattedType: (type: string) => type,
  replacement: (event: AthleticsEvent, status: string) => ({ ...event, status }),
}));

const event: AthleticsEvent = {
  id: 'event-1', workspaceId: 'host-workspace', createdBy: 'coach-1', type: 'competition', discipline: '100m', title: 'City Sprint Meet',
  date: '2026-09-01', time: '09:30:00', locationName: 'Central Stadium', latitude: null, longitude: null,
  status: 'scheduled', archivedAt: null, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  workspace.id = 'host-workspace';
  workspace.role = 'coach';
  eventApi.getEvent.mockResolvedValue(event);
  fixtureApi.getGuestFixture.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Not a guest fixture'));
});

describe('EventDetailPage', () => {
  it('shows loading, explains a missing direct route, and retries successfully', async () => {
    let resolveEvent!: (value: AthleticsEvent) => void;
    eventApi.getEvent.mockReturnValueOnce(new Promise((resolve) => { resolveEvent = resolve; }));
    const user = userEvent.setup();
    const onBack = vi.fn();
    const { unmount } = render(<EventDetailPage eventId={event.id} onBack={onBack} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading event...');
    resolveEvent(event);
    expect(await screen.findByRole('heading', { name: event.title })).toBeInTheDocument();

    unmount();
    eventApi.getEvent.mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'Missing'));
    render(<EventDetailPage eventId="missing" onBack={onBack} />);
    expect(await screen.findByRole('heading', { name: 'Event not found' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: event.title })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to events' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('lets the host edit and start a shared fixture, then reports the updated calendar state', async () => {
    eventApi.updateEvent
      .mockResolvedValueOnce({ ...event, title: 'Updated meet' })
      .mockResolvedValueOnce({ ...event, title: 'Updated meet', status: 'in_progress' });
    const onEventUpdated = vi.fn();
    const user = userEvent.setup();
    render(<EventDetailPage eventId={event.id} initialEvent={event} onBack={vi.fn()} onEventUpdated={onEventUpdated} />);

    expect(await screen.findByRole('button', { name: 'Edit event' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit event' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Edit event' })).getByRole('button', { name: 'Save updated event' }));
    expect(await screen.findByText('Updated meet updated.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start event' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Start event' })).getByRole('button', { name: 'Start event' }));
    await waitFor(() => expect(eventApi.updateEvent).toHaveBeenLastCalledWith(event.id, expect.objectContaining({ status: 'in_progress' })));
    expect(await screen.findByText('Updated meet is now live.')).toBeInTheDocument();
    expect(onEventUpdated).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'in_progress' }));
  });

  it('keeps the start dialog open and explains pending RSVPs when the meet cannot start', async () => {
    eventApi.updateEvent.mockRejectedValue(new ApiError(409, 'FIXTURE_PARTICIPANT_RSVPS_PENDING', 'Athletes in Speed Demons still have pending or maybe RSVPs'));
    const onEventUpdated = vi.fn();
    const user = userEvent.setup();
    render(<EventDetailPage eventId={event.id} initialEvent={event} onBack={vi.fn()} onEventUpdated={onEventUpdated} />);

    await user.click(await screen.findByRole('button', { name: 'Start event' }));
    const dialog = screen.getByRole('dialog', { name: 'Start event' });
    await user.click(within(dialog).getByRole('button', { name: 'Start event' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Athletes in Speed Demons still have pending or maybe RSVPs');
    expect(screen.queryByText(/is now live/)).not.toBeInTheDocument();
    expect(onEventUpdated).not.toHaveBeenCalled();
    expect(eventApi.updateEvent).toHaveBeenCalledWith(event.id, expect.objectContaining({ status: 'in_progress' }));
  });

  it('archives an event in one click without a confirmation dialog', async () => {
    eventApi.archiveEvent.mockResolvedValue({ ...event, archivedAt: '2026-10-01T09:00:00.000Z' });
    const onEventUpdated = vi.fn();
    const user = userEvent.setup();
    render(<EventDetailPage eventId={event.id} initialEvent={event} onBack={vi.fn()} onEventUpdated={onEventUpdated} />);

    await user.click(await screen.findByRole('button', { name: 'Archive event' }));

    await waitFor(() => expect(eventApi.archiveEvent).toHaveBeenCalledWith(event.id));
    expect(screen.queryByRole('dialog', { name: 'Are you sure?' })).not.toBeInTheDocument();
    expect(await screen.findByText('City Sprint Meet archived. Find it under the Archived filter.')).toBeInTheDocument();
    expect(onEventUpdated).toHaveBeenLastCalledWith(expect.objectContaining({ archivedAt: '2026-10-01T09:00:00.000Z' }));
  });

  it('replaces lifecycle controls with Unarchive for an archived event', async () => {
    eventApi.unarchiveEvent.mockResolvedValue({ ...event, archivedAt: null });
    const user = userEvent.setup();
    const archivedEvent: AthleticsEvent = { ...event, status: 'completed', archivedAt: '2026-10-01T09:00:00.000Z' };
    render(<EventDetailPage eventId={event.id} initialEvent={archivedEvent} onBack={vi.fn()} />);

    expect(await screen.findByText('Archived')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit event' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark completed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel event' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive event' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Unarchive' }));

    await waitFor(() => expect(eventApi.unarchiveEvent).toHaveBeenCalledWith(event.id));
    expect(screen.queryByRole('dialog', { name: 'Are you sure?' })).not.toBeInTheDocument();
    expect(await screen.findByText('City Sprint Meet is back on the active schedule.')).toBeInTheDocument();
  });

  it('shows the guest roster and hides host-only controls from a guest workspace on a shared fixture', async () => {
    workspace.id = 'guest-workspace';
    fixtureApi.getGuestFixture.mockResolvedValue({});
    render(<EventDetailPage eventId={event.id} initialEvent={event} onBack={vi.fn()} />);

    expect(await screen.findByRole('region', { name: 'Guest roster' })).toHaveTextContent('editable');
    expect(screen.queryByRole('region', { name: 'Host fixture controls' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit event' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start event' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark completed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel event' })).not.toBeInTheDocument();
  });

  it('puts fixture invitations and the guest-owned tabbed roster on a multi-discipline meet', async () => {
    const multiDisciplineEvent = { ...event, discipline: null, title: 'Field day' };
    render(<EventDetailPage eventId={event.id} initialEvent={multiDisciplineEvent} onBack={vi.fn()} />);

    expect(await screen.findByRole('region', { name: 'Host fixture controls' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Multi-discipline roster' })).toHaveTextContent('Host discipline tabs');

    workspace.id = 'guest-workspace';
    fixtureApi.getGuestFixture.mockResolvedValue({});
    render(<EventDetailPage eventId={event.id} initialEvent={multiDisciplineEvent} onBack={vi.fn()} />);

    await waitFor(() => expect(screen.getAllByRole('region', { name: 'Multi-discipline roster' })[1]).toHaveTextContent('Guest discipline tabs'));
    await waitFor(() => expect(screen.queryAllByRole('region', { name: 'Host fixture controls' })).toHaveLength(1));
  });

  it('shows final results instead of the session live logger in both team event views', async () => {
    const multiDisciplineEvent = { ...event, discipline: null };
    render(<EventDetailPage eventId={event.id} initialEvent={multiDisciplineEvent} onBack={vi.fn()} />);

    await screen.findByRole('region', { name: 'Multi-discipline roster' });
    expect(screen.getByRole('region', { name: 'Event final results' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Session live logger' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Public logger links' })).not.toBeInTheDocument();

    workspace.id = 'guest-workspace';
    fixtureApi.getGuestFixture.mockResolvedValue({});
    render(<EventDetailPage eventId={event.id} initialEvent={multiDisciplineEvent} onBack={vi.fn()} />);

    await waitFor(() => expect(screen.getAllByRole('region', { name: 'Multi-discipline roster' })).toHaveLength(2));
    expect(screen.getAllByRole('region', { name: 'Event final results' })).toHaveLength(2);
    expect(screen.queryByRole('region', { name: 'Public logger links' })).not.toBeInTheDocument();
  });

  it('shows lifecycle controls to the host workspace on a training event', async () => {
    const trainingEvent = { ...event, type: 'training' as const };
    render(<EventDetailPage eventId={event.id} initialEvent={trainingEvent} onBack={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'Start event' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel event' })).toBeInTheDocument();
  });

  it('detects the guest workspace on a training meet so roster edits use the fixture guest API', async () => {
    const trainingMeet = { ...event, type: 'training' as const, discipline: null };
    workspace.id = 'guest-workspace';
    fixtureApi.getGuestFixture.mockResolvedValue({});
    render(<EventDetailPage eventId={event.id} initialEvent={trainingMeet} onBack={vi.fn()} />);

    expect(await screen.findByRole('region', { name: 'Multi-discipline roster' })).toHaveTextContent('Guest discipline tabs');
  });

  it('disables lifecycle controls and reports busy work from the participant panel', async () => {
    const onBusyChange = vi.fn();
    const user = userEvent.setup();
    render(<EventDetailPage eventId={event.id} initialEvent={event} onBack={vi.fn()} onBusyChange={onBusyChange} />);

    await user.click(screen.getByRole('button', { name: 'Start roster update' }));
    expect(screen.getByRole('button', { name: 'Edit event' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start event' })).toBeDisabled();
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
  });
});
