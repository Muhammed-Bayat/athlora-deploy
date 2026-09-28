import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AthleticsEvent } from '../../types';
import * as eventHelpersApi from '../../api/eventHelpers';
import { SessionLivePanel } from './SessionLivePanel';

const api = vi.hoisted(() => ({
  listDisciplines: vi.fn(),
  listSessions: vi.fn(),
  listEntrants: vi.fn(),
  listSessionEntries: vi.fn(),
  listSessionResults: vi.fn(),
  listRegistrations: vi.fn(),
  createSessionEntry: vi.fn(),
  undoSessionEntry: vi.fn(),
  replaceSessionEntry: vi.fn(),
  selectSessionResultEntry: vi.fn(),
  changeSessionState: vi.fn(),
}));
const offline = vi.hoisted(() => ({
  isOnline: true,
  queueStatus: { pending: 0, failed: 0, lastSyncedAt: null },
  queueActions: [],
  deviceId: 'device-1',
  enqueueCreateEntry: vi.fn(async () => false),
  enqueueUndoEntry: vi.fn(async () => false),
  syncPending: vi.fn(async () => undefined),
  refreshQueueStatus: vi.fn(async () => undefined),
  retryFailedAction: vi.fn(async () => undefined),
}));
const workspace = vi.hoisted(() => ({ useWorkspace: () => ({ activeWorkspace: { id: 'ws-1' } }) }));
const currentUser = vi.hoisted(() => ({ useCurrentUser: () => ({ id: 'coach-1' }) }));
const realtime = vi.hoisted(() => ({ useRealtimeRoom: () => undefined }));

vi.mock('../../api/meets', () => api);
vi.mock('../../hooks/useSessionOffline', () => ({ useSessionOffline: () => offline }));
vi.mock('../auth/WorkspaceContext', () => workspace);
vi.mock('../auth/CurrentUserContext', () => currentUser);
vi.mock('../realtime/useRealtimeRoom', () => realtime);
vi.mock('../../api/eventHelpers');

