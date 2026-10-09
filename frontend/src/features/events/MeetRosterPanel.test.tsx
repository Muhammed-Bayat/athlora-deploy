import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AthleticsEvent, RsvpStatus } from '../../types';
import { MeetRosterPanel } from './MeetRosterPanel';

const api = vi.hoisted(() => ({ listDisciplines: vi.fn(), listSessions: vi.fn(), listEntrants: vi.fn(), listRegistrations: vi.fn(), createEntrant: vi.fn(), updateEntrant: vi.fn(), registerEntrant: vi.fn(), withdrawEntrant: vi.fn(), bulkAddRoster: vi.fn(), changeSessionState: vi.fn(), queueSessionFinalization: vi.fn() }));
const athletes = vi.hoisted(() => ({ listAthletes: vi.fn() }));
const participants = vi.hoisted(() => ({ listEventParticipants: vi.fn(), addEventParticipant: vi.fn(), updateEventParticipant: vi.fn() }));
const fixturesApi = vi.hoisted(() => ({ listGuestFixtureParticipants: vi.fn(), addGuestFixtureParticipant: vi.fn(), updateGuestFixtureParticipant: vi.fn() }));
vi.mock('../../api/meets', () => api);
vi.mock('../../api/athletes', () => athletes);
vi.mock('../../api/participants', () => participants);
vi.mock('../../api/fixtures', () => fixturesApi);

const event: AthleticsEvent = { id: 'event-1', workspaceId: 'workspace-1', createdBy: 'coach-1', type: 'competition', discipline: null, title: 'Open meet', date: '2026-09-01', time: null, locationName: null, latitude: null, longitude: null, status: 'scheduled', archivedAt: null, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };

const relayPool = [
  { athleteId: 'a1', entrantId: 'e1', name: 'Ari Runner' },
  { athleteId: 'a2', entrantId: 'e2', name: 'Bea Runner' },
  { athleteId: 'a3', entrantId: 'e3', name: 'Cal Runner' },
  { athleteId: 'a4', entrantId: 'e4', name: 'Dee Runner' },
  { athleteId: 'a5', entrantId: 'e5', name: 'Eli Runner' },
];

function relayEntrant(index: number) {
  const member = relayPool[index]!;
  return { id: member.entrantId, workspaceId: 'host-workspace', kind: 'athlete', athleteId: member.athleteId, name: member.name, clubName: null, details: null, memberIds: [] };
}

function mockRelayPool(initial: Partial<Record<string, RsvpStatus>> = {}) {
  const rsvp: Record<string, RsvpStatus> = Object.fromEntries(relayPool.map((member) => [member.athleteId, initial[member.athleteId] ?? 'pending']));
  const poolEntrants = relayPool.map((_, index) => relayEntrant(index));
  api.listEntrants.mockImplementation(async () => ({ data: poolEntrants }));
  api.listRegistrations.mockResolvedValue({ data: [] });
  athletes.listAthletes.mockResolvedValue({ data: relayPool.map((member) => ({ id: member.athleteId, name: member.name, status: 'active', preferredDisciplineIds: ['relay'] })) });
  participants.listEventParticipants.mockImplementation(async () => ({ data: relayPool.filter((member) => rsvp[member.athleteId] !== undefined).map((member) => ({ athleteId: member.athleteId, rsvpStatus: rsvp[member.athleteId] })) }));
  participants.addEventParticipant.mockResolvedValue({} as never);
  participants.updateEventParticipant.mockImplementation(async (_eventId: string, athleteId: string, status: RsvpStatus) => { rsvp[athleteId] = status; return {} as never; });
  return { rsvp, poolEntrants };
}

