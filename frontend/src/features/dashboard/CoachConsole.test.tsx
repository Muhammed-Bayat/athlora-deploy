import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoachConsole } from './CoachConsole';
import { ApiError } from '../../api/client';

const weatherApi = vi.hoisted(() => ({ getCurrentWeather: vi.fn() }));

vi.mock('../../api/weather', () => weatherApi);

vi.mock('./DashboardPage', () => ({
  DashboardPage: ({
    onOpenAthlete,
    onOpenEvent,
    onResumeLogging,
  }: {
    onOpenAthlete: (id: string) => void;
    onOpenEvent: (id: string) => void;
    onResumeLogging: (id: string) => void;
  }) => <div>
    <button type="button" onClick={() => onOpenAthlete('athlete-42')}>Open athlete record</button>
    <button type="button" onClick={() => onOpenEvent('event-42')}>Open event record</button>
    <button type="button" onClick={() => onResumeLogging('live-42')}>Resume event logging</button>
  </div>,
}));

vi.mock('../athletes/AthletesPage', () => ({
  AthletesPage: ({ initialAthleteId, onOpenAthlete }: { initialAthleteId?: string; onOpenAthlete?: (id: string) => void }) => <>
    <p>Athlete target: {initialAthleteId ?? 'none'}</p>
    {onOpenAthlete && <button type="button" onClick={() => onOpenAthlete('athlete-42')}>Select athlete from roster</button>}
  </>,
}));

vi.mock('../events/EventsPage', () => ({
  EventsPage: () => <p>Events list</p>,
}));
vi.mock('../events/EventDetailPage', () => ({ EventDetailPage: ({ eventId }: { eventId: string }) => <p>Event target: {eventId}</p> }));

vi.mock('../timeline/LiveLoggingPage', () => ({
  LiveLoggingPage: ({ initialEventId, onOpenEvent }: { initialEventId?: string; onOpenEvent?: (id: string) => void }) => <>
    <p>Live target: {initialEventId ?? 'none'}</p>
    {onOpenEvent && <button type="button" onClick={() => onOpenEvent('live-42')}>Select event from live logger</button>}
  </>,
}));

vi.mock('../auth/AuthPage', () => ({ AuthPage: () => <p>Account view</p> }));

vi.mock('../comparison/ComparisonPage', () => ({ ComparisonPage: () => <p>Comparison view</p> }));

function RouteLocation() {
  const location = useLocation();
  return <output data-testid="route-location">{`${location.pathname}${location.search}`}</output>;
}

function renderConsole(initialEntry = '/console') {
  return render(<MemoryRouter initialEntries={[initialEntry]}><CoachConsole /><RouteLocation /></MemoryRouter>);
}

function navigationItem(navigationName: string, destination: string) {
  const name = navigationName === 'Mobile coach console' && destination === 'Dashboard'
    ? 'Home'
    : navigationName === 'Mobile coach console' && destination === 'Live Logger'
      ? 'Live'
    : new RegExp(`^${destination}(?:\\s|$)`);
  return within(screen.getByRole('navigation', { name: navigationName })).getByRole('button', { name });
}

