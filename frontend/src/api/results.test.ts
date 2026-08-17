import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Result, ResultOverridePayload } from '../types';
import { listResults, overrideResult } from './results';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const ATHLETE_ID = '22222222-2222-4222-8222-222222222222';
const result: Result = {
  eventId: EVENT_ID,
  athleteId: ATHLETE_ID,
  discipline: '100m',
  outcome: 'valid',
  finalResult: 11.24,
  unit: 'seconds',
  placing: 1,
  isPb: true,
  isSb: true,
  manualOverride: null,
  overrideReason: null,
  overriddenBy: null,
  overrideAt: null,
  updatedAt: '2026-08-17T10:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('results API', () => {
  it('lists event results from the nested URL and preserves the list envelope', async () => {
    const response = { data: [result], meta: { count: 1 } };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(response)));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listResults(EVENT_ID)).resolves.toEqual(response);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/events/${EVENT_ID}/results`,
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it('sets an override with the exact PUT body and unwraps the result', async () => {
    const payload: ResultOverridePayload = {
      manualOverride: 11.1,
      overrideReason: 'Photo finish correction',
    };
    const overridden = {
      ...result,
      manualOverride: payload.manualOverride,
      overrideReason: payload.overrideReason,
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: overridden })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(overrideResult(EVENT_ID, ATHLETE_ID, payload)).resolves.toEqual(overridden);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/events/${EVENT_ID}/results/${ATHLETE_ID}`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify(payload),
    }));
  });

  it('clears an override with the required paired-null body', async () => {
    const payload: ResultOverridePayload = { manualOverride: null, overrideReason: null };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: result })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(overrideResult(EVENT_ID, ATHLETE_ID, payload)).resolves.toEqual(result);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ manualOverride: null, overrideReason: null }),
    }));
  });
});
