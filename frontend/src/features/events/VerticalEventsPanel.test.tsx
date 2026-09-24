import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import * as api from '../../api/meets';
import type { AthleticsEvent } from '../../types';
import { VerticalEventsPanel } from './VerticalEventsPanel';

vi.mock('../../api/meets', () => ({ listDisciplines: vi.fn(), listSessions: vi.fn(), listEntrants: vi.fn(), listRegistrations: vi.fn(), listSessionEntries: vi.fn(), listSessionResults: vi.fn(), createSessionEntry: vi.fn(), changeSessionState: vi.fn() }));
const config = { startingHeight: 1.5, heightIncrement: 0.05, failureLimit: 3, round: 'final' };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listDisciplines).mockResolvedValue({ data: [{ id: 'd', kind: 'vertical', precision: 2, presentation: { label: 'High Jump' }, defaultRules: { aggregation: 'vertical', entrantType: 'individual' } }] } as never);
  vi.mocked(api.listSessions).mockResolvedValue({ data: [{ id: 's', disciplineDefinitionId: 'd', label: 'High Jump', status: 'in_progress', version: 2, verticalConfig: config }] } as never);
  vi.mocked(api.listEntrants).mockResolvedValue({ data: [{ id: 'en', name: 'Ari', kind: 'guest' }] } as never);
  vi.mocked(api.listRegistrations).mockResolvedValue({ data: [{ entrantId: 'en', withdrawnAt: null }] } as never);
  vi.mocked(api.listSessionEntries).mockResolvedValue({ data: [] } as never);
  vi.mocked(api.listSessionResults).mockResolvedValue({ data: [] } as never);
});
it('logs a height-specific clearance and displays the authoritative result without best selection', async () => {
  render(<VerticalEventsPanel event={{ id: 'event', status: 'in_progress' } as AthleticsEvent} canOperate isCoach />);
  await screen.findByRole('option', { name: 'High Jump — in_progress' });
  fireEvent.change(screen.getByLabelText('Vertical session'), { target: { value: 's' } });
  await screen.findByRole('option', { name: 'Ari' });
  fireEvent.change(screen.getByLabelText('Vertical entrant'), { target: { value: 'en' } });
  vi.mocked(api.listSessionResults).mockResolvedValue({ data: [{ entrantId: 'en', effectiveResult: 1.5, effectiveOutcome: 'valid', placing: null, vertical: { failuresAtBest: 0, totalFailuresToBest: 0, eliminated: false } }] } as never);
  fireEvent.click(screen.getByRole('button', { name: 'clearance' }));
  await waitFor(() => expect(api.createSessionEntry).toHaveBeenCalledWith('event', { disciplineSessionId: 's', entrantId: 'en' }, expect.objectContaining({ verticalState: 'clearance', value: 1.5, unit: 'metres' })));
  expect(await screen.findByRole('cell', { name: '1.50 m' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next height' }));
  expect(screen.getByLabelText('Target height (m)')).toHaveValue(1.55);
  fireEvent.click(screen.getByRole('button', { name: 'Finalize vertical session' }));
  await waitFor(() => expect(api.changeSessionState).toHaveBeenCalledWith('event', 's', 'completed', 2));
});
