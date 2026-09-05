import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AthleticsEvent, DashboardSummary, IncomingFixtureInvitation } from './types';
import App from './App';

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
  loginWithRedirect: vi.fn(),
}));

const athleteApi = vi.hoisted(() => ({
  listAthletes: vi.fn(),
}));

const dashboardApi = vi.hoisted(() => ({
  getDashboardSummary: vi.fn(),
}));

const workspaceApi = vi.hoisted(() => ({ acceptWorkspaceInvitation: vi.fn() }));
const fixtureApi = vi.hoisted(() => ({
  listIncomingFixtureInvitations: vi.fn(),
  respondToIncomingFixtureInvitation: vi.fn(),
}));

const incomingFixtureInvitation: IncomingFixtureInvitation = {
  id: 'fixture-invitation-1',
  eventId: 'event-1',
  email: 'assistant@example.com',
  revision: 1,
  status: 'pending',
  expiresAt: '2026-09-01T12:00:00.000Z',
  createdAt: '2026-08-20T12:00:00.000Z',
  targetWorkspaceId: '00000000-0000-4000-8000-000000000000',
  responseMessage: null,
  respondedAt: null,
  respondedWorkspaceId: null,
  respondedWorkspaceName: null,
  respondedByName: null,
  event: {
    id: 'event-1',
    createdBy: 'coach-1',
    type: 'competition',
    discipline: '100m',
    title: 'Interclub Sprint',
    date: '2026-09-05',
    time: '09:00:00',
    locationName: 'Central Stadium',
    latitude: null,
    longitude: null,
    status: 'scheduled',
    createdAt: '2026-08-20T12:00:00.000Z',
    updatedAt: '2026-08-20T12:00:00.000Z',
  } satisfies AthleticsEvent,
};

const emptyDashboard: DashboardSummary = {
  state: 'summary',
  asOfDate: '2026-08-18',
  athletesCount: 0,
  activeAthletesCount: 0,
  inactiveAthletesCount: 0,
  archivedAthletesCount: 0,
  statusReviewCount: 0,
  upcomingEventCount: 0,
  seasonPbs: 0,
  activeEvent: null,
  rosterSnapshot: [],
  upcomingEvents: [],
  recentResults: [],
  recentPbs: [],
};

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: () => authState,
}));

vi.mock('./api/athletes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/athletes')>()),
  listAthletes: athleteApi.listAthletes,
}));

vi.mock('./api/dashboard', () => dashboardApi);
vi.mock('./api/workspaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/workspaces')>()),
  acceptWorkspaceInvitation: workspaceApi.acceptWorkspaceInvitation,
}));
vi.mock('./api/fixtures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/fixtures')>()),
  listIncomingFixtureInvitations: fixtureApi.listIncomingFixtureInvitations,
  respondToIncomingFixtureInvitation: fixtureApi.respondToIncomingFixtureInvitation,
}));

vi.mock('./features/landing/cinematic/PersistentWebGLStage', () => ({
  PersistentWebGLStage: () => null,
}));

