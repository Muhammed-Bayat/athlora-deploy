import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
}));

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: () => authState,
}));

describe('App', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
  });

  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
    window.history.replaceState({}, '', '/');
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

  it('renders the fixture-driven console for an authenticated coach', async () => {
    const user = userEvent.setup();
    authState.isAuthenticated = true;
    authState.isLoading = false;

    render(<App />);

    expect(screen.getByText('Performance.')).toBeInTheDocument();
    expect(screen.getByText('In motion.')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /athletes/i })[0]);
    expect(screen.getAllByRole('heading', { name: 'Athletes' }).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /add athlete/i }));
    expect(screen.getByRole('dialog', { name: 'Add Athlete' })).toBeInTheDocument();
  });

  it('routes a landing-page login to the temporary console route', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole('button', { name: 'Log in' })[0]);

    expect(window.location.pathname).toBe('/console');
    expect(screen.getByText('Performance.')).toBeInTheDocument();
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
