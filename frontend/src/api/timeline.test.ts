import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TimelineEntry, TimelineEntryCreatePayload } from '../types';
import {
  createTimelineEntry,
  deleteTimelineEntry,
  listTimelineEntries,
  updateTimelineEntry,
} from './timeline';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const ENTRY_ID = '22222222-2222-4222-8222-222222222222';
const ATHLETE_ID = '33333333-3333-4333-8333-333333333333';
const entry: TimelineEntry = {
  id: ENTRY_ID,
  eventId: EVENT_ID,
  athleteId: ATHLETE_ID,
  discipline: '100m',
  entryType: 'attempt',
  value: 11.2,
  unit: 'seconds',
  isFoul: false,
  incidentType: null,
  noteText: null,
  recordedBy: '44444444-4444-4444-8444-444444444444',
  version: 1,
  deviceId: 'track-tablet-1',
  createdAt: '2026-08-16T10:00:00.000Z',
  updatedAt: '2026-08-16T10:00:00.000Z',
  deletedAt: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('timeline API', () => {
  it('lists the event timeline from the nested GET resource and preserves the list envelope', async () => {
    const response = { data: [entry], meta: { count: 1 } };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(response)));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listTimelineEntries(EVENT_ID)).resolves.toEqual(response);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/events/${EVENT_ID}/entries`,
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it('creates an entry with the typed payload as the exact POST body', async () => {
    const payload: TimelineEntryCreatePayload = {
      athleteId: ATHLETE_ID,
      discipline: '100m',
      entryType: 'attempt',
      value: 11.2,
      unit: 'seconds',
      isFoul: false,
      incidentType: null,
      noteText: null,
      deviceId: 'track-tablet-1',
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: entry }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(createTimelineEntry(EVENT_ID, payload)).resolves.toEqual(entry);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(payload),
    }));
  });

  it('patches an entry with the exact method and correction body', async () => {
    const payload = { expectedVersion: 1, value: 11.1, noteText: 'Corrected from photo finish' };
    const corrected = { ...entry, value: 11.1, noteText: payload.noteText, version: 2 };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: corrected })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateTimelineEntry(EVENT_ID, ENTRY_ID, payload)).resolves.toEqual(corrected);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/events/${EVENT_ID}/entries/${ENTRY_ID}`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify(payload),
    }));
  });

  it('deletes with the expected version body and accepts a 204 response', async () => {
    const payload = { expectedVersion: 2 };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteTimelineEntry(EVENT_ID, ENTRY_ID, payload)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/events/${EVENT_ID}/entries/${ENTRY_ID}`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      method: 'DELETE',
      body: JSON.stringify(payload),
    }));
  });
});
