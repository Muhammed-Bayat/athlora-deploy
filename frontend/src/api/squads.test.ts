import { afterEach, describe, expect, it, vi } from 'vitest';
import { archiveSquad, createSquad, listSquads, unarchiveSquad, updateSquad } from './squads';

const id = '11111111-1111-4111-8111-111111111111';
const squad = { id, name: 'Sprint', archivedAt: null, createdAt: '2026-08-16T10:00:00.000Z', updatedAt: '2026-08-16T10:00:00.000Z' };

afterEach(() => vi.unstubAllGlobals());

describe('squad API', () => {
  it('uses the workspace squad endpoints for lifecycle operations', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ data: squad, meta: { count: 1 } })));
    vi.stubGlobal('fetch', fetchMock);
    await listSquads(true); await createSquad('Sprint'); await updateSquad(id, 'Sprints'); await archiveSquad(id); await unarchiveSquad(id);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/v1/squads?includeArchived=true');
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Sprint' }) }));
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(expect.objectContaining({ method: 'PUT' }));
    expect(fetchMock.mock.calls[3]?.[1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
    expect(fetchMock.mock.calls[4]?.[0]).toContain(`/api/v1/squads/${id}/unarchive`);
  });
});
