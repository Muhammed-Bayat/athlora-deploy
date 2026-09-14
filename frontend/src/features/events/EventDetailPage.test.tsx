import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import type { AthleticsEvent, FixtureTeamRoster } from '../../types';
import { EventDetailPage } from './EventDetailPage';

const eventApi = vi.hoisted(() => ({ getEvent: vi.fn(), updateEvent: vi.fn(), cancelEvent: vi.fn() }));
const fixtureApi = vi.hoisted(() => ({ listFixtureRosters: vi.fn(), getGuestFixture: vi.fn() }));
const workspace = vi.hoisted(() => ({ role: 'coach', id: 'host-workspace' }));

vi.mock('../../api/events', () => eventApi);
vi.mock('../../api/fixtures', () => fixtureApi);
vi.mock('../auth/CurrentUserContext', () => ({ useCurrentUser: () => ({ id: 'coach-1', name: 'Coach Avery' }) }));
vi.mock('../auth/WorkspaceContext', () => ({ useWorkspace: () => ({ activeWorkspace: workspace }) }));
vi.mock('../realtime/useRealtimeRoom', () => ({ useRealtimeRoom: vi.fn() }));
vi.mock('./EventWeatherPanel', () => ({ EventWeatherPanel: () => <p>Weather forecast</p> }));
vi.mock('./VenuePreview', () => ({ VenuePreview: () => <p>Venue map</p> }));
vi.mock('./FixtureHostPanel', () => ({ FixtureHostPanel: () => <section aria-label="Host fixture controls">Host fixture controls</section> }));
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
  id: 'event-1', createdBy: 'coach-1', type: 'competition', discipline: '100m', title: 'City Sprint Meet',
  date: '2026-09-01', time: '09:30:00', locationName: 'Central Stadium', latitude: null, longitude: null,
  status: 'scheduled', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
};

const hostAndGuest: FixtureTeamRoster[] = [
  { team: { workspaceId: 'host-workspace', workspaceName: 'Host', status: 'accepted', acceptedRevision: 1, withdrawnAt: null }, participants: [] },
  { team: { workspaceId: 'guest-workspace', workspaceName: 'Guest', status: 'accepted', acceptedRevision: 1, withdrawnAt: null }, participants: [] },
];

beforeEach(() => {
  vi.clearAllMocks();
  workspace.id = 'host-workspace';
  workspace.role = 'coach';
  eventApi.getEvent.mockResolvedValue(event);
  fixtureApi.listFixtureRosters.mockResolvedValue({ data: [], meta: { count: 0 } });
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
    fixtureApi.listFixtureRosters.mockResolvedValue({ data: hostAndGuest, meta: { count: 2 } });
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

  it('shows the guest roster and prevents a guest workspace from operating a shared fixture', async () => {
    workspace.id = 'guest-workspace';
    fixtureApi.listFixtureRosters.mockResolvedValue({ data: hostAndGuest, meta: { count: 2 } });
    fixtureApi.getGuestFixture.mockResolvedValue({});
    render(<EventDetailPage eventId={event.id} initialEvent={event} onBack={vi.fn()} />);

    expect(await screen.findByRole('region', { name: 'Guest roster' })).toHaveTextContent('editable');
    expect(screen.queryByRole('region', { name: 'Host fixture controls' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit event' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start event' })).toBeInTheDocument();
  });

  it('hides lifecycle controls when shared-fixture roster lookup fails for a competition', async () => {
    fixtureApi.listFixtureRosters.mockRejectedValue(new Error('offline'));
    render(<EventDetailPage eventId={event.id} initialEvent={event} onBack={vi.fn()} />);

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Start event' })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Cancel event' })).not.toBeInTheDocument();
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