const event: AthleticsEvent = {
  id: 'event-1',
  workspaceId: 'workspace-1',
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
let resultState = 'provisional';

describe('SessionLivePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStatus = 'scheduled';
    sessionVersion = 1;
    resultState = 'provisional';
    offline.isOnline = true;
    offline.queueStatus = { pending: 0, failed: 0, lastSyncedAt: null };
    offline.queueActions = [];
    offline.enqueueCreateEntry.mockResolvedValue(false);
    offline.enqueueUndoEntry.mockResolvedValue(false);
    vi.mocked(eventHelpersApi.getOfflineLoggerDesignation).mockResolvedValue(null);
    api.listRegistrations.mockResolvedValue({ data: [{
      id: 'reg-1',
      eventId: 'event-1',
      disciplineSessionId: 'session-1',
      entrantId: 'team-1',
      workspaceId: 'ws-1',
      withdrawnAt: null,
      withdrawnBy: null,
      createdBy: 'coach-1',
      createdAt: '2026-09-20T09:00:00.000Z',
    }], meta: { count: 1 } });
    api.replaceSessionEntry.mockResolvedValue({});
    api.changeSessionState.mockImplementation(async (_event, _session, status) => {
      resultState = status === 'completed' ? 'final' : sessionStatus === 'completed' ? 'reopened' : resultState;
      sessionStatus = status;
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
      workspaceId: 'ws-1',
      resultState,
      disciplineDefinitionId: 'relay-400',
      label: '4x400m Heat 1',
      status: sessionStatus,
      version: sessionVersion,
    }] }));
    api.listEntrants.mockResolvedValue({ data: [
      { id: 'athlete-a', eventId: 'event-1', workspaceId: 'ws-1', kind: 'athlete', athleteId: 'a', name: 'Ari Runner', clubName: null, details: null, memberIds: [], workspaceName: 'Team A', rsvpStatus: 'yes', createdBy: 'coach-1', createdAt: '2026-09-01T00:00:00.000Z' },
      { id: 'athlete-b', eventId: 'event-1', workspaceId: 'ws-1', kind: 'athlete', athleteId: 'b', name: 'Bea Dash', clubName: null, details: null, memberIds: [], workspaceName: 'Team A', rsvpStatus: 'yes', createdBy: 'coach-1', createdAt: '2026-09-01T00:00:00.000Z' },
      { id: 'team-1', eventId: 'event-1', workspaceId: 'ws-1', kind: 'relay', athleteId: null, name: 'Speed Demons', clubName: null, details: null, memberIds: ['athlete-a', 'athlete-b'], workspaceName: 'Team A', rsvpStatus: null, createdBy: 'coach-1', createdAt: '2026-09-01T00:00:00.000Z' },
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

    await user.click(await screen.findByRole('tab', { name: /4x400m Heat 1/ }));
    await user.click(await screen.findByRole('button', { name: 'Start session' }));
    await waitFor(() => expect(api.changeSessionState).toHaveBeenCalledWith('event-1', 'session-1', 'in_progress', 1));

    const teamRow = await screen.findByRole('group', { name: 'Speed Demons' });
    expect(within(teamRow).getByLabelText('Team members')).toHaveTextContent('Legs: Ari Runner → Bea Dash');

    await user.type(within(teamRow).getByLabelText('Time (s) for Speed Demons'), '60.5');
    await user.click(within(teamRow).getByRole('button', { name: 'Record' }));
    await waitFor(() => expect(api.createSessionEntry).toHaveBeenCalledWith('event-1', { disciplineSessionId: 'session-1', entrantId: 'team-1' }, expect.objectContaining({ entryType: 'attempt', value: 60.5 })));

    const officialButtons = await within(teamRow).findAllByRole('button', { name: 'Make official' });
    await user.click(officialButtons[0]);
    await waitFor(() => expect(api.selectSessionResultEntry).toHaveBeenCalledWith(
      'event-1',
      { disciplineSessionId: 'session-1', entrantId: 'team-1' },
      { entryId: 'entry-1', expectedVersion: 1 },
    ));
    expect(screen.getByRole('table')).toHaveTextContent('Speed Demons');
    expect(screen.getByRole('table')).toHaveTextContent('Ari Runner → Bea Dash');
    await user.click(screen.getByRole('button', { name: 'Finalize session' }));
    expect(await screen.findByRole('heading', { name: 'Standings (final)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make official' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reopen session' }));
    expect(await screen.findByRole('heading', { name: 'Standings (reopened — provisional)' })).toBeInTheDocument();
  });

  it('queues an offline attempt instead of calling the API', async () => {
    offline.isOnline = false;
    offline.enqueueCreateEntry.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<SessionLivePanel event={event} canOperate isCoach />);

    await user.click(await screen.findByRole('tab', { name: /4x400m Heat 1/ }));
    await user.click(await screen.findByRole('button', { name: 'Start session' }));
    const teamRow = await screen.findByRole('group', { name: 'Speed Demons' });
    await user.type(within(teamRow).getByLabelText('Time (s) for Speed Demons'), '59.9');
    await user.click(within(teamRow).getByRole('button', { name: 'Record' }));

    await waitFor(() => expect(offline.enqueueCreateEntry).toHaveBeenCalledWith(
      'event-1',
      'ws-1',
      { disciplineSessionId: 'session-1', entrantId: 'team-1' },
      expect.objectContaining({ entryType: 'attempt', value: 59.9 }),
    ));
    expect(api.createSessionEntry).not.toHaveBeenCalled();
  });

  it('hides athletes who are not attending from the logging list', async () => {
    const user = userEvent.setup();
    api.listDisciplines.mockResolvedValue({ data: [{ id: 'track-200', code: '200m', kind: 'track', unit: 'seconds', precision: 2, presentation: { label: '200m' }, defaultRules: { aggregation: 'timed', entrantType: 'individual' } }] });
    api.listSessions.mockImplementation(async () => ({ data: [{
      id: 'session-1',
      workspaceId: 'ws-1',
      resultState,
      disciplineDefinitionId: 'track-200',
      label: '200m Heat 1',
      status: sessionStatus,
      version: sessionVersion,
    }] }));
    api.listEntrants.mockResolvedValue({ data: [
      { id: 'athlete-a', eventId: 'event-1', workspaceId: 'ws-1', kind: 'athlete', athleteId: 'a', name: 'Ari Runner', clubName: null, details: null, memberIds: [], workspaceName: 'Team A', rsvpStatus: 'no', createdBy: 'coach-1', createdAt: '2026-09-01T00:00:00.000Z' },
      { id: 'athlete-b', eventId: 'event-1', workspaceId: 'ws-1', kind: 'athlete', athleteId: 'b', name: 'Bea Dash', clubName: null, details: null, memberIds: [], workspaceName: 'Team B', rsvpStatus: 'yes', createdBy: 'coach-1', createdAt: '2026-09-01T00:00:00.000Z' },
    ] });
    api.listRegistrations.mockResolvedValue({ data: [
      { id: 'reg-a', eventId: 'event-1', disciplineSessionId: 'session-1', entrantId: 'athlete-a', workspaceId: 'ws-1', withdrawnAt: null, withdrawnBy: null, createdBy: 'coach-1', createdAt: '2026-09-20T09:00:00.000Z' },
      { id: 'reg-b', eventId: 'event-1', disciplineSessionId: 'session-1', entrantId: 'athlete-b', workspaceId: 'ws-1', withdrawnAt: null, withdrawnBy: null, createdBy: 'coach-1', createdAt: '2026-09-20T09:00:00.000Z' },
    ], meta: { count: 2 } });
    render(<SessionLivePanel event={event} canOperate isCoach />);

    await user.click(await screen.findByRole('tab', { name: /200m Heat 1/ }));
    expect(screen.queryByRole('group', { name: 'Ari Runner' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Bea Dash' })).toBeInTheDocument();
  });

  it('shows the full session roster across teams to any logger', async () => {
    const user = userEvent.setup();
    api.listDisciplines.mockResolvedValue({ data: [{ id: 'track-200', code: '200m', kind: 'track', unit: 'seconds', precision: 2, presentation: { label: '200m' }, defaultRules: { aggregation: 'timed', entrantType: 'individual' } }] });
    api.listSessions.mockImplementation(async () => ({ data: [{
      id: 'session-1',
      workspaceId: 'ws-1',
      resultState,
      disciplineDefinitionId: 'track-200',
      label: '200m Heat 1',
      status: sessionStatus,
      version: sessionVersion,
    }] }));
    api.listEntrants.mockResolvedValue({ data: [
      { id: 'athlete-a', eventId: 'event-1', workspaceId: 'ws-1', kind: 'athlete', athleteId: 'a', name: 'Ari Runner', clubName: null, details: null, memberIds: [], workspaceName: 'Team A', rsvpStatus: 'yes', createdBy: 'coach-1', createdAt: '2026-09-01T00:00:00.000Z' },
      { id: 'athlete-b', eventId: 'event-1', workspaceId: 'ws-2', kind: 'athlete', athleteId: 'b', name: 'Bea Dash', clubName: null, details: null, memberIds: [], workspaceName: 'Team B', rsvpStatus: 'yes', createdBy: 'coach-2', createdAt: '2026-09-01T00:00:00.000Z' },
    ] });
    api.listRegistrations.mockResolvedValue({ data: [
      { id: 'reg-a', eventId: 'event-1', disciplineSessionId: 'session-1', entrantId: 'athlete-a', workspaceId: 'ws-1', withdrawnAt: null, withdrawnBy: null, createdBy: 'coach-1', createdAt: '2026-09-20T09:00:00.000Z' },
      { id: 'reg-b', eventId: 'event-1', disciplineSessionId: 'session-1', entrantId: 'athlete-b', workspaceId: 'ws-2', withdrawnAt: null, withdrawnBy: null, createdBy: 'coach-2', createdAt: '2026-09-20T09:00:00.000Z' },
    ], meta: { count: 2 } });
    render(<SessionLivePanel event={event} canOperate isCoach />);

    await user.click(await screen.findByRole('tab', { name: /200m Heat 1/ }));
    const teamARow = await screen.findByRole('group', { name: 'Ari Runner' });
    expect(within(teamARow).getByText('Team A')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Bea Dash' })).getByText('Team B')).toBeInTheDocument();
  });

  it('renders nothing for a legacy 100m event', () => {
    const legacy: AthleticsEvent = { ...event, discipline: '100m' };
    const { container } = render(<SessionLivePanel event={legacy} canOperate isCoach />);
    expect(container).toBeEmptyDOMElement();
  });
  it('shows automatic measured results without selection controls', async () => {
    sessionStatus = 'in_progress';
    api.listDisciplines.mockResolvedValue({ data: [{ id: 'relay-400', kind: 'field', unit: 'metres', precision: 2, presentation: { label: 'Long Jump' }, defaultRules: { aggregation: 'best', entrantType: 'individual' } }] });
    const user = userEvent.setup();
    render(<SessionLivePanel event={event} canOperate isCoach />);
    await user.click(await screen.findByRole('tab', { name: /4x400m Heat 1/ }));
    expect(await screen.findByText('Automatic best legal')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make official' })).not.toBeInTheDocument();
  });
  it('does not give a logger finalization authority', async () => {
    sessionStatus = 'in_progress';
    const user = userEvent.setup();
    render(<SessionLivePanel event={event} canOperate isCoach={false} />);
    await user.click(await screen.findByRole('tab', { name: /4x400m Heat 1/ }));
    expect(screen.queryByRole('button', { name: 'Finalize session' })).not.toBeInTheDocument();
  });

  it('logs a vertical clearance with countback standings and voids an attempt', async () => {
    api.listDisciplines.mockResolvedValue({ data: [{
      id: 'high-jump', code: 'high_jump', kind: 'vertical', unit: 'metres', precision: 2,
      presentation: { label: 'High jump' },
      defaultRules: { aggregation: 'vertical', entrantType: 'individual', failureLimit: 3, heightIncrement: 0.02, round: 'final' },
    }] });
    api.listSessions.mockImplementation(async () => ({ data: [{
      id: 'session-1',
      workspaceId: 'ws-1',
      resultState,
      disciplineDefinitionId: 'high-jump',
      label: 'High jump Final',
      status: sessionStatus,
      version: sessionVersion,
      verticalConfig: { startingHeight: 1.5, heightIncrement: 0.02, failureLimit: 3, round: 'final' },
    }] }));
    api.listRegistrations.mockResolvedValue({ data: [
      { id: 'reg-a', eventId: 'event-1', disciplineSessionId: 'session-1', entrantId: 'athlete-a', workspaceId: 'ws-1', withdrawnAt: null, withdrawnBy: null, createdBy: 'coach-1', createdAt: '2026-09-20T09:00:00.000Z' },
    ], meta: { count: 1 } });
    api.listSessionEntries.mockResolvedValue({ data: [{
      id: 'entry-v1', eventId: 'event-1', disciplineSessionId: 'session-1', entrantId: 'athlete-a',
      entryType: 'attempt', value: 1.5, unit: 'metres', isFoul: false, incidentType: null, noteText: null,
      verticalState: 'clearance', attemptOrder: 1,
      recordedBy: 'coach-1', version: 1, createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z', deletedAt: null,
    }] });
    api.listSessionResults.mockResolvedValue({ data: [{
      eventId: 'event-1', disciplineSessionId: 'session-1', entrantId: 'athlete-a',
      outcome: 'valid', finalResult: 1.5, effectiveOutcome: 'valid', effectiveResult: 1.5, placing: 1,
      vertical: { failuresAtBest: 0, totalFailuresToBest: 0, consecutiveFailures: 0, eliminated: false },
      isPb: false, isSb: false, manualOverride: null, overrideReason: null, overriddenBy: null, overriddenAt: null,
      selectedEntryId: null, version: 1, updatedAt: '2026-09-20T10:00:00.000Z',
    }] });
    const user = userEvent.setup();
    render(<SessionLivePanel event={event} canOperate isCoach />);

    await user.click(await screen.findByRole('tab', { name: /High jump Final/ }));
    await user.click(await screen.findByRole('button', { name: 'Start session' }));
    const row = await screen.findByRole('group', { name: 'Ari Runner' });

    expect(await within(row).findByLabelText('Target height (m) for Ari Runner')).toHaveValue(1.5);
    expect(screen.getByText(/starts at 1\.50 m, then \+0\.02 m per height\. 3 consecutive failures/)).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Clearance' }));
    await waitFor(() => expect(api.createSessionEntry).toHaveBeenCalledWith(
      'event-1',
      { disciplineSessionId: 'session-1', entrantId: 'athlete-a' },
      expect.objectContaining({ entryType: 'attempt', value: 1.5, unit: 'metres', verticalState: 'clearance' }),
    ));

    expect(await screen.findByRole('columnheader', { name: 'Countback' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('0 / 0');
    await user.click(await within(row).findByRole('button', { name: 'Void attempt 1' }));
    await waitFor(() => expect(api.replaceSessionEntry).toHaveBeenCalledWith(
      'event-1',
      { disciplineSessionId: 'session-1', entrantId: 'athlete-a' },
      'entry-v1',
      expect.objectContaining({ verticalState: 'void', expectedVersion: 1 }),
    ));
  });

  it('hides entrants who are not registered for this session', async () => {
    api.listDisciplines.mockResolvedValue({ data: [{ id: 'track-200', code: '200m', kind: 'track', unit: 'seconds', precision: 2, presentation: { label: '200m' }, defaultRules: { aggregation: 'timed', entrantType: 'individual' } }] });
    api.listSessions.mockImplementation(async () => ({ data: [{
      id: 'session-1',
      workspaceId: 'ws-1',
      resultState,
      disciplineDefinitionId: 'track-200',
      label: '200m Heat 1',
      status: sessionStatus,
      version: sessionVersion,
    }] }));
    api.listRegistrations.mockResolvedValue({ data: [], meta: { count: 0 } });
    const user = userEvent.setup();
    render(<SessionLivePanel event={event} canOperate isCoach />);

    await user.click(await screen.findByRole('tab', { name: /200m Heat 1/ }));
    expect(screen.queryByRole('group', { name: 'Ari Runner' })).not.toBeInTheDocument();
    expect(screen.getByText('No one is registered for this session yet. Add entrants from the meet roster.')).toBeInTheDocument();
  });
});
