import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import type { Athlete, AthleticsEvent, EventParticipantSummary } from '../../types';
import { EventsPage } from './EventsPage';

const eventApi = vi.hoisted(() => ({
  listEvents: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  cancelEvent: vi.fn(),
}));
const participantApi = vi.hoisted(() => ({
  listEventParticipants: vi.fn(),
  addEventParticipant: vi.fn(),
  updateEventParticipant: vi.fn(),
  removeEventParticipant: vi.fn(),
}));
const athleteApi = vi.hoisted(() => ({
  listAthletes: vi.fn(),
}));

vi.mock('../../api/events', () => eventApi);
vi.mock('../../api/participants', () => participantApi);
vi.mock('../../api/athletes', () => athleteApi);

const TODAY = '2026-08-16';
const CITY_ID = '11111111-1111-4111-8111-111111111111';
const TRAINING_ID = '22222222-2222-4222-8222-222222222222';
const PAST_ID = '33333333-3333-4333-8333-333333333333';
const CANCELLED_ID = '44444444-4444-4444-8444-444444444444';
const ARI_ID = '66666666-6666-4666-8666-666666666666';
const BEA_ID = '77777777-7777-4777-8777-777777777777';

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

function athlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: ARI_ID,
    coachId: '55555555-5555-4555-8555-555555555555',
    name: 'Ari Runner',
    dob: null,
    gender: null,
    squad: 'Sprint',
    notes: null,
    archivedAt: null,
    createdAt: '2026-08-16T10:00:00.000Z',
    updatedAt: '2026-08-16T10:00:00.000Z',
    ...overrides,
  };
}

function participant(overrides: Partial<EventParticipantSummary> = {}): EventParticipantSummary {
  return {
    eventId: CITY_ID,
    athleteId: ARI_ID,
    rsvpStatus: 'pending',
    athlete: { id: ARI_ID, name: 'Ari Runner', squad: 'Sprint', archivedAt: null },
    ...overrides,
  };
}

const ari = athlete();
const bea = athlete({ id: BEA_ID, name: 'Bea Sprinter', squad: null });
const ariParticipant = participant();
const beaParticipant = participant({
  athleteId: BEA_ID,
  athlete: { id: BEA_ID, name: 'Bea Sprinter', squad: null, archivedAt: null },
});

