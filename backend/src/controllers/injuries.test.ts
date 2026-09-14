import { beforeEach, describe, expect, it, vi } from 'vitest';
const services = vi.hoisted(() => ({ listInjuries: vi.fn(), createInjury: vi.fn(), updateInjury: vi.fn(), resolveInjury: vi.fn(), reopenInjury: vi.fn(), deleteInjury: vi.fn() }));
const auth = vi.hoisted(() => ({ getApplicationUserContext: vi.fn(() => ({ workspaceId: 'workspace-1', userId: 'user-1' })) }));
const validation = vi.hoisted(() => ({ parseInjuryCreatePayload: vi.fn((body) => body), parseInjuryUpdatePayload: vi.fn((body) => body), parseInjuryResolvePayload: vi.fn((body) => body), parseInjuryListQuery: vi.fn((query) => query) }));
vi.mock('../services/injuries.js', () => services);
vi.mock('../middleware/auth.js', () => auth);
vi.mock('../validation/payloads.js', () => validation);
import * as injuries from './injuries.js';
function response() { const value = { status: vi.fn(), json: vi.fn() }; value.status.mockReturnValue(value); return value; }
async function invoke(handler: typeof injuries.listAthleteInjuries) { const res = response(); const next = vi.fn(); await handler({ params: { id: 'athlete-1', injuryId: 'injury-1' }, body: { severity: 'minor' }, query: {} } as never, res as never, next); expect(next).not.toHaveBeenCalled(); }
describe('injury controllers', () => {
  beforeEach(() => { vi.clearAllMocks(); for (const mock of Object.values(services)) mock.mockResolvedValue({ id: 'injury-1' }); services.listInjuries.mockResolvedValue([]); });
  it('delegates every athlete injury action with server-derived actors', async () => { for (const handler of [injuries.listAthleteInjuries, injuries.createAthleteInjury, injuries.updateAthleteInjury, injuries.resolveAthleteInjury, injuries.reopenAthleteInjury, injuries.deleteAthleteInjury]) await invoke(handler); expect(services.createInjury).toHaveBeenCalledWith('workspace-1', 'athlete-1', 'user-1', expect.any(Object)); expect(services.deleteInjury).toHaveBeenCalledWith('workspace-1', 'athlete-1', 'injury-1', 'user-1'); });
});
