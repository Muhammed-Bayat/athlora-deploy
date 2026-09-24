import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AthleticsEvent } from '../../types';
import { MeetRosterPanel } from './MeetRosterPanel';

const api = vi.hoisted(() => ({ listDisciplines: vi.fn(), listSessions: vi.fn(), listEntrants: vi.fn(), listRegistrations: vi.fn(), createEntrant: vi.fn(), registerEntrant: vi.fn(), withdrawEntrant: vi.fn(), createSession: vi.fn(), changeSessionState: vi.fn() }));
const athletes = vi.hoisted(() => ({ listAthletes: vi.fn() }));
vi.mock('../../api/meets', () => api);
vi.mock('../../api/athletes', () => athletes);

const event: AthleticsEvent = { id: 'event-1', createdBy: 'coach-1', type: 'competition', discipline: null, title: 'Open meet', date: '2026-09-01', time: null, locationName: null, latitude: null, longitude: null, status: 'scheduled', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };

describe('MeetRosterPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listDisciplines.mockResolvedValue({ data: [{ id: 'track', kind: 'track', presentation: { label: '200m' }, defaultRules: { entrantType: 'individual' } }, { id: 'relay', kind: 'relay', presentation: { label: '4 x 100m relay' }, defaultRules: { entrantType: 'relay', teamSize: 4 } }] });
    api.listSessions.mockResolvedValue({ data: [{ id: 'session', disciplineDefinitionId: 'track', label: '200m', status: 'scheduled', version: 1 }] });
    api.listEntrants.mockResolvedValue({ data: [{ id: 'entrant', kind: 'guest', athleteId: null, name: 'Guest runner', clubName: 'Visitors', details: 'Lane 4', memberIds: [] }] });
    api.listRegistrations.mockResolvedValue({ data: [{ id: 'registration', disciplineSessionId: 'session', entrantId: 'entrant', withdrawnAt: null }] });
    athletes.listAthletes.mockResolvedValue({ data: [{ id: 'athlete', name: 'Ari Runner' }] });
  });

  it('keeps generic roster setup accessible and supports an independent withdrawal', async () => {
    const user = userEvent.setup();
    render(<MeetRosterPanel event={event} canOperate isCoach />);
    expect(await screen.findByRole('region', { name: 'Multi-discipline meet roster' })).toHaveTextContent('Legacy 100m participants and timeline controls do not apply here.');
    await user.selectOptions(screen.getByLabelText('Session'), 'session');
    expect(await screen.findByRole('list', { name: 'Registered entrants' })).toHaveTextContent('Guest runner: registered (Visitors) - Lane 4');
    await user.selectOptions(screen.getByLabelText('Entrant'), 'entrant');
    await user.click(screen.getByRole('button', { name: 'Withdraw from session' }));
    await waitFor(() => expect(api.withdrawEntrant).toHaveBeenCalledWith('event-1', { disciplineSessionId: 'session', entrantId: 'entrant' }));
  });
  it('sends optional guest club and details when creating a guest', async () => {
    const user = userEvent.setup();
    api.createEntrant.mockResolvedValue({ id: 'new-entrant' });
    render(<MeetRosterPanel event={event} canOperate isCoach />);
    await user.selectOptions(await screen.findByLabelText('Session'), 'session');
    await user.type(screen.getByLabelText('Guest name'), 'Sam Guest');
    await user.type(screen.getByLabelText('Guest club (optional)'), 'Visitors');
    await user.type(screen.getByLabelText('Guest details (optional)'), 'Lane 4');
    await user.click(screen.getByRole('button', { name: 'Add guest' }));
    await waitFor(() => expect(api.createEntrant).toHaveBeenCalledWith('event-1', {
      kind: 'guest', name: 'Sam Guest', clubName: 'Visitors', details: 'Lane 4',
    }));
  });
});
