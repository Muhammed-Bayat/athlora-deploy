import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AthleticsEvent, EventMutationPayload, EventWeatherForecast } from '../types';
import { cancelEvent, createEvent, getEventWeather, listEvents, updateEvent } from './events';

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

const payload: EventMutationPayload = {
  type: event.type,
  discipline: '100m',
  title: event.title,
  date: event.date,
  time: event.time,
  locationName: event.locationName,
  latitude: event.latitude,
  longitude: event.longitude,
  status: event.status,
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('event API', () => {
  it('lists events without an empty query string', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [event], meta: { count: 1 } })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(listEvents()).resolves.toEqual({ data: [event], meta: { count: 1 } });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/events`,
    );
  });

  it('encodes supported filters and forwards the abort signal', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [], meta: { count: 0 } })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await listEvents(
      {
        type: 'training',
        status: 'completed',
        dateFrom: '2026-08-01',
        dateTo: '2026-08-31',
      },
      controller.signal,
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/events?type=training&status=completed&dateFrom=2026-08-01&dateTo=2026-08-31`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('creates and fully replaces events without transforming values', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      async () => new Response(JSON.stringify({ data: event })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(createEvent(payload)).resolves.toEqual(event);
    await expect(updateEvent(event.id, payload)).resolves.toEqual(event);

    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) }),
    );
    expect(fetchMock.mock.calls[1]?.[0]).toContain(`/api/v1/events/${event.id}`);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(payload) }),
    );
  });

  it('returns the cancelled event from DELETE', async () => {
    const cancelled = { ...event, status: 'cancelled' as const };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: cancelled })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(cancelEvent(event.id)).resolves.toEqual(cancelled);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
  });

  it('unwraps an event forecast and forwards cancellation', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: forecast })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await expect(getEventWeather(event.id, controller.signal)).resolves.toEqual(forecast);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(`/api/v1/events/${event.id}/weather`);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ signal: controller.signal }));
  });
});