async function selectRelayPoolAthletes(user: ReturnType<typeof userEvent.setup>, names: string[]) {
  for (const name of names) await user.click(screen.getByRole('checkbox', { name: new RegExp(name) }));
}

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
      { id: 'track', code: '200m', kind: 'track', presentation: { label: '200m' }, defaultRules: { entrantType: 'individual' } },
      { id: 'relay', code: '4x100m', kind: 'relay', presentation: { label: '4 x 100m relay' }, defaultRules: { entrantType: 'relay', teamSize: 4 } },
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
      { id: 'athlete', name: 'Ari Runner', status: 'active', preferredDisciplineIds: ['track', 'relay'] },
      { id: 'athlete-2', name: 'Bea Runner', status: 'active', preferredDisciplineIds: ['track', 'relay'] },
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
    expect(await screen.findByRole('list', { name: 'Session roster' })).toHaveTextContent('Ari RunnerAthleteActive');
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
    const relayTab = await screen.findByRole('tab', { name: /4 x 100m relay/i, selected: true });
    await waitFor(() => expect(relayTab).toHaveFocus());
  });

  it('orders session tabs by the canonical discipline order', async () => {
    api.listSessions.mockResolvedValue({ data: [
      { id: 'session-relay', disciplineDefinitionId: 'relay', label: '4 x 100m relay', status: 'scheduled', version: 1 },
      { id: 'session-track', disciplineDefinitionId: 'track', label: '200m', status: 'scheduled', version: 1 },
    ] });
    render(<MeetRosterPanel event={event} canOperate isCoach activeWorkspaceId="host-workspace" isGuest={false} />);

    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.querySelector('span')?.textContent)).toEqual(['200m', '4 x 100m relay']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('wraps the session tablist and roster panel in one shared card parent', async () => {
    render(<MeetRosterPanel event={event} canOperate isCoach activeWorkspaceId="host-workspace" isGuest={false} />);

    const tablist = await screen.findByRole('tablist', { name: 'Event discipline sessions' });
    const panel = await screen.findByRole('tabpanel');
    expect(tablist.parentElement).toBe(panel.parentElement);
    expect(screen.getByRole('region', { name: 'Event roster' })).not.toBe(tablist.parentElement);
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
    api.listDisciplines.mockResolvedValue({ data: [{ id: 'javelin', kind: 'field', presentation: { label: 'Javelin throw' }, defaultRules: { entrantType: 'individual' } }] });
    api.listSessions.mockResolvedValue({ data: [{ id: 'javelin-session', disciplineDefinitionId: 'javelin', label: 'Javelin throw', status: 'scheduled', version: 1 }] });
    api.listEntrants.mockResolvedValue({ data: [] });
    api.listRegistrations.mockResolvedValue({ data: [] });
    athletes.listAthletes.mockResolvedValue({ data: [
      { id: 'javelin-athlete', name: 'Hana Thrower', status: 'active', preferredDisciplineIds: ['javelin'] },
      { id: 'sprinter', name: 'Sami Sprinter', status: 'active', preferredDisciplineIds: ['track'] },
    ] });

    render(<MeetRosterPanel event={event} canOperate isCoach activeWorkspaceId="host-workspace" isGuest={false} />);

    await user.click(await screen.findByRole('button', { name: 'Add athletes' }));
    expect(screen.getByText('Hana Thrower')).toBeInTheDocument();
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
    athletes.listAthletes.mockResolvedValue({ data: [{ id: 'guest-athlete', name: 'Gia Guest', status: 'active', preferredDisciplineIds: ['track'] }] });
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

  it('shows the pending RSVP dropdown for every athlete in the relay pool', async () => {
    const user = userEvent.setup();
    mockRelayPool();
    render(<MeetRosterPanel event={event} canOperate isCoach activeWorkspaceId="host-workspace" isGuest={false} />);

    await user.click(await screen.findByRole('tab', { name: /4 x 100m relay/i }));
    await screen.findByRole('group', { name: /Relay team/i });
    for (const member of relayPool) {
      expect(screen.getByRole('button', { name: `RSVP for ${member.name}` })).toBeInTheDocument();
    }
    expect(screen.getByText('Pending 5 · Yes 0 · No 0 · Maybe 0')).toBeInTheDocument();

    await selectThemedOption(user, 'RSVP for Ari Runner', 'Attending');
    await waitFor(() => expect(participants.updateEventParticipant).toHaveBeenCalledWith('event-1', 'a1', 'yes'));
    expect(await screen.findByText('Pending 4 · Yes 1 · No 0 · Maybe 0')).toBeInTheDocument();
  });

  it('lets the team be named only when all four selected athletes are attending', async () => {
    const user = userEvent.setup();
    mockRelayPool();
    render(<MeetRosterPanel event={event} canOperate isCoach activeWorkspaceId="host-workspace" isGuest={false} />);
    await user.click(await screen.findByRole('tab', { name: /4 x 100m relay/i }));
    await screen.findByRole('group', { name: /Relay team/i });

    expect(screen.getByLabelText('Team name')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add relay' })).toBeDisabled();

    await selectRelayPoolAthletes(user, ['Ari Runner', 'Bea Runner', 'Cal Runner', 'Dee Runner']);
    expect(screen.getByText('Set all 4 athletes to Attending to name the team.')).toBeInTheDocument();
    expect(screen.getByLabelText('Team name')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add relay' })).toBeDisabled();

    await selectThemedOption(user, 'RSVP for Ari Runner', 'Attending');
    await waitFor(() => expect(screen.getByRole('button', { name: 'RSVP for Ari Runner' })).toBeEnabled());
    await selectThemedOption(user, 'RSVP for Bea Runner', 'Attending');
    await waitFor(() => expect(screen.getByRole('button', { name: 'RSVP for Bea Runner' })).toBeEnabled());
    await selectThemedOption(user, 'RSVP for Cal Runner', 'Attending');
    await waitFor(() => expect(screen.getByRole('button', { name: 'RSVP for Cal Runner' })).toBeEnabled());
    await selectThemedOption(user, 'RSVP for Dee Runner', 'Attending');

    await waitFor(() => expect(screen.getByLabelText('Team name')).toBeEnabled());
    expect(screen.queryByText(/Attending to name the team/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add relay' })).toBeDisabled();
    await user.type(screen.getByLabelText('Team name'), 'Speed Demons');
    expect(screen.getByRole('button', { name: 'Add relay' })).toBeEnabled();
  });

  it('asks for a replacement athlete when a selected athlete is not attending', async () => {
    const user = userEvent.setup();
    mockRelayPool({ a4: 'no' });
    render(<MeetRosterPanel event={event} canOperate isCoach activeWorkspaceId="host-workspace" isGuest={false} />);
    await user.click(await screen.findByRole('tab', { name: /4 x 100m relay/i }));
    await screen.findByRole('group', { name: /Relay team/i });

    await selectRelayPoolAthletes(user, ['Ari Runner', 'Bea Runner', 'Cal Runner', 'Dee Runner']);
    expect(screen.getByText('Dee Runner is not attending. A relay needs 4 attending athletes — remove them and select a new athlete.')).toBeInTheDocument();
    expect(screen.getByLabelText('Team name')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add relay' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: /Dee Runner/ }));
    expect(screen.getByText('You need 4 athletes for a relay — select 1 more.')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Eli Runner/ }));
    expect(screen.queryByText(/is not attending/)).not.toBeInTheDocument();
    expect(screen.getByText('Set all 4 athletes to Attending to name the team.')).toBeInTheDocument();

    await selectThemedOption(user, 'RSVP for Eli Runner', 'Attending');
    await waitFor(() => expect(screen.getByRole('button', { name: 'RSVP for Eli Runner' })).toBeEnabled());
    await selectThemedOption(user, 'RSVP for Ari Runner', 'Attending');
    await waitFor(() => expect(screen.getByRole('button', { name: 'RSVP for Ari Runner' })).toBeEnabled());
    await selectThemedOption(user, 'RSVP for Bea Runner', 'Attending');
    await waitFor(() => expect(screen.getByRole('button', { name: 'RSVP for Bea Runner' })).toBeEnabled());
    await selectThemedOption(user, 'RSVP for Cal Runner', 'Attending');
    await waitFor(() => expect(screen.getByLabelText('Team name')).toBeEnabled());
    expect(screen.queryByText('Set all 4 athletes to Attending to name the team.')).not.toBeInTheDocument();
    expect(screen.queryByText(/select 1 more/)).not.toBeInTheDocument();
  });

  it('numbers the relay legs in selection order and caps the team at four athletes', async () => {
    const user = userEvent.setup();
    mockRelayPool();
    render(<MeetRosterPanel event={event} canOperate isCoach activeWorkspaceId="host-workspace" isGuest={false} />);
    await user.click(await screen.findByRole('tab', { name: /4 x 100m relay/i }));
    await screen.findByRole('group', { name: /Relay team/i });

    await selectRelayPoolAthletes(user, ['Ari Runner', 'Bea Runner', 'Cal Runner']);
    const legOf = (name: string) => within(screen.getByRole('checkbox', { name: new RegExp(name) }).closest('label')!);
    expect(legOf('Ari Runner').getByText('1')).toBeInTheDocument();
    expect(legOf('Bea Runner').getByText('2')).toBeInTheDocument();
    expect(legOf('Cal Runner').getByText('3')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Dee Runner/ }));
    expect(legOf('Dee Runner').getByText('4')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Eli Runner/ })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: /Bea Runner/ }));
    expect(legOf('Cal Runner').getByText('2')).toBeInTheDocument();
    expect(legOf('Dee Runner').getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Eli Runner/ })).toBeEnabled();
  });

  it('adds the relay in leg order and shows the numbered team in the session roster', async () => {
    const user = userEvent.setup();
    const { poolEntrants } = mockRelayPool({ a1: 'yes', a2: 'yes', a3: 'yes', a4: 'yes' });
    let team: Record<string, unknown> | null = null;
    api.createEntrant.mockImplementation(async () => {
      team = { id: 'relay-team', workspaceId: 'host-workspace', kind: 'relay', athleteId: null, name: 'Speed Demons', clubName: null, details: null, memberIds: ['e1', 'e2', 'e3', 'e4'] };
      return team;
    });
    api.registerEntrant.mockImplementation(async () => ({ id: 'relay-registration', disciplineSessionId: 'session-relay', entrantId: 'relay-team', withdrawnAt: null }));
    api.listEntrants.mockImplementation(async () => ({ data: team ? [...poolEntrants, team] : poolEntrants }));
    api.listRegistrations.mockImplementation(async (_eventId: string, sessionId: string) => ({ data: sessionId === 'session-relay' && team ? [{ id: 'relay-registration', disciplineSessionId: 'session-relay', entrantId: 'relay-team', withdrawnAt: null }] : [] }));

    render(<MeetRosterPanel event={event} canOperate isCoach activeWorkspaceId="host-workspace" isGuest={false} />);
    await user.click(await screen.findByRole('tab', { name: /4 x 100m relay/i }));
    await screen.findByRole('group', { name: /Relay team/i });

    await selectRelayPoolAthletes(user, ['Ari Runner', 'Bea Runner', 'Cal Runner', 'Dee Runner']);
    await user.type(screen.getByLabelText('Team name'), 'Speed Demons');
    await user.click(screen.getByRole('button', { name: 'Add relay' }));

    await waitFor(() => expect(api.createEntrant).toHaveBeenCalledWith('event-1', { kind: 'relay', name: 'Speed Demons', memberIds: ['e1', 'e2', 'e3', 'e4'] }));
    expect(api.registerEntrant).toHaveBeenCalledWith('event-1', { disciplineSessionId: 'session-relay', entrantId: 'relay-team' });
    const roster = await screen.findByRole('list', { name: 'Session roster' });
    expect(roster).toHaveTextContent('Speed Demons');
    expect(roster).toHaveTextContent('Relay team: 1. Ari Runner -> 2. Bea Runner -> 3. Cal Runner -> 4. Dee Runner');
    expect(await screen.findByText('Pending 1 · Yes 4 · No 0 · Maybe 0')).toBeInTheDocument();
  });
});
