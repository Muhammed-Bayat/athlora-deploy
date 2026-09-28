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
    { id: RELAY_ID, name: 'North Stars', kind: 'relay', workspaceName: null, clubName: null, attending: true, members: [{ leg: 1, name: 'Ari Runner', isGuest: false }, { leg: 2, name: 'Bea Guest', isGuest: true }] },
    { id: GUEST_ID, name: 'Casey Guest', kind: 'guest', workspaceName: null, clubName: 'Independent Athletics', attending: true, members: [] },
  ],
  sessions: [
    { id: RELAY_SESSION_ID, label: '4x100m Final', disciplineDefinitionId: '66666666-6666-4666-8666-666666666666', status: 'in_progress', resultState: 'provisional', version: 1, entrantIds: [RELAY_ID], entries: [], results: [{ entrantId: RELAY_ID, outcome: 'valid', placing: 1, selectedEntryId: null, value: 48.21 }] },
    { id: FIELD_SESSION_ID, label: 'Long Jump Final', disciplineDefinitionId: '77777777-7777-4777-8777-777777777777', status: 'in_progress', resultState: 'provisional', version: 1, entrantIds: [GUEST_ID], entries: [], results: [{ entrantId: GUEST_ID, outcome: 'valid', placing: 1, selectedEntryId: null, value: 6.45 }] },
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

  it('mirrors the coach live logger: discipline tabs, safe relay legs, team lines, and targeted recording', async () => {
    const user = userEvent.setup();
    render(<PublicMeetLogger event={{ id: EVENT_ID, title: 'City Combined Meet', status: 'in_progress', discipline: null }} sessionToken="public-session" offlineSync={offlineSync()} />);

    expect(await screen.findByRole('heading', { name: 'City Combined Meet' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /4x100m Final/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Long Jump Final/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Closed Session/ })).toBeInTheDocument();

    // Default tab is the first in-progress session; relay legs stay name-only and safe.
    expect(screen.getByText('Legs: Ari Runner → Bea Guest')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'False Start' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lane Inf.' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('North Stars');
    expect(screen.getByRole('table')).toHaveTextContent('Ari Runner → Bea Guest');

    await user.click(screen.getByRole('tab', { name: /Long Jump Final/ }));
    expect(screen.getAllByText('Independent Athletics')).toHaveLength(2);
    expect(screen.getByRole('table')).toHaveTextContent('Casey Guest');
    expect(screen.queryByRole('button', { name: 'False Start' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lane Inf.' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'DQ' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Mark (metres) for Casey Guest'), '6.45');
    await user.click(screen.getByRole('button', { name: 'Record' }));

    await waitFor(() => expect(publicLoggerApi.createPublicMeetLoggerEntry).toHaveBeenCalledWith(
      'public-session', EVENT_ID, { disciplineSessionId: FIELD_SESSION_ID, entrantId: GUEST_ID },
      expect.objectContaining({ entryType: 'attempt', value: 6.45, unit: 'metres', isFoul: false, noteText: null }),
    ));

    await user.click(screen.getByRole('button', { name: 'Foul for Casey Guest' }));
    await user.type(screen.getByLabelText('Mark (metres) for Casey Guest'), '6.45');
    await user.click(screen.getByRole('button', { name: 'Record' }));
    await waitFor(() => expect(publicLoggerApi.createPublicMeetLoggerEntry).toHaveBeenLastCalledWith(
      'public-session', EVENT_ID, { disciplineSessionId: FIELD_SESSION_ID, entrantId: GUEST_ID },
      expect.objectContaining({ entryType: 'attempt', value: 6.45, unit: 'metres', isFoul: true }),
    ));
  });

  it('hides registered entrants who are not marked as attending', async () => {
    const absentSnapshot: PublicMeetLoggerSnapshot = {
      ...snapshot,
      entrants: [
        ...snapshot.entrants,
        { id: 'aaaaaaa1-1111-4111-8111-111111111111', name: 'Absent Athlete', kind: 'athlete', workspaceName: 'North Club', clubName: null, attending: false, members: [] },
      ],
      sessions: snapshot.sessions.map((item) => item.id === FIELD_SESSION_ID
        ? { ...item, entrantIds: [...item.entrantIds, 'aaaaaaa1-1111-4111-8111-111111111111'] }
        : item),
    };
    vi.mocked(publicLoggerApi.getPublicMeetLoggerSnapshot).mockResolvedValue(absentSnapshot);

    const user = userEvent.setup();
    render(<PublicMeetLogger event={{ id: EVENT_ID, title: 'City Combined Meet', status: 'in_progress', discipline: null }} sessionToken="public-session" offlineSync={offlineSync()} />);

    await user.click(await screen.findByRole('tab', { name: /Long Jump Final/ }));
    expect(screen.queryByText('Absent Athlete')).not.toBeInTheDocument();
    expect(screen.getAllByText('Casey Guest')).toHaveLength(2);
  });

  it('shows an own incident entry and lets the official undo it', async () => {
    const incidentSnapshot: PublicMeetLoggerSnapshot = {
      ...snapshot,
      sessions: snapshot.sessions.map((item) => item.id === FIELD_SESSION_ID ? {
        ...item,
        entries: [{
          id: '99999999-9999-4999-8999-999999999998', eventId: EVENT_ID, disciplineSessionId: FIELD_SESSION_ID, entrantId: GUEST_ID,
          entryType: 'penalty', value: null, unit: null, isFoul: false, incidentType: 'dq', version: 1,
          createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', canEdit: true, canUndo: true,
        }],
      } : item),
    };
    vi.mocked(publicLoggerApi.getPublicMeetLoggerSnapshot).mockResolvedValue(incidentSnapshot);
    const user = userEvent.setup();
    render(<PublicMeetLogger event={{ id: EVENT_ID, title: 'City Combined Meet', status: 'in_progress', discipline: null }} sessionToken="public-session" offlineSync={offlineSync()} />);

    await user.click(await screen.findByRole('tab', { name: /Long Jump Final/ }));
    expect(await screen.findByRole('list', { name: 'Attempts for Casey Guest' })).toHaveTextContent('DQ');
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(publicLoggerApi.removePublicMeetLoggerEntry).toHaveBeenCalledWith(
      'public-session', EVENT_ID, { disciplineSessionId: FIELD_SESSION_ID, entrantId: GUEST_ID },
      '99999999-9999-4999-8999-999999999998', { expectedVersion: 1 },
    ));
  });
});
