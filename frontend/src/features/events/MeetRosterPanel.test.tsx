import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AthleticsEvent } from '../../types';
import { MeetRosterPanel } from './MeetRosterPanel';

const api = vi.hoisted(() => ({ listDisciplines: vi.fn(), listSessions: vi.fn(), listEntrants: vi.fn(), listRegistrations: vi.fn(), createEntrant: vi.fn(), updateEntrant: vi.fn(), registerEntrant: vi.fn(), withdrawEntrant: vi.fn(), updateRegistrationRsvp: vi.fn(), changeSessionState: vi.fn() }));
const athletes = vi.hoisted(() => ({ listAthletes: vi.fn() }));
vi.mock('../../api/meets', () => api);
vi.mock('../../api/athletes', () => athletes);

const event: AthleticsEvent = { id: 'event-1', createdBy: 'coach-1', type: 'competition', discipline: null, title: 'Open meet', date: '2026-09-01', time: null, locationName: null, latitude: null, longitude: null, status: 'scheduled', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };

async function selectThemedOption(user: ReturnType<typeof userEvent.setup>, label: string, option: string | RegExp) {
  const trigger = screen.getByRole('button', { name: label });
  await user.click(trigger);
  const menu = trigger.parentElement?.querySelector<HTMLElement>('[role="listbox"]');
  expect(menu).toBeInTheDocument();
  await user.click(within(menu!).getByRole('option', { name: option }));
}

describe('MeetRosterPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listDisciplines.mockResolvedValue({ data: [
      { id: 'track', kind: 'track', presentation: { label: '200m' }, defaultRules: { entrantType: 'individual' } },
      { id: 'relay', kind: 'relay', presentation: { label: '4 x 100m relay' }, defaultRules: { entrantType: 'relay', teamSize: 4 } },
    ] });
    api.listSessions.mockResolvedValue({ data: [
      { id: 'session-track', disciplineDefinitionId: 'track', label: '200m', status: 'scheduled', version: 1 },
      { id: 'session-relay', disciplineDefinitionId: 'relay', label: '4 x 100m relay', status: 'scheduled', version: 1 },
    ] });
    api.listEntrants.mockResolvedValue({ data: [
      { id: 'athlete-entrant', kind: 'athlete', athleteId: 'athlete', name: 'Ari Runner', clubName: null, details: null, memberIds: [] },
      { id: 'team', kind: 'relay', athleteId: null, name: 'Blue relay', clubName: null, details: null, memberIds: ['athlete-entrant'] },
    ] });
    api.listRegistrations.mockImplementation(async (_eventId: string, sessionId: string) => ({ data: sessionId === 'session-track'
      ? [{ id: 'track-registration', disciplineSessionId: 'session-track', entrantId: 'athlete-entrant', rsvpStatus: 'pending', withdrawnAt: null }]
      : [{ id: 'relay-registration', disciplineSessionId: 'session-relay', entrantId: 'team', rsvpStatus: 'yes', withdrawnAt: null }],
    }));
    athletes.listAthletes.mockResolvedValue({ data: [
      { id: 'athlete', name: 'Ari Runner', status: 'active', squads: [] },
      { id: 'athlete-2', name: 'Bea Runner', status: 'active', squads: [] },
    ] });
  });

  it('uses session tabs with the familiar roster rows and RSVP controls', async () => {
    const user = userEvent.setup();
    render(<MeetRosterPanel event={event} canOperate isCoach />);

    const trackTab = await screen.findByRole('tab', { name: /200m/i, selected: true });
    expect(screen.queryByText(/Generic meet sessions/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add session' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Register for session' })).not.toBeInTheDocument();
    expect(screen.queryByText('Guest entrant')).not.toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Session roster' })).toHaveTextContent('Ari RunnerNo squad assignedActive');
    expect(screen.getByText('Pending 1 · Yes 0 · No 0 · Maybe 0')).toBeInTheDocument();

    await selectThemedOption(user, 'RSVP for Ari Runner', 'Attending');
    await waitFor(() => expect(api.updateRegistrationRsvp).toHaveBeenCalledWith('event-1', {
      disciplineSessionId: 'session-track', entrantId: 'athlete-entrant',
    }, 'yes'));

    await user.click(screen.getByRole('button', { name: 'Remove Ari Runner from session' }));
    await waitFor(() => expect(api.withdrawEntrant).toHaveBeenCalledWith('event-1', {
      disciplineSessionId: 'session-track', entrantId: 'athlete-entrant',
    }));

    trackTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(await screen.findByRole('tab', { name: /4 x 100m relay/i, selected: true })).toHaveFocus();
  });

  it('shows relay creation only for a selected relay session and never exposes guest entry', async () => {
    const user = userEvent.setup();
    render(<MeetRosterPanel event={event} canOperate isCoach />);

    await screen.findByRole('tabpanel');
    expect(screen.queryByRole('button', { name: 'Add relay' })).not.toBeInTheDocument();
    expect(screen.queryByText('Guest entrant')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /4 x 100m relay/i }));

    expect(await screen.findByRole('group', { name: /Relay team/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add relay athletes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add relay' })).toBeInTheDocument();
    expect(screen.queryByText('Guest entrant')).not.toBeInTheDocument();
  });
});
