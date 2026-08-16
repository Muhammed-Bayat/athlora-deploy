import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import type { AthleticsEvent } from '../../types';
import { EventsPage } from './EventsPage';

const eventApi = vi.hoisted(() => ({
  listEvents: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  cancelEvent: vi.fn(),
}));
const participantApi = vi.hoisted(() => ({
  listEventParticipants: vi.fn(),
}));

vi.mock('../../api/events', () => eventApi);
vi.mock('../../api/participants', () => participantApi);

const TODAY = '2026-08-16';
const CITY_ID = '11111111-1111-4111-8111-111111111111';
const TRAINING_ID = '22222222-2222-4222-8222-222222222222';
const PAST_ID = '33333333-3333-4333-8333-333333333333';
const CANCELLED_ID = '44444444-4444-4444-8444-444444444444';

function event(overrides: Partial<AthleticsEvent> = {}): AthleticsEvent {
  return {
    id: CITY_ID,
    createdBy: '55555555-5555-4555-8555-555555555555',
    type: 'competition',
    discipline: '100m',
    title: 'City Sprint Meet',
    date: '2026-09-01',
    time: '09:30:00',
    locationName: 'Central Stadium',
    latitude: -26.2041,
    longitude: 28.0473,
    status: 'scheduled',
    createdAt: '2026-08-16T10:00:00.000Z',
    updatedAt: '2026-08-16T10:00:00.000Z',
    ...overrides,
  };
}

const city = event();
const training = event({
  id: TRAINING_ID,
  type: 'training',
  title: 'Acceleration Session',
  date: '2026-08-20',
  time: null,
  locationName: null,
  latitude: null,
  longitude: null,
  status: 'in_progress',
});
const past = event({
  id: PAST_ID,
  title: 'August Time Trial',
  date: '2026-08-10',
  status: 'completed',
});
const cancelled = event({
  id: CANCELLED_ID,
  title: 'Cancelled Invitational',
  date: '2026-09-02',
  status: 'cancelled',
});

beforeEach(() => {
  vi.clearAllMocks();
  eventApi.listEvents.mockResolvedValue({
    data: [past, cancelled, city, training],
    meta: { count: 4 },
  });
  participantApi.listEventParticipants.mockResolvedValue({ data: [], meta: { count: 2 } });
});

function renderPage(props: Partial<React.ComponentProps<typeof EventsPage>> = {}) {
  return render(<EventsPage today={TODAY} {...props} />);
}

async function openDetail(user: ReturnType<typeof userEvent.setup>, title = 'City Sprint Meet') {
  await user.click(await screen.findByRole('button', { name: new RegExp(title, 'i') }));
  return screen.getByRole('dialog', { name: title });
}

