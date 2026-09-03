import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { getEventWeather } from '../../api/events';
import type { AthleticsEvent, EventWeatherForecast } from '../../types';
import { EventWeatherPanel } from './EventWeatherPanel';

vi.mock('../../api/events', () => ({ getEventWeather: vi.fn() }));

const event: AthleticsEvent = {
  id: '11111111-1111-4111-8111-111111111111',
  createdBy: '22222222-2222-4222-8222-222222222222',
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
};

const forecast: EventWeatherForecast = {
  date: event.date,
  timezone: 'Africa/Johannesburg',
  weatherCode: 2,
  temperatureMinC: 13.4,
  temperatureMaxC: 24.8,
  precipitationProbabilityMaxPercent: 20,
  windSpeedMaxKmh: 18.1,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getEventWeather).mockResolvedValue(forecast);
});

describe('EventWeatherPanel', () => {
  it('loads and renders the event-day forecast independently', async () => {
    render(<EventWeatherPanel event={event} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading event forecast');
    expect(await screen.findByText('Partly cloudy')).toBeInTheDocument();
    expect(screen.getByText('13.4° to 24.8°C')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText('18.1 km/h')).toBeInTheDocument();
    expect(screen.getByText('Africa/Johannesburg')).toBeInTheDocument();
    expect(getEventWeather).toHaveBeenCalledWith(event.id, expect.any(AbortSignal));
  });

  it('does not request weather without both coordinates', () => {
    render(<EventWeatherPanel event={{ ...event, longitude: null }} />);

    expect(screen.getByText('Select a venue when editing this event to view the forecast.')).toBeInTheDocument();
    expect(getEventWeather).not.toHaveBeenCalled();
  });

  it('renders forecast-window no-data as a quiet unavailable state', async () => {
    vi.mocked(getEventWeather).mockRejectedValue(
      new ApiError(422, 'WEATHER_DATE_UNAVAILABLE', 'Forecasts are available for events in the next 16 days'),
    );
    render(<EventWeatherPanel event={event} />);

    expect(await screen.findByText('Forecasts are available for events in the next 16 days')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry forecast' })).not.toBeInTheDocument();
  });

  it('announces a service failure and retries only the forecast', async () => {
    vi.mocked(getEventWeather)
      .mockRejectedValueOnce(new ApiError(502, 'WEATHER_SERVICE_UNAVAILABLE', 'Weather is unavailable'))
      .mockResolvedValueOnce(forecast);
    const user = userEvent.setup();
    render(<EventWeatherPanel event={event} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Weather is unavailable');
    await user.click(screen.getByRole('button', { name: 'Retry forecast' }));
    expect(await screen.findByText('Partly cloudy')).toBeInTheDocument();
    expect(getEventWeather).toHaveBeenCalledTimes(2);
  });

  it('aborts the in-flight forecast when event detail closes', async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(getEventWeather).mockImplementation((_id, requestSignal) => {
      signal = requestSignal;
      return new Promise(() => undefined);
    });
    const { unmount } = render(<EventWeatherPanel event={event} />);
    await waitFor(() => expect(signal).toBeDefined());

    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
