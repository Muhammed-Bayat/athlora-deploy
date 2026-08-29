import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Athlete, AthleteMutationPayload, Squad } from '../types';
import {
  archiveAthlete,
  createAthlete,
  listAthletes,
  unarchiveAthlete,
  updateAthlete,
} from './athletes';

const squad: Squad = {
  id: '33333333-3333-4333-8333-333333333333', name: 'Sprint A', archivedAt: null,
  createdAt: '2026-08-16T10:00:00.000Z', updatedAt: '2026-08-16T10:00:00.000Z',
};
const athlete: Athlete = {
  id: '11111111-1111-4111-8111-111111111111',
  coachId: '22222222-2222-4222-8222-222222222222',
  name: 'Ari Runner',
  dob: '2004-02-29',
  gender: 'Open',
  squads: [squad],
  notes: 'Starts focus',
  archivedAt: null,
  createdAt: '2026-08-16T10:00:00.000Z',
  updatedAt: '2026-08-16T10:00:00.000Z',
};

const payload: AthleteMutationPayload = {
  name: athlete.name,
  dob: athlete.dob,
  gender: athlete.gender,
  squadIds: [squad.id],
  notes: athlete.notes,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('athlete API', () => {
  it('lists athletes without adding an empty query string', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [athlete], meta: { count: 1 } })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(listAthletes()).resolves.toEqual({ data: [athlete], meta: { count: 1 } });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/athletes`,
    );
  });

  it('encodes supported list filters and forwards the abort signal', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [], meta: { count: 0 } })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await listAthletes(
       { includeArchived: true, name: ' Ari & Bea ', squadId: squad.id },
      controller.signal,
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
       `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/athletes?includeArchived=true&name=Ari+%26+Bea&squadId=${squad.id}`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('creates and fully replaces athletes with the contract payload', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(JSON.stringify({ data: athlete })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createAthlete(payload)).resolves.toEqual(athlete);
    await expect(updateAthlete(athlete.id, payload)).resolves.toEqual(athlete);

    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) }),
    );
    expect(fetchMock.mock.calls[1]?.[0]).toContain(`/api/v1/athletes/${athlete.id}`);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(payload) }),
    );
  });

  it('returns the archived athlete from DELETE', async () => {
    const archived = { ...athlete, archivedAt: '2026-08-16T12:00:00.000Z' };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: archived })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(archiveAthlete(athlete.id)).resolves.toEqual(archived);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
  });

  it('restores an archived athlete through the unarchive action', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: athlete })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(unarchiveAthlete(athlete.id)).resolves.toEqual(athlete);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(`/api/v1/athletes/${athlete.id}/unarchive`);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ method: 'POST' }));
  });
});
