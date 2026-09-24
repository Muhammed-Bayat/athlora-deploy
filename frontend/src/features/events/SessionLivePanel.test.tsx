import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AthleticsEvent } from '../../types';
import { SessionLivePanel } from './SessionLivePanel';

const api = vi.hoisted(() => ({
  listDisciplines: vi.fn(),
  listSessions: vi.fn(),
  listEntrants: vi.fn(),
  listSessionEntries: vi.fn(),
  listSessionResults: vi.fn(),
  createSessionEntry: vi.fn(),
  undoSessionEntry: vi.fn(),
  selectSessionResultEntry: vi.fn(),
  changeSessionState: vi.fn(),
}));
const offline = vi.hoisted(() => ({
  isOnline: true,
  queueStatus: { pending: 0, failed: 0, lastSyncedAt: null },
  enqueueCreateEntry: vi.fn(async () => false),
  enqueueUndoEntry: vi.fn(async () => false),
  syncPending: vi.fn(async () => undefined),
  refreshQueueStatus: vi.fn(async () => undefined),
}));
const workspace = vi.hoisted(() => ({ useWorkspace: () => ({ activeWorkspace: { id: 'ws-1' } }) }));
const currentUser = vi.hoisted(() => ({ useCurrentUser: () => ({ id: 'coach-1' }) }));
const realtime = vi.hoisted(() => ({ useRealtimeRoom: () => undefined }));

vi.mock('../../api/meets', () => api);
vi.mock('../../hooks/useSessionOffline', () => ({ useSessionOffline: () => offline }));
vi.mock('../auth/WorkspaceContext', () => workspace);
vi.mock('../auth/CurrentUserContext', () => currentUser);
vi.mock('../realtime/useRealtimeRoom', () => realtime);
vi.mock('../timeline/QueueStatusBadge', () => ({ QueueStatusBadge: () => null }));

