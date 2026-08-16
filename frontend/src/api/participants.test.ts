import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventParticipantSummary } from '../types';
import {
  addEventParticipant,
  listEventParticipants,
  removeEventParticipant,
  updateEventParticipant,
} from './participants';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const ATHLETE_ID = '22222222-2222-4222-8222-222222222222';
const participant: EventParticipantSummary = {
  eventId: EVENT_ID,
  athleteId: ATHLETE_ID,
  rsvpStatus: 'pending',
  athlete: { id: ATHLETE_ID, name: 'Ari Runner', squad: 'Sprint', archivedAt: null },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('participant API', () => {
  it('lists event participants from the nested resource', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [participant], meta: { count: 1 } })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(listEventParticipants(EVENT_ID)).resolves.toEqual({ data: [participant], meta: { count: 1 } });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/events/${EVENT_ID}/participants`,
    );
  });

  it('assigns an athlete with the exact body', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: participant }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(addEventParticipant(EVENT_ID, ATHLETE_ID)).resolves.toEqual(participant);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ athleteId: ATHLETE_ID }),
    }));
  });

  it('fully replaces RSVP status with no extra fields', async () => {
    const attending = { ...participant, rsvpStatus: 'yes' as const };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: attending })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateEventParticipant(EVENT_ID, ATHLETE_ID, 'yes')).resolves.toEqual(attending);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(`/events/${EVENT_ID}/participants/${ATHLETE_ID}`);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ rsvpStatus: 'yes' }),
    }));
  });

  it('removes only the participant relationship and accepts a 204 response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(removeEventParticipant(EVENT_ID, ATHLETE_ID)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[0]).toContain(`/events/${EVENT_ID}/participants/${ATHLETE_ID}`);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
  });
});
