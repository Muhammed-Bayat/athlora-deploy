import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as publicLoggerApi from '../../api/publicLoggers';
import type { PublicOfflineSyncResult } from '../../hooks/usePublicOfflineSync';
import type { PublicMeetLoggerSnapshot } from '../../types/meets';
import { PublicMeetLogger } from './PublicMeetLogger';

vi.mock('../../api/publicLoggers');
vi.mock('../../offline/sessionCache', () => ({
  cachePublicSession: vi.fn().mockResolvedValue(undefined),
  getCachedPublicSession: vi.fn(),
}));

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const RELAY_SESSION_ID = '22222222-2222-4222-8222-222222222222';
const FIELD_SESSION_ID = '33333333-3333-4333-8333-333333333333';
const RELAY_ID = '44444444-4444-4444-8444-444444444444';
const GUEST_ID = '55555555-5555-4555-8555-555555555555';

const snapshot: PublicMeetLoggerSnapshot = {
  disciplines: [
    {
      id: '66666666-6666-4666-8666-666666666666', code: '4x100m', version: 1, kind: 'relay', unit: 'seconds', direction: 'lower',
      defaultRules: { aggregation: 'timed', entrantType: 'relay', teamSize: 4 }, precision: 2, presentation: { label: '4x100m relay' }, createdAt: '2026-09-01T00:00:00.000Z', source: 'catalogue',
    },
    {
      id: '77777777-7777-4777-8777-777777777777', code: 'long_jump', version: 1, kind: 'field', unit: 'metres', direction: 'higher',
      defaultRules: { aggregation: 'best', entrantType: 'individual', attempts: 6 }, precision: 2, presentation: { label: 'Long jump' }, createdAt: '2026-09-01T00:00:00.000Z', source: 'catalogue',
    },
  ],
  entrants: [
    { id: RELAY_ID, name: 'North Stars', kind: 'relay', members: [{ leg: 1, name: 'Ari Runner', isGuest: false }, { leg: 2, name: 'Bea Guest', isGuest: true }] },
    { id: GUEST_ID, name: 'Casey Guest', kind: 'guest', members: [] },
  ],
  sessions: [
    { id: RELAY_SESSION_ID, label: '4x100m Final', disciplineDefinitionId: '66666666-6666-4666-8666-666666666666', status: 'in_progress', resultState: 'provisional', version: 1, entrantIds: [RELAY_ID], entries: [], results: [] },
    { id: FIELD_SESSION_ID, label: 'Long Jump Final', disciplineDefinitionId: '77777777-7777-4777-8777-777777777777', status: 'in_progress', resultState: 'provisional', version: 1, entrantIds: [GUEST_ID], entries: [], results: [] },
    { id: '88888888-8888-4888-8888-888888888888', label: 'Closed Session', disciplineDefinitionId: '77777777-7777-4777-8777-777777777777', status: 'scheduled', resultState: 'provisional', version: 1, entrantIds: [GUEST_ID], entries: [], results: [] },
  ],
};

function offlineSync(): PublicOfflineSyncResult {
  return {
    isOnline: true, deviceId: 'device', wasOffline: false, isSyncing: false, pendingCount: 0, failedCount: 0,
    queueStatus: null, queueActions: [], sessionExpired: false, enqueue: vi.fn(), cacheSnapshot: vi.fn(), syncNow: vi.fn(),
    refreshStatus: vi.fn(), retryFailedAction: vi.fn(), clearSessionExpired: vi.fn(),
  };
}

describe('PublicMeetLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(publicLoggerApi.getPublicMeetLoggerSnapshot).mockResolvedValue(snapshot);
    vi.mocked(publicLoggerApi.createPublicMeetLoggerEntry).mockResolvedValue({
      id: '99999999-9999-4999-8999-999999999999', eventId: EVENT_ID, disciplineSessionId: FIELD_SESSION_ID, entrantId: GUEST_ID,
      entryType: 'attempt', value: 6.45, unit: 'metres', isFoul: false, incidentType: null, version: 1, createdAt: '2026-09-01T00:00:00.000Z', canEdit: true, canUndo: true,
    });
  });

  it('shows only active meet sessions, keeps relay legs safe, and targets field attempts to the selected session entrant', async () => {
    const user = userEvent.setup();
    render(<PublicMeetLogger event={{ id: EVENT_ID, title: 'City Combined Meet', status: 'in_progress', discipline: null }} sessionToken="public-session" offlineSync={offlineSync()} />);

    expect(await screen.findByRole('heading', { name: 'City Combined Meet' })).toBeInTheDocument();
    expect(screen.getByText('Relay: L1 Ari Runner, L2 Bea Guest')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Closed Session/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Long Jump Final/ }));
    await user.type(screen.getByLabelText('Measurement (metres)'), '6.45');
    await user.click(screen.getByRole('button', { name: 'Record observation' }));

    await waitFor(() => expect(publicLoggerApi.createPublicMeetLoggerEntry).toHaveBeenCalledWith(
      'public-session', EVENT_ID, { disciplineSessionId: FIELD_SESSION_ID, entrantId: GUEST_ID },
      expect.objectContaining({ entryType: 'attempt', value: 6.45, unit: 'metres', isFoul: false, noteText: null }),
    ));

    await user.click(screen.getByRole('checkbox', { name: 'Foul' }));
    await user.click(screen.getByRole('button', { name: 'Record observation' }));
    await waitFor(() => expect(publicLoggerApi.createPublicMeetLoggerEntry).toHaveBeenLastCalledWith(
      'public-session', EVENT_ID, { disciplineSessionId: FIELD_SESSION_ID, entrantId: GUEST_ID },
      expect.objectContaining({ entryType: 'attempt', value: null, unit: null, isFoul: true }),
    ));
  });
});