describe('EventsPage', () => {
  it('shows loading and then renders upcoming API events in stable order', async () => {
    let resolveList!: (value: { data: AthleticsEvent[]; meta: { count: number } }) => void;
    eventApi.listEvents.mockReturnValue(new Promise((resolve) => { resolveList = resolve; }));
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Loading events');
    expect(screen.getByRole('button', { name: 'Add event' })).toBeDisabled();
    resolveList({ data: [cancelled, city, training], meta: { count: 3 } });

    const cards = await screen.findAllByRole('button', { name: /Session|Meet|Invitational/ });
    expect(cards.map((card) => card.textContent)).toEqual([
      expect.stringContaining('Acceleration Session'),
      expect.stringContaining('City Sprint Meet'),
      expect.stringContaining('Cancelled Invitational'),
    ]);
  });

  it('shows an API error and retries', async () => {
    eventApi.listEvents
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline'))
      .mockResolvedValueOnce({ data: [city], meta: { count: 1 } });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Events unavailable' })).toBeInTheDocument();
    expect(screen.getByText(/could not reach Athlora/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: /City Sprint Meet/ })).toBeInTheDocument();
  });

  it('distinguishes global empty and filtered-empty states', async () => {
    eventApi.listEvents.mockResolvedValueOnce({ data: [], meta: { count: 0 } });
    const user = userEvent.setup();
    const { unmount } = renderPage();
    expect(await screen.findByText('No events yet')).toBeInTheDocument();
    unmount();

    eventApi.listEvents.mockResolvedValueOnce({ data: [city], meta: { count: 1 } });
    renderPage();
    await screen.findByRole('button', { name: /City Sprint Meet/ });
    await user.selectOptions(screen.getByLabelText('Filter by event type'), 'training');
    expect(await screen.findByText('No events match your filters')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('button', { name: /City Sprint Meet/ })).toBeInTheDocument();
  });

  it('filters by date group, type, and actual lifecycle status', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole('button', { name: /Acceleration Session/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /August Time Trial/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All' }));
    await user.selectOptions(screen.getByLabelText('Filter by event status'), 'completed');
    expect(screen.getByRole('button', { name: /August Time Trial/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /City Sprint Meet/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filter by event status'), '');
    await user.selectOptions(screen.getByLabelText('Filter by event type'), 'training');
    expect(screen.getByRole('button', { name: /Acceleration Session/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /August Time Trial/ })).not.toBeInTheDocument();
  });

  it('validates and creates an event with an exact normalized payload', async () => {
    const created = event({ id: '66666666-6666-4666-8666-666666666666', title: 'County 100m' });
    eventApi.createEvent.mockResolvedValue(created);
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: /City Sprint Meet/ });
    await user.click(screen.getByRole('button', { name: 'Add event' }));
    const dialog = screen.getByRole('dialog', { name: 'Add event' });
    await user.click(within(dialog).getByRole('button', { name: 'Add event' }));
    expect(within(dialog).getByText('Event title is required.')).toBeInTheDocument();
    expect(within(dialog).getByText('Event date is required.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Event title'), '  County 100m  ');
    await user.type(within(dialog).getByLabelText('Date'), '2026-09-05');
    await user.type(within(dialog).getByLabelText(/Time/), '10:15');
    await user.type(within(dialog).getByLabelText(/Location/), '  North Track  ');
    await user.type(within(dialog).getByLabelText(/Latitude/), '-26.2');
    await user.type(within(dialog).getByLabelText(/Longitude/), '28.1');
    await user.click(within(dialog).getByRole('button', { name: 'Add event' }));

    await waitFor(() => expect(eventApi.createEvent).toHaveBeenCalledWith({
      type: 'competition',
      discipline: '100m',
      title: 'County 100m',
      date: '2026-09-05',
      time: '10:15',
      locationName: 'North Track',
      latitude: -26.2,
      longitude: 28.1,
      status: 'scheduled',
    }));
    expect(await screen.findByRole('button', { name: /County 100m/ })).toBeInTheDocument();
  });

  it('validates coordinate ranges and preserves backend-invalid drafts', async () => {
    eventApi.createEvent.mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed', {
        issues: [{ path: 'title', code: 'invalid_value', message: 'Title is unavailable' }],
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: /City Sprint Meet/ });
    await user.click(screen.getByRole('button', { name: 'Add event' }));
    const dialog = screen.getByRole('dialog', { name: 'Add event' });
    await user.type(within(dialog).getByLabelText('Event title'), 'Taken Meet');
    await user.type(within(dialog).getByLabelText('Date'), '2026-09-05');
    await user.type(within(dialog).getByLabelText(/Latitude/), '91');
    await user.click(within(dialog).getByRole('button', { name: 'Add event' }));
    expect(within(dialog).getByText('Latitude must be between -90 and 90.')).toBeInTheDocument();
    expect(eventApi.createEvent).not.toHaveBeenCalled();

    await user.clear(within(dialog).getByLabelText(/Latitude/));
    await user.click(within(dialog).getByRole('button', { name: 'Add event' }));
    expect(await within(dialog).findByText('Title is unavailable')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Event title')).toHaveValue('Taken Meet');
  });

  it('edits with a full replacement while preserving lifecycle status', async () => {
    const updated = event({ title: 'City Sprint Final', locationName: null });
    eventApi.updateEvent.mockResolvedValue(updated);
    const user = userEvent.setup();
    renderPage();
    const detail = await openDetail(user);
    await user.click(within(detail).getByRole('button', { name: 'Edit event' }));
    const editor = screen.getByRole('dialog', { name: 'Edit event' });
    const title = within(editor).getByLabelText('Event title');
    await user.clear(title);
    await user.type(title, 'City Sprint Final');
    await user.clear(within(editor).getByLabelText(/Location/));
    await user.click(within(editor).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(eventApi.updateEvent).toHaveBeenCalledWith(CITY_ID, {
      type: 'competition', discipline: '100m', title: 'City Sprint Final', date: '2026-09-01',
      time: '09:30:00', locationName: null, latitude: -26.2041, longitude: 28.0473,
      status: 'scheduled',
    }));
    expect(await screen.findByRole('button', { name: /City Sprint Final/ })).toBeInTheDocument();
  });

  it('shows event metadata and assigned-athlete count in detail', async () => {
    const user = userEvent.setup();
    renderPage();
    const detail = await openDetail(user);

    expect(detail).toHaveTextContent('Competition');
    expect(detail).toHaveTextContent('Scheduled');
    expect(detail).toHaveTextContent('100m');
    expect(detail).toHaveTextContent('Central Stadium');
    await waitFor(() => expect(detail).toHaveTextContent('Assigned athletes2'));
    expect(participantApi.listEventParticipants).toHaveBeenCalledWith(CITY_ID);
  });

  it('starts and completes events using full replacement payloads', async () => {
    eventApi.updateEvent
      .mockResolvedValueOnce({ ...city, status: 'in_progress' })
      .mockResolvedValueOnce({ ...training, status: 'completed' });
    const user = userEvent.setup();
    renderPage();
    let detail = await openDetail(user);
    await user.click(within(detail).getByRole('button', { name: 'Start event' }));
    let confirmation = screen.getByRole('dialog', { name: 'Start event' });
    await user.click(within(confirmation).getByRole('button', { name: 'Start event' }));
    await waitFor(() => expect(eventApi.updateEvent).toHaveBeenCalledWith(CITY_ID, {
      type: 'competition', discipline: '100m', title: city.title, date: city.date,
      time: city.time, locationName: city.locationName, latitude: city.latitude,
      longitude: city.longitude, status: 'in_progress',
    }));

    await user.click(within(screen.getByRole('dialog', { name: city.title })).getByRole('button', { name: 'Close' }));
    detail = await openDetail(user, training.title);
    expect(within(detail).queryByRole('button', { name: 'Start event' })).not.toBeInTheDocument();
    await user.click(within(detail).getByRole('button', { name: 'Mark completed' }));
    confirmation = screen.getByRole('dialog', { name: 'Complete event' });
    await user.click(within(confirmation).getByRole('button', { name: 'Mark completed' }));
    await waitFor(() => expect(eventApi.updateEvent).toHaveBeenLastCalledWith(TRAINING_ID, expect.objectContaining({
      title: training.title,
      status: 'completed',
    })));
  });

  it('confirms cancellation, preserves the card, and removes invalid lifecycle actions', async () => {
    eventApi.cancelEvent.mockResolvedValue({ ...city, status: 'cancelled' });
    const user = userEvent.setup();
    renderPage();
    const detail = await openDetail(user);
    await user.click(within(detail).getByRole('button', { name: 'Cancel event' }));
    const confirmation = screen.getByRole('dialog', { name: 'Cancel event' });
    expect(confirmation).toHaveTextContent('Participant assignments, timeline entries, and results are preserved');
    await user.click(within(confirmation).getByRole('button', { name: 'Cancel event' }));

    await waitFor(() => expect(eventApi.cancelEvent).toHaveBeenCalledWith(CITY_ID));
    const updatedDetail = screen.getByRole('dialog', { name: city.title });
    expect(updatedDetail).toHaveTextContent('Cancelled');
    expect(within(updatedDetail).queryByRole('button', { name: /Start|Mark completed|Cancel event/ })).not.toBeInTheDocument();
    await user.click(within(updatedDetail).getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: /City Sprint Meet/ })).toHaveTextContent('Cancelled');
  });

  it('keeps confirmation and data intact when lifecycle mutation fails', async () => {
    eventApi.cancelEvent.mockRejectedValue(
      new ApiError(409, 'INVALID_EVENT_TRANSITION', 'Event changed on another device'),
    );
    const user = userEvent.setup();
    renderPage();
    const detail = await openDetail(user);
    await user.click(within(detail).getByRole('button', { name: 'Cancel event' }));
    const confirmation = screen.getByRole('dialog', { name: 'Cancel event' });
    await user.click(within(confirmation).getByRole('button', { name: 'Cancel event' }));

    expect(await within(confirmation).findByRole('alert')).toHaveTextContent('Event changed on another device');
    expect(confirmation).toBeInTheDocument();
    expect(eventApi.listEvents).toHaveBeenCalledTimes(1);
  });

  it('offers an accessible calendar day view', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: /City Sprint Meet/ });
    await user.click(screen.getByRole('button', { name: 'Calendar view' }));
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await user.click(screen.getByRole('button', { name: /September 1, 2026, 1 event/i }));
    expect(screen.getByRole('button', { name: /City Sprint Meet/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Events on September 1, 2026/i })).toBeInTheDocument();
  });

  it('applies date filters to calendar markers', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: /City Sprint Meet/ });
    await user.click(screen.getByRole('button', { name: 'Calendar view' }));

    expect(screen.getByRole('button', { name: /August 10, 2026, 0 events/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('button', { name: /August 10, 2026, 1 event/i })).toBeInTheDocument();
  });

  it('reports only non-cancelled upcoming events to the console', async () => {
    const onUpcomingCountChange = vi.fn();
    renderPage({ onUpcomingCountChange });
    await screen.findByRole('button', { name: /City Sprint Meet/ });

    await waitFor(() => expect(onUpcomingCountChange).toHaveBeenLastCalledWith(2));
  });
});
