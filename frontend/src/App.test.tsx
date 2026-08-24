import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardSummary } from './types';
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

const emptyDashboard: DashboardSummary = {
  state: 'summary',
  asOfDate: '2026-08-18',
  athletesCount: 0,
  activeAthletesCount: 0,
  archivedAthletesCount: 0,
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
});