beforeEach(() => {
  vi.clearAllMocks();
  eventApi.listEvents.mockResolvedValue({
    data: [past, cancelled, city, training],
    meta: { count: 4 },
  });
  participantApi.listEventParticipants.mockResolvedValue({ data: [ariParticipant], meta: { count: 1 } });
  athleteApi.listAthletes.mockResolvedValue({ data: [ari, bea], meta: { count: 2 } });
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

  it('shows event metadata and assigned-athlete details', async () => {
    const user = userEvent.setup();
    renderPage();
    const detail = await openDetail(user);

    expect(detail).toHaveTextContent('Competition');
    expect(detail).toHaveTextContent('Scheduled');
    expect(detail).toHaveTextContent('100m');
    expect(detail).toHaveTextContent('Central Stadium');
    expect(await within(detail).findByText('Ari Runner')).toBeInTheDocument();
    expect(detail).toHaveTextContent('Assigned athletes 1');
    expect(within(detail).getByLabelText('RSVP for Ari Runner')).toHaveValue('pending');
    expect(participantApi.listEventParticipants).toHaveBeenCalledWith(CITY_ID);
    expect(athleteApi.listAthletes).toHaveBeenCalledWith({ includeArchived: false });
  });

  it('assigns an active athlete with a pending RSVP', async () => {
    participantApi.addEventParticipant.mockResolvedValue(beaParticipant);
    const user = userEvent.setup();
    renderPage();
    const detail = await openDetail(user);
    const candidate = await within(detail).findByLabelText('Assign an active athlete');
    await user.selectOptions(candidate, BEA_ID);
    await user.click(within(detail).getByRole('button', { name: 'Assign athlete' }));

    await waitFor(() => expect(participantApi.addEventParticipant).toHaveBeenCalledWith(CITY_ID, BEA_ID));
    expect(await within(detail).findByLabelText('RSVP for Bea Sprinter')).toHaveValue('pending');
    expect(detail).toHaveTextContent('Bea Sprinter assigned with a pending RSVP.');
    expect(candidate).toHaveValue('');
    await waitFor(() => expect(within(detail).getByRole('region', { name: /Assigned athletes/ })).toHaveFocus());
  });

  it('waits for existing assignments before enabling new assignment', async () => {
    let resolveParticipants!: (value: { data: EventParticipantSummary[]; meta: { count: number } }) => void;
    participantApi.listEventParticipants.mockReturnValue(new Promise((resolve) => { resolveParticipants = resolve; }));
    const user = userEvent.setup();
    renderPage();
    const detail = await openDetail(user);
    const candidate = await within(detail).findByLabelText('Assign an active athlete');

    expect(candidate).toBeDisabled();
    expect(within(detail).getByRole('button', { name: 'Assign athlete' })).toBeDisabled();
    resolveParticipants({ data: [ariParticipant], meta: { count: 1 } });
    await waitFor(() => expect(candidate).toBeEnabled());
    expect(within(candidate).queryByRole('option', { name: /Ari Runner/ })).not.toBeInTheDocument();
  });

  it('replaces RSVP status with the exact participant request', async () => {
    participantApi.updateEventParticipant.mockResolvedValue({ ...ariParticipant, rsvpStatus: 'yes' });
    const user = userEvent.setup();
    renderPage();
    const detail = await openDetail(user);
    const rsvp = await within(detail).findByLabelText('RSVP for Ari Runner');
    await user.selectOptions(rsvp, 'yes');

    await waitFor(() => expect(participantApi.updateEventParticipant).toHaveBeenCalledWith(CITY_ID, ARI_ID, 'yes'));
    expect(rsvp).toHaveValue('yes');
    expect(detail).toHaveTextContent("Ari Runner's RSVP updated to attending.");
    await waitFor(() => expect(rsvp).toHaveFocus());
  });

  it('confirms removal and explains preserved event history', async () => {
    participantApi.removeEventParticipant.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    const detail = await openDetail(user);
    await within(detail).findByLabelText('RSVP for Ari Runner');
    await user.click(within(detail).getByRole('button', { name: 'Remove Ari Runner from event' }));

    expect(detail).toHaveTextContent('Existing timeline entries and results will be preserved.');
    expect(within(detail).getByRole('button', { name: 'Keep athlete' })).toHaveFocus();
    await user.click(within(detail).getByRole('button', { name: 'Remove athlete' }));
    await waitFor(() => expect(participantApi.removeEventParticipant).toHaveBeenCalledWith(CITY_ID, ARI_ID));
    expect(within(detail).queryByLabelText('RSVP for Ari Runner')).not.toBeInTheDocument();
    expect(detail).toHaveTextContent('Existing timeline entries and results were preserved.');
  });

  it('keeps the previous RSVP when an update fails', async () => {
    participantApi.updateEventParticipant.mockRejectedValue(new ApiError(409, 'CONFLICT', 'RSVP changed elsewhere'));
    const user = userEvent.setup();
    renderPage();
    const detail = await openDetail(user);
    const rsvp = await within(detail).findByLabelText('RSVP for Ari Runner');
    await user.selectOptions(rsvp, 'yes');

    expect(await within(detail).findByRole('alert')).toHaveTextContent('RSVP changed elsewhere');
    expect(rsvp).toHaveValue('pending');
  });

  it('keeps an assignment when removal fails', async () => {
    participantApi.removeEventParticipant.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'offline'));
    const user = userEvent.setup();
    renderPage();
    const detail = await openDetail(user);
    await within(detail).findByLabelText('RSVP for Ari Runner');
    await user.click(within(detail).getByRole('button', { name: 'Remove Ari Runner from event' }));
    await user.click(within(detail).getByRole('button', { name: 'Remove athlete' }));

    expect(await within(detail).findByText(/Could not reach Athlora/i)).toBeInTheDocument();
    expect(within(detail).getByLabelText('RSVP for Ari Runner')).toBeInTheDocument();
    expect(within(detail).getByRole('region', { name: /Remove Ari Runner/ })).toBeInTheDocument();
    await waitFor(() => expect(within(detail).getByRole('button', { name: 'Remove athlete' })).toHaveFocus());
  });

  it('blocks modal-changing actions while participant removal is pending', async () => {
    let resolveRemoval!: () => void;
    participantApi.removeEventParticipant.mockReturnValue(new Promise<void>((resolve) => { resolveRemoval = resolve; }));
    const user = userEvent.setup();
    renderPage();
    const detail = await openDetail(user);
    await within(detail).findByLabelText('RSVP for Ari Runner');
    await user.click(within(detail).getByRole('button', { name: 'Remove Ari Runner from event' }));
    await user.click(within(detail).getByRole('button', { name: 'Remove athlete' }));

    for (const name of ['Close', 'Edit event', 'Start event', 'Mark completed', 'Cancel event']) {
      expect(within(detail).getByRole('button', { name })).toBeDisabled();
    }
    resolveRemoval();
    await waitFor(() => expect(within(detail).getByRole('button', { name: 'Close' })).toBeEnabled());
  });

  it('retries assignment and active-roster loading independently', async () => {
    participantApi.listEventParticipants
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline'))
      .mockResolvedValueOnce({ data: [ariParticipant], meta: { count: 1 } });
    athleteApi.listAthletes
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline'))
      .mockResolvedValueOnce({ data: [ari, bea], meta: { count: 2 } });
    const user = userEvent.setup();
    renderPage();
    const detail = await openDetail(user);

    expect(await within(detail).findByText('Unavailable')).toBeInTheDocument();
    await user.click(await within(detail).findByRole('button', { name: 'Retry assignments' }));
    await user.click(within(detail).getByRole('button', { name: 'Retry roster' }));
    expect(await within(detail).findByLabelText('RSVP for Ari Runner')).toBeInTheDocument();
    expect(await within(detail).findByLabelText('Assign an active athlete')).toBeInTheDocument();
    expect(participantApi.listEventParticipants).toHaveBeenCalledTimes(2);
    expect(athleteApi.listAthletes).toHaveBeenCalledTimes(2);
  });

  it('keeps archived historical participants visible but out of assignment candidates', async () => {
    participantApi.listEventParticipants.mockResolvedValueOnce({
      data: [participant({ athlete: { ...ariParticipant.athlete, archivedAt: '2026-08-17T10:00:00.000Z' } })],
      meta: { count: 1 },
    });
    athleteApi.listAthletes.mockResolvedValueOnce({ data: [bea], meta: { count: 1 } });
    const user = userEvent.setup();
    renderPage();
    const detail = await openDetail(user);

    expect(await within(detail).findByText('Archived')).toBeInTheDocument();
    const candidate = within(detail).getByLabelText('Assign an active athlete');
    expect(within(candidate).queryByRole('option', { name: /Ari Runner/ })).not.toBeInTheDocument();
    expect(within(candidate).getByRole('option', { name: /Bea Sprinter/ })).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: /1 September 2026, 1 event/i }));
    expect(screen.getByRole('button', { name: /City Sprint Meet/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Events on 1 September 2026/i })).toBeInTheDocument();
  });

  it('applies date filters to calendar markers', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: /City Sprint Meet/ });
    await user.click(screen.getByRole('button', { name: 'Calendar view' }));

    expect(screen.getByRole('button', { name: /10 August 2026, 0 events/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('button', { name: /10 August 2026, 1 event/i })).toBeInTheDocument();
  });

  it('reports only non-cancelled upcoming events to the console', async () => {
    const onUpcomingCountChange = vi.fn();
    renderPage({ onUpcomingCountChange });
    await screen.findByRole('button', { name: /City Sprint Meet/ });

    await waitFor(() => expect(onUpcomingCountChange).toHaveBeenLastCalledWith(2));
  });
});
