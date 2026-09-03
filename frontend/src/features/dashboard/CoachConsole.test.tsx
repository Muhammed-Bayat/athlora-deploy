import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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
  AthletesPage: ({ initialAthleteId }: { initialAthleteId?: string }) => <p>Athlete target: {initialAthleteId ?? 'none'}</p>,
}));

vi.mock('../events/EventsPage', () => ({
  EventsPage: () => <p>Events list</p>,
}));
vi.mock('../events/EventDetailPage', () => ({ EventDetailPage: ({ eventId }: { eventId: string }) => <p>Event target: {eventId}</p> }));

vi.mock('../timeline/LiveLoggingPage', () => ({
  LiveLoggingPage: ({ initialEventId }: { initialEventId?: string }) => <p>Live target: {initialEventId ?? 'none'}</p>,
}));

vi.mock('../auth/AuthPage', () => ({ AuthPage: () => <p>Account view</p> }));

vi.mock('../comparison/ComparisonPage', () => ({ ComparisonPage: () => <p>Comparison view</p> }));

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
    render(<MemoryRouter initialEntries={['/console']}><CoachConsole /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'Open athlete record' }));
    expect(screen.getByText('Athlete target: athlete-42')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /athletes/i })[0]).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getAllByRole('button', { name: /dashboard/i })[0]);
    await user.click(screen.getByRole('button', { name: 'Open event record' }));
    expect(screen.getByText('Event target: event-42')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /events/i })[0]).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getAllByRole('button', { name: /dashboard/i })[0]);
    await user.click(screen.getByRole('button', { name: 'Resume event logging' }));
    expect(screen.getByText('Live target: live-42')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /live logger/i })[0]).toHaveAttribute('aria-current', 'page');
  });

  it('clears a targeted record when standard navigation is used', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/console']}><CoachConsole /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'Open athlete record' }));
    expect(screen.getByText('Athlete target: athlete-42')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /athletes/i })[0]);
    expect(screen.getByText('Athlete target: none')).toBeInTheDocument();
  });

  it('shows current live weather from the resolved device location', async () => {
    weatherApi.getCurrentWeather.mockResolvedValue({
      timezone: 'Africa/Johannesburg', temperatureC: 24.8, apparentTemperatureC: 25.1,
      humidityPercent: 62, isDay: true, precipitationMm: 0, weatherCode: 2, windSpeedKmh: 12.4,
    });

    render(<MemoryRouter initialEntries={['/console']}><CoachConsole /></MemoryRouter>);

    expect(await screen.findByText('Partly cloudy · 25°')).toBeInTheDocument();
    expect(weatherApi.getCurrentWeather).toHaveBeenCalledWith(-26.2041, 28.0473);
  });

  it('explains when authentication prevents the live weather request', async () => {
    weatherApi.getCurrentWeather.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Missing token'));

    render(<MemoryRouter initialEntries={['/console']}><CoachConsole /></MemoryRouter>);

    const message = await screen.findByText('Weather unavailable');
    expect(message.parentElement).toHaveAttribute('title', 'Sign in for live weather.');
  });

  it('explains when the live weather provider is unavailable', async () => {
    render(<MemoryRouter initialEntries={['/console']}><CoachConsole /></MemoryRouter>);

    const message = await screen.findByText('Weather unavailable');
    expect(message.parentElement).toHaveAttribute('title', 'Weather unavailable. Check location permissions or try again.');
  });
});