describe('CoachConsole dashboard navigation', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
  });

  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (success: PositionCallback) => success({ coords: { latitude: -26.2041, longitude: 28.0473 } } as GeolocationPosition) },
    });
    vi.mocked(weatherApi.getCurrentWeather).mockRejectedValue(new Error('Weather service unavailable'));
  });

  it('opens exact athlete, event, and live logging destinations', async () => {
    const user = userEvent.setup();
    renderConsole();

    expect(screen.queryByRole('button', { name: 'Stats' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open athlete record' }));
    expect(screen.getByText('Athlete target: athlete-42')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /athletes/i })[0]).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getAllByRole('button', { name: /dashboard/i })[0]);
    await user.click(screen.getByRole('button', { name: 'Open event record' }));
    expect(screen.getByText('Event target: event-42')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /events/i })[0]).toHaveAttribute('aria-current', 'page');
    await user.click(screen.getAllByRole('button', { name: /events/i })[0]);
    expect(screen.getByText('Events list')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /dashboard/i })[0]);
    await user.click(screen.getByRole('button', { name: 'Resume event logging' }));
    expect(screen.getByText('Live target: live-42')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /live logger/i })[0]).toHaveAttribute('aria-current', 'page');
    await user.click(screen.getAllByRole('button', { name: /live logger/i })[0]);
    expect(screen.getByText('Live target: none')).toBeInTheDocument();
  });

  it('clears a targeted record when standard navigation is used', async () => {
    const user = userEvent.setup();
    renderConsole();

    await user.click(screen.getByRole('button', { name: 'Open athlete record' }));
    expect(screen.getByText('Athlete target: athlete-42')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /athletes/i })[0]);
    expect(screen.getByText('Athlete target: none')).toBeInTheDocument();
  });

  it('routes roster and live logger selections before returning through their tabs', async () => {
    const user = userEvent.setup();
    renderConsole('/console/athletes');

    await user.click(screen.getByRole('button', { name: 'Select athlete from roster' }));
    expect(screen.getByTestId('route-location')).toHaveTextContent('/console/athletes/athlete-42');

    await user.click(navigationItem('Coach console', 'Athletes'));
    expect(screen.getByTestId('route-location')).toHaveTextContent('/console/athletes');
    expect(screen.getByText('Athlete target: none')).toBeInTheDocument();

    await user.click(navigationItem('Coach console', 'Live Logger'));
    await user.click(screen.getByRole('button', { name: 'Select event from live logger' }));
    expect(screen.getByTestId('route-location')).toHaveTextContent('/console/live/live-42');

    await user.click(navigationItem('Coach console', 'Live Logger'));
    expect(screen.getByTestId('route-location')).toHaveTextContent('/console/live');
    expect(screen.getByText('Live target: none')).toBeInTheDocument();
  });

  it.each([
    ['Dashboard', '/console'],
    ['Athletes', '/console/athletes'],
    ['Compare', '/console/comparison'],
    ['Events', '/console/events'],
    ['Fixtures', '/console/fixtures'],
    ['Live Logger', '/console/live'],
    ['Account', '/console/account'],
  ])('navigates every desktop tab to its canonical route', async (destination, expectedPath) => {
    const user = userEvent.setup();
    renderConsole('/console/athletes/athlete-42');

    await user.click(navigationItem('Coach console', destination));

    expect(screen.getByTestId('route-location')).toHaveTextContent(expectedPath);
  });

  it.each([
    ['Dashboard', '/console'],
    ['Athletes', '/console/athletes'],
    ['Compare', '/console/comparison'],
    ['Events', '/console/events'],
    ['Fixtures', '/console/fixtures'],
    ['Live Logger', '/console/live'],
    ['Account', '/console/account'],
  ])('navigates every mobile tab to its canonical route', async (destination, expectedPath) => {
    const user = userEvent.setup();
    renderConsole('/console/athletes/athlete-42');

    await user.click(navigationItem('Mobile coach console', destination));

    expect(screen.getByTestId('route-location')).toHaveTextContent(expectedPath);
  });

  it.each([
    ['/console/athletes/athlete-42', 'Athletes', 'Athlete target: none'],
    ['/console/events/event-42?status=scheduled&dateFrom=2026-09-01', 'Events', 'Events list'],
    ['/console/live/live-42', 'Live Logger', 'Live target: none'],
  ])('returns a detail route to its list through the desktop navigation', async (initialEntry, destination, expectedContent) => {
    const user = userEvent.setup();
    renderConsole(initialEntry);

    await user.click(navigationItem('Coach console', destination));

    expect(screen.getByText(expectedContent)).toBeInTheDocument();
    expect(screen.getByTestId('route-location')).toHaveTextContent(
      destination === 'Events' ? '/console/events?status=scheduled&dateFrom=2026-09-01' : `/console/${destination === 'Athletes' ? 'athletes' : 'live'}`,
    );
  });

  it.each([
    ['/console/athletes/athlete-42', 'Athletes', 'Athlete target: none'],
    ['/console/events/event-42?status=scheduled&dateFrom=2026-09-01', 'Events', 'Events list'],
    ['/console/live/live-42', 'Live Logger', 'Live target: none'],
  ])('returns a detail route to its list through the mobile navigation', async (initialEntry, destination, expectedContent) => {
    const user = userEvent.setup();
    renderConsole(initialEntry);

    await user.click(navigationItem('Mobile coach console', destination));

    expect(screen.getByText(expectedContent)).toBeInTheDocument();
    expect(screen.getByTestId('route-location')).toHaveTextContent(
      destination === 'Events' ? '/console/events?status=scheduled&dateFrom=2026-09-01' : `/console/${destination === 'Athletes' ? 'athletes' : 'live'}`,
    );
  });

  it('does not navigate or scroll when the current list destination is selected again', async () => {
    const user = userEvent.setup();
    renderConsole('/console/events?status=scheduled');
    vi.mocked(window.scrollTo).mockClear();

    await user.click(within(screen.getByRole('navigation', { name: 'Coach console' })).getByRole('button', { name: 'Events' }));

    expect(screen.getByTestId('route-location')).toHaveTextContent('/console/events?status=scheduled');
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('shows current live weather from the resolved device location', async () => {
    weatherApi.getCurrentWeather.mockResolvedValue({
      timezone: 'Africa/Johannesburg', temperatureC: 24.8, apparentTemperatureC: 25.1,
      humidityPercent: 62, isDay: true, precipitationMm: 0, weatherCode: 2, windSpeedKmh: 12.4,
    });

    renderConsole();

    expect(await screen.findByText('Partly cloudy · 25°')).toBeInTheDocument();
    expect(weatherApi.getCurrentWeather).toHaveBeenCalledWith(-26.2041, 28.0473);
  });

  it('explains when authentication prevents the live weather request', async () => {
    weatherApi.getCurrentWeather.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Missing token'));

    renderConsole();

    const message = await screen.findByText('Weather unavailable');
    expect(message.parentElement).toHaveAttribute('title', 'Sign in for live weather.');
  });

  it('explains when the live weather provider is unavailable', async () => {
    renderConsole();

    const message = await screen.findByText('Weather unavailable');
    expect(message.parentElement).toHaveAttribute('title', 'Weather unavailable. Check location permissions or try again.');
  });
});
