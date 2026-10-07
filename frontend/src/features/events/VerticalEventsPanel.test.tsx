import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import * as api from '../../api/meets';
import type { AthleticsEvent } from '../../types';
import { VerticalEventsPanel } from './VerticalEventsPanel';

vi.mock('../../api/meets', () => ({ listDisciplines: vi.fn(), listSessions: vi.fn(), listEntrants: vi.fn(), listRegistrations: vi.fn(), listSessionEntries: vi.fn(), listSessionResults: vi.fn(), createSessionEntry: vi.fn(), changeSessionState: vi.fn() }));
const workspace = vi.hoisted(() => ({ current: 'ws-1' }));
vi.mock('../auth/WorkspaceContext', () => ({ useWorkspace: () => ({ activeWorkspace: { id: workspace.current } }) }));
const config = { startingHeight: 1.5, heightIncrement: 0.05, failureLimit: 3, round: 'final' };
const event = { id: 'event', workspaceId: 'ws-1', status: 'in_progress' } as AthleticsEvent;
beforeEach(() => {
  vi.clearAllMocks();
  workspace.current = 'ws-1';
  vi.mocked(api.listDisciplines).mockResolvedValue({ data: [{ id: 'd', kind: 'vertical', precision: 2, presentation: { label: 'High Jump' }, defaultRules: { aggregation: 'vertical', entrantType: 'individual' } }] } as never);
  vi.mocked(api.listSessions).mockResolvedValue({ data: [{ id: 's', disciplineDefinitionId: 'd', label: 'High Jump', status: 'in_progress', version: 2, verticalConfig: config }] } as never);
  vi.mocked(api.listEntrants).mockResolvedValue({ data: [{ id: 'en', name: 'Ari', kind: 'guest' }] } as never);
  vi.mocked(api.listRegistrations).mockResolvedValue({ data: [{ entrantId: 'en', withdrawnAt: null }] } as never);
  vi.mocked(api.listSessionEntries).mockResolvedValue({ data: [] } as never);
  vi.mocked(api.listSessionResults).mockResolvedValue({ data: [] } as never);
});
it('logs a height-specific clearance and displays the authoritative result without best selection', async () => {
  const user = userEvent.setup();
  render(<VerticalEventsPanel event={event} canOperate isCoach />);
  await screen.findByRole('button', { name: 'Vertical session' });
  await user.click(screen.getByRole('button', { name: 'Vertical session' }));
  await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'High Jump — in_progress' }));
  await screen.findByRole('button', { name: 'Vertical entrant' });
  await user.click(screen.getByRole('button', { name: 'Vertical entrant' }));
  await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Ari' }));
  vi.mocked(api.listSessionResults).mockResolvedValue({ data: [{ entrantId: 'en', effectiveResult: 1.5, effectiveOutcome: 'valid', placing: null, vertical: { failuresAtBest: 0, totalFailures: 0, eliminated: false } }] } as never);
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  await waitFor(() => expect(api.createSessionEntry).toHaveBeenCalledWith('event', { disciplineSessionId: 's', entrantId: 'en' }, expect.objectContaining({ verticalState: 'clearance', value: 1.5, unit: 'metres' })));
  expect(screen.getByRole('button', { name: 'Fail' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
  await waitFor(() => expect(api.createSessionEntry).toHaveBeenCalledWith('event', { disciplineSessionId: 's', entrantId: 'en' }, expect.objectContaining({ verticalState: 'pass', value: 1.5, unit: 'metres' })));
  expect(await screen.findByRole('cell', { name: '1.50 m' })).toBeInTheDocument();
  expect(screen.getByRole('table')).toHaveTextContent('Guest');
  expect(screen.getByRole('table')).toHaveTextContent('Ari');
  fireEvent.click(screen.getByRole('button', { name: 'Next height' }));
  expect(screen.getByLabelText('Target height (m)')).toHaveValue(1.55);
  fireEvent.click(screen.getByRole('button', { name: 'Finalize vertical session' }));
  await waitFor(() => expect(api.changeSessionState).toHaveBeenCalledWith('event', 's', 'completed', 2));
});

it('hides void controls for entries recorded by another club', async () => {
  const user = userEvent.setup();
  vi.mocked(api.listSessionEntries).mockResolvedValue({ data: [{
    id: 'own-entry', entrantId: 'en', entryType: 'attempt', value: 1.5, unit: 'metres', isFoul: false,
    incidentType: null, noteText: null, verticalState: 'clearance', attemptOrder: 1, version: 1,
  }, {
    id: 'foreign-entry', entrantId: 'en', entryType: 'attempt', value: 1.55, unit: 'metres', isFoul: false,
    incidentType: null, noteText: null, verticalState: 'failure', attemptOrder: 2, version: 1, canEdit: false,
  }] } as never);
  render(<VerticalEventsPanel event={event} canOperate isCoach />);
  await user.click(await screen.findByRole('button', { name: 'Vertical session' }));
  await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'High Jump — in_progress' }));
  await user.click(screen.getByRole('button', { name: 'Vertical entrant' }));
  await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Ari' }));
  expect(screen.getByRole('button', { name: 'Void attempt 1' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Void attempt 2' })).not.toBeInTheDocument();
});

it('keeps vertical finalize and reopen controls on the host workspace only', async () => {
  const user = userEvent.setup();
  const openSession = async (status: string) => {
    await user.click(await screen.findByRole('button', { name: 'Vertical session' }));
    await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: `High Jump — ${status}` }));
  };

  const hostLive = render(<VerticalEventsPanel event={event} canOperate isCoach />);
  await openSession('in_progress');
  expect(screen.getByRole('button', { name: 'Finalize vertical session' })).toBeInTheDocument();
  hostLive.unmount();

  workspace.current = 'ws-2';
  const guestLive = render(<VerticalEventsPanel event={event} canOperate isCoach />);
  await openSession('in_progress');
  expect(screen.queryByRole('button', { name: 'Finalize vertical session' })).not.toBeInTheDocument();
  guestLive.unmount();

  vi.mocked(api.listSessions).mockResolvedValue({ data: [{ id: 's', disciplineDefinitionId: 'd', label: 'High Jump', status: 'completed', version: 2, verticalConfig: config }] } as never);
  const guestCompleted = render(<VerticalEventsPanel event={event} canOperate isCoach />);
  await openSession('completed');
  expect(screen.queryByRole('button', { name: 'Reopen vertical session' })).not.toBeInTheDocument();
  guestCompleted.unmount();

  workspace.current = 'ws-1';
  const hostCompleted = render(<VerticalEventsPanel event={event} canOperate isCoach />);
  await openSession('completed');
  expect(screen.getByRole('button', { name: 'Reopen vertical session' })).toBeInTheDocument();
  hostCompleted.unmount();
});