describe('App', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
  });

  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
    authState.loginWithRedirect.mockReset();
    window.history.replaceState({}, '', '/');
    window.localStorage.clear();
    athleteApi.listAthletes.mockResolvedValue({ data: [], meta: { count: 0 } });
    dashboardApi.getDashboardSummary.mockReset();
    dashboardApi.getDashboardSummary.mockResolvedValue(emptyDashboard);
    workspaceApi.acceptWorkspaceInvitation.mockReset();
    fixtureApi.listIncomingFixtureInvitations.mockReset();
    fixtureApi.listIncomingFixtureInvitations.mockResolvedValue({ data: [], meta: { count: 0 } });
    fixtureApi.respondToIncomingFixtureInvitation.mockReset();
  });

  it('renders the public landing page and its interactive preview', async () => {
    const user = userEvent.setup();
    authState.isAuthenticated = false;
    authState.isLoading = false;

    render(<App />);

    expect(
      screen.getByRole('heading', { name: /track the squad\. run the season/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Trend' }));
    expect(screen.getByRole('tabpanel', { name: 'Trend' })).toHaveTextContent(
      '8pt improvement',
    );

    await user.click(screen.getByRole('button', { name: 'What can I actually track?' }));
    expect(screen.getByText(/rosters with discipline/i)).toBeVisible();
  });

  it('renders the API-backed console for an authenticated coach', async () => {
    const user = userEvent.setup();
    authState.isAuthenticated = true;
    authState.isLoading = false;

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Performance. In motion.' })).toBeInTheDocument();
    expect(dashboardApi.getDashboardSummary).toHaveBeenCalledOnce();

    await user.click(screen.getAllByRole('button', { name: /athletes/i })[0]);
    expect(screen.getAllByRole('heading', { name: 'Athletes' }).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /add athlete/i }));
    expect(screen.getByRole('dialog', { name: 'Add athlete' })).toBeInTheDocument();
  });

  it('applies and clears the night weather theme state', async () => {
    const user = userEvent.setup();
    authState.isAuthenticated = true;
    authState.isLoading = false;

    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Night' }));

    const consoleRoot = document.querySelector('[data-weather-enabled]');
    expect(consoleRoot).toHaveAttribute('data-weather', 'night');
    expect(consoleRoot).toHaveAttribute('data-weather-enabled', 'true');

    await user.click(screen.getByRole('button', { name: 'Weather FX' }));
    expect(consoleRoot).not.toHaveAttribute('data-weather');
    expect(consoleRoot).toHaveAttribute('data-weather-enabled', 'false');
  });

  it('starts Auth0 login instead of exposing the protected console', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole('button', { name: 'Log in' })[0]);

    expect(authState.loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/console' },
    });
    expect(screen.queryByText('Performance.')).not.toBeInTheDocument();
  });

  it('wires public sign-up and password help to Auth0 Universal Login', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole('button', { name: 'Get started' })[0]);
    expect(authState.loginWithRedirect).toHaveBeenCalledWith({
      authorizationParams: { screen_hint: 'signup' },
      appState: { returnTo: '/console' },
    });

    await user.click(screen.getByRole('button', { name: 'Forgot password' }));
    expect(authState.loginWithRedirect).toHaveBeenLastCalledWith({
      authorizationParams: { prompt: 'login' },
      appState: { returnTo: '/console' },
    });
  });

  it('shows an accessible loading state while authentication initializes', () => {
    authState.isAuthenticated = false;
    authState.isLoading = true;

    render(<App />);

    expect(screen.getByRole('main', { name: 'Loading Athlora' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('accepts an authenticated invitation and enters its workspace', async () => {
    authState.isAuthenticated = true;
    workspaceApi.acceptWorkspaceInvitation.mockResolvedValue({ id: 'workspace-2', name: 'Relay squad', timezone: 'UTC', role: 'assistant' });
    window.history.replaceState({}, '', '/invitations/token-123');

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Performance. In motion.' })).toBeInTheDocument();
    expect(workspaceApi.acceptWorkspaceInvitation).toHaveBeenCalledWith('token-123');
  });

  it('lets an assistant respond to an in-app fixture invitation', async () => {
    const user = userEvent.setup();
    authState.isAuthenticated = true;
    fixtureApi.listIncomingFixtureInvitations.mockResolvedValue({ data: [incomingFixtureInvitation], meta: { count: 1 } });
    fixtureApi.respondToIncomingFixtureInvitation.mockResolvedValue(incomingFixtureInvitation);
    window.history.replaceState({}, '', '/console/fixtures');

    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Accept fixture' }));

    expect(fixtureApi.respondToIncomingFixtureInvitation).toHaveBeenCalledWith('fixture-invitation-1', 'accepted', undefined);
  });
});