const event: AthleticsEvent = {
  id: 'event-1',
  createdBy: 'coach-1',
  type: 'competition',
  discipline: null,
  title: 'Relay meet',
  date: '2026-09-20',
  time: null,
  locationName: null,
  latitude: null,
  longitude: null,
  status: 'in_progress',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

let sessionStatus = 'scheduled';
let sessionVersion = 1;

describe('SessionLivePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStatus = 'scheduled';
    sessionVersion = 1;
    offline.isOnline = true;
    offline.queueStatus = { pending: 0, failed: 0, lastSyncedAt: null };
    offline.enqueueCreateEntry.mockResolvedValue(false);
    offline.enqueueUndoEntry.mockResolvedValue(false);
    api.changeSessionState.mockImplementation(async () => {
      sessionStatus = 'in_progress';
      sessionVersion += 1;
      return {};
    });
    api.listDisciplines.mockResolvedValue({ data: [{
      id: 'relay-400',
      code: '4x400m',
      kind: 'relay',
      presentation: { label: '4x400m relay' },
      unit: 'seconds',
      precision: 2,
      defaultRules: { entrantType: 'relay', teamSize: 4, aggregation: 'timed' },
    }] });
    api.listSessions.mockImplementation(async () => ({ data: [{
      id: 'session-1',
      disciplineDefinitionId: 'relay-400',
      label: '4x400m Heat 1',
      status: sessionStatus,
      version: sessionVersion,
    }] }));
    api.listEntrants.mockResolvedValue({ data: [
      { id: 'athlete-a', kind: 'athlete', athleteId: 'a', name: 'Ari Runner', clubName: null, details: null, memberIds: [], createdBy: 'coach-1', createdAt: '2026-09-01T00:00:00.000Z' },
      { id: 'athlete-b', kind: 'athlete', athleteId: 'b', name: 'Bea Dash', clubName: null, details: null, memberIds: [], createdBy: 'coach-1', createdAt: '2026-09-01T00:00:00.000Z' },
      { id: 'team-1', kind: 'relay', athleteId: null, name: 'Speed Demons', clubName: null, details: null, memberIds: ['athlete-a', 'athlete-b'], createdBy: 'coach-1', createdAt: '2026-09-01T00:00:00.000Z' },
    ] });
    api.listSessionEntries.mockResolvedValue({ data: [{
      id: 'entry-1',
      eventId: 'event-1',
      disciplineSessionId: 'session-1',
      entrantId: 'team-1',
      entryType: 'attempt',
      value: 62.4,
      unit: 'seconds',
      isFoul: false,
      incidentType: null,
      noteText: null,
      recordedBy: 'coach-1',
      version: 1,
      createdAt: '2026-09-20T10:00:00.000Z',
      updatedAt: '2026-09-20T10:00:00.000Z',
      deletedAt: null,
    }, {
      id: 'entry-2',
      eventId: 'event-1',
      disciplineSessionId: 'session-1',
      entrantId: 'team-1',
      entryType: 'attempt',
      value: 61.1,
      unit: 'seconds',
      isFoul: false,
      incidentType: null,
      noteText: null,
      recordedBy: 'coach-1',
      version: 1,
      createdAt: '2026-09-20T10:01:00.000Z',
      updatedAt: '2026-09-20T10:01:00.000Z',
      deletedAt: null,
    }] });
    api.listSessionResults.mockResolvedValue({ data: [{
      eventId: 'event-1',
      disciplineSessionId: 'session-1',
      entrantId: 'team-1',
      outcome: 'valid',
      finalResult: 61.1,
      effectiveOutcome: 'valid',
      effectiveResult: 61.1,
      placing: 1,
      isPb: false,
      isSb: false,
      manualOverride: null,
      overrideReason: null,
      overriddenBy: null,
      overriddenAt: null,
      selectedEntryId: null,
      version: 1,
      updatedAt: '2026-09-20T10:01:00.000Z',
    }] });
    api.createSessionEntry.mockResolvedValue({});
    api.undoSessionEntry.mockResolvedValue(undefined);
    api.selectSessionResultEntry.mockResolvedValue({});
  });

  it('starts a session, logs a team attempt, and selects an official entry', async () => {
    const user = userEvent.setup();
    render(<SessionLivePanel event={event} canOperate isCoach />);

    await user.selectOptions(await screen.findByLabelText('Session'), 'session-1');
    await user.click(await screen.findByRole('button', { name: 'Start session' }));
    await waitFor(() => expect(api.changeSessionState).toHaveBeenCalledWith('event-1', 'session-1', 'in_progress', 1));

    await user.selectOptions(await screen.findByLabelText('Team'), 'team-1');
    expect(await screen.findByLabelText('Team members')).toHaveTextContent('Legs: Ari Runner → Bea Dash');

    await user.type(screen.getByLabelText('Time (s)'), '60.5');
    await user.click(screen.getByRole('button', { name: 'Log attempt' }));
    await waitFor(() => expect(api.createSessionEntry).toHaveBeenCalledWith('event-1', { disciplineSessionId: 'session-1', entrantId: 'team-1' }, expect.objectContaining({ entryType: 'attempt', value: 60.5 })));

    const officialButtons = await screen.findAllByRole('button', { name: 'Make official' });
    await user.click(officialButtons[0]);
    await waitFor(() => expect(api.selectSessionResultEntry).toHaveBeenCalledWith(
      'event-1',
      { disciplineSessionId: 'session-1', entrantId: 'team-1' },
      { entryId: 'entry-1', expectedVersion: 1 },
    ));
    expect(screen.getByRole('table')).toHaveTextContent('Speed Demons');
    expect(screen.getByRole('table')).toHaveTextContent('Ari Runner → Bea Dash');
  });

  it('queues an offline attempt instead of calling the API', async () => {
    offline.isOnline = false;
    offline.enqueueCreateEntry.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<SessionLivePanel event={event} canOperate isCoach />);

    await user.selectOptions(await screen.findByLabelText('Session'), 'session-1');
    await user.click(await screen.findByRole('button', { name: 'Start session' }));
    await user.selectOptions(await screen.findByLabelText('Team'), 'team-1');
    await user.type(await screen.findByLabelText('Time (s)'), '59.9');
    await user.click(screen.getByRole('button', { name: 'Log attempt' }));

    await waitFor(() => expect(offline.enqueueCreateEntry).toHaveBeenCalledWith(
      'event-1',
      'ws-1',
      { disciplineSessionId: 'session-1', entrantId: 'team-1' },
      expect.objectContaining({ entryType: 'attempt', value: 59.9 }),
    ));
    expect(api.createSessionEntry).not.toHaveBeenCalled();
  });

  it('renders nothing for a legacy 100m event', () => {
    const legacy: AthleticsEvent = { ...event, discipline: '100m' };
    const { container } = render(<SessionLivePanel event={legacy} canOperate isCoach />);
    expect(container).toBeEmptyDOMElement();
  });
});
