import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AthleticsEvent, RsvpStatus } from '../../types';
import { MeetRosterPanel } from './MeetRosterPanel';

const api = vi.hoisted(() => ({ listDisciplines: vi.fn(), listSessions: vi.fn(), listEntrants: vi.fn(), listRegistrations: vi.fn(), createEntrant: vi.fn(), updateEntrant: vi.fn(), registerEntrant: vi.fn(), withdrawEntrant: vi.fn(), changeSessionState: vi.fn() }));
const athletes = vi.hoisted(() => ({ listAthletes: vi.fn() }));
const participants = vi.hoisted(() => ({ listEventParticipants: vi.fn(), addEventParticipant: vi.fn(), updateEventParticipant: vi.fn() }));
const fixturesApi = vi.hoisted(() => ({ listGuestFixtureParticipants: vi.fn(), addGuestFixtureParticipant: vi.fn(), updateGuestFixtureParticipant: vi.fn() }));
vi.mock('../../api/meets', () => api);
vi.mock('../../api/athletes', () => athletes);
vi.mock('../../api/participants', () => participants);
vi.mock('../../api/fixtures', () => fixturesApi);

const event: AthleticsEvent = { id: 'event-1', workspaceId: 'workspace-1', createdBy: 'coach-1', type: 'competition', discipline: null, title: 'Open meet', date: '2026-09-01', time: null, locationName: null, latitude: null, longitude: null, status: 'scheduled', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };

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
      { id: 'athlete-entrant', workspaceId: 'host-workspace', kind: 'athlete', athleteId: 'athlete', name: 'Ari Runner', clubName: null, details: null, memberIds: [] },
      { id: 'guest-entrant', workspaceId: 'guest-workspace', kind: 'athlete', athleteId: 'guest-athlete', name: 'Gia Guest', clubName: null, details: null, memberIds: [] },
      { id: 'team', workspaceId: 'host-workspace', kind: 'relay', athleteId: null, name: 'Blue relay', clubName: null, details: null, memberIds: ['athlete-entrant'] },
    ] });
    api.listRegistrations.mockImplementation(async (_eventId: string, sessionId: string) => ({ data: sessionId === 'session-track'
      ? [{ id: 'track-registration', disciplineSessionId: 'session-track', entrantId: 'athlete-entrant', withdrawnAt: null }, { id: 'guest-registration', disciplineSessionId: 'session-track', entrantId: 'guest-entrant', withdrawnAt: null }]
      : [{ id: 'relay-registration', disciplineSessionId: 'session-relay', entrantId: 'team', withdrawnAt: null }],
    }));
    athletes.listAthletes.mockResolvedValue({ data: [
      { id: 'athlete', name: 'Ari Runner', status: 'active', preferredDisciplineIds: ['track', 'relay'], squads: [] },
      { id: 'athlete-2', name: 'Bea Runner', status: 'active', preferredDisciplineIds: ['track', 'relay'], squads: [] },
    ] });
    participants.listEventParticipants.mockResolvedValue({ data: [{ athleteId: 'athlete', rsvpStatus: 'pending' }] });
    fixturesApi.listGuestFixtureParticipants.mockResolvedValue({ data: [], meta: { count: 0 } });
    fixturesApi.addGuestFixtureParticipant.mockResolvedValue({} as never);
    fixturesApi.updateGuestFixtureParticipant.mockResolvedValue({} as never);
  });

  it('uses session tabs with the familiar roster rows and RSVP controls', async () => {
    const user = userEvent.setup();
    render(<MeetRosterPanel event={event} canOperate isCoach activeWorkspaceId="host-workspace" isGuest={false} />);

    const trackTab = await screen.findByRole('tab', { name: /200m/i, selected: true });
    expect(screen.queryByText(/Generic meet sessions/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add session' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Register for session' })).not.toBeInTheDocument();
    expect(screen.queryByText('Guest entrant')).not.toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Session roster' })).toHaveTextContent('Ari RunnerNo squad assignedActive');
    expect(screen.queryByText('Gia Guest')).not.toBeInTheDocument();
    expect(screen.getByText('Pending 1 · Yes 0 · No 0 · Maybe 0')).toBeInTheDocument();

    await selectThemedOption(user, 'RSVP for Ari Runner', 'Attending');
    await waitFor(() => expect(participants.updateEventParticipant).toHaveBeenCalledWith('event-1', 'athlete', 'yes'));

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
    render(<MeetRosterPanel event={event} canOperate isCoach activeWorkspaceId="host-workspace" isGuest={false} />);

    await screen.findByRole('tabpanel');
    expect(screen.queryByRole('button', { name: 'Add relay' })).not.toBeInTheDocument();
    expect(screen.queryByText('Guest entrant')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /4 x 100m relay/i }));

    expect(await screen.findByRole('group', { name: /Relay team/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add relay athletes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add relay' })).toBeInTheDocument();
    expect(screen.queryByText('Guest entrant')).not.toBeInTheDocument();
  });

  it('only offers athletes whose selected discipline matches the active session tab', async () => {
    const user = userEvent.setup();
    api.listDisciplines.mockResolvedValue({ data: [{ id: 'hammer', kind: 'field', presentation: { label: 'Hammer throw' }, defaultRules: { entrantType: 'individual' } }] });
    api.listSessions.mockResolvedValue({ data: [{ id: 'hammer-session', disciplineDefinitionId: 'hammer', label: 'Hammer throw', status: 'scheduled', version: 1 }] });
    api.listEntrants.mockResolvedValue({ data: [] });
    api.listRegistrations.mockResolvedValue({ data: [] });
    athletes.listAthletes.mockResolvedValue({ data: [
      { id: 'hammer-athlete', name: 'Hana Hammer', status: 'active', preferredDisciplineIds: ['hammer'], squads: [] },
      { id: 'sprinter', name: 'Sami Sprinter', status: 'active', preferredDisciplineIds: ['track'], squads: [] },
    ] });

    render(<MeetRosterPanel event={event} canOperate isCoach activeWorkspaceId="host-workspace" isGuest={false} />);

    await user.click(await screen.findByRole('button', { name: 'Add athletes' }));
    expect(screen.getByText('Hana Hammer')).toBeInTheDocument();
    expect(screen.queryByText('Sami Sprinter')).not.toBeInTheDocument();
  });

  it('lets an accepted guest register athletes and track their RSVP with the fixture guest API', async () => {
    const user = userEvent.setup();
    let guestRsvp: RsvpStatus = 'pending';
    let guestEntrants: Array<Record<string, unknown>> = [];
    let guestRegistrations: Array<Record<string, unknown>> = [];
    api.listSessions.mockResolvedValue({ data: [{ id: 'session-track', disciplineDefinitionId: 'track', label: '200m', status: 'scheduled', version: 1 }] });
    api.listEntrants.mockImplementation(async () => ({ data: guestEntrants, meta: { count: guestEntrants.length } }));
    api.listRegistrations.mockImplementation(async () => ({ data: guestRegistrations, meta: { count: guestRegistrations.length } }));
    athletes.listAthletes.mockResolvedValue({ data: [{ id: 'guest-athlete', name: 'Gia Guest', status: 'active', preferredDisciplineIds: ['track'], squads: [] }] });
    api.createEntrant.mockImplementation(async () => {
      guestEntrants = [{ id: 'guest-entrant', workspaceId: 'guest-workspace', kind: 'athlete', athleteId: 'guest-athlete', name: 'Gia Guest', clubName: null, details: null, memberIds: [] }];
      return guestEntrants[0];
    });
    api.registerEntrant.mockImplementation(async () => {
      guestRegistrations = [{ id: 'guest-registration', disciplineSessionId: 'session-track', entrantId: 'guest-entrant', withdrawnAt: null }];
      return guestRegistrations[0];
    });
    let guestAdded = false;
    fixturesApi.listGuestFixtureParticipants.mockImplementation(async () => ({ data: guestAdded ? [{ athleteId: 'guest-athlete', rsvpStatus: guestRsvp }] : [], meta: { count: guestAdded ? 1 : 0 } }));
    fixturesApi.addGuestFixtureParticipant.mockImplementation(async () => { guestAdded = true; return {} as never; });
    fixturesApi.updateGuestFixtureParticipant.mockImplementation(async (_eventId: string, _athleteId: string, rsvp: RsvpStatus) => {
      guestRsvp = rsvp;
      return {} as never;
    });

    render(<MeetRosterPanel event={event} canOperate isCoach activeWorkspaceId="guest-workspace" isGuest />);

    await user.click(await screen.findByRole('button', { name: 'Add athletes' }));
    await user.click(screen.getByRole('checkbox', { name: /Gia Guest/i }));
    await user.click(screen.getByRole('button', { name: 'Add 1 athlete' }));
    await waitFor(() => expect(api.registerEntrant).toHaveBeenCalledWith('event-1', { disciplineSessionId: 'session-track', entrantId: 'guest-entrant' }));
    expect(fixturesApi.addGuestFixtureParticipant).toHaveBeenCalledWith('event-1', 'guest-athlete');
    expect(participants.listEventParticipants).not.toHaveBeenCalled();
    expect(participants.addEventParticipant).not.toHaveBeenCalled();
    expect(screen.getByText('Roster filter')).toBeInTheDocument();
    expect(screen.getByText('Pending 1 · Yes 0 · No 0 · Maybe 0')).toBeInTheDocument();

    await selectThemedOption(user, 'RSVP for Gia Guest', 'Not attending');
    await waitFor(() => expect(fixturesApi.updateGuestFixtureParticipant).toHaveBeenCalledWith('event-1', 'guest-athlete', 'no'));
    expect(participants.updateEventParticipant).not.toHaveBeenCalled();
    expect(await screen.findByText('Pending 0 · Yes 0 · No 1 · Maybe 0')).toBeInTheDocument();
  });
});
