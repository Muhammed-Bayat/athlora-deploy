import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import * as authApi from '../../api/auth';
import type { User } from '../../types';
import { CurrentUserProvider } from './CurrentUserProvider';
import { AuthPage } from './AuthPage';

const auth0 = vi.hoisted(() => ({
  logout: vi.fn(),
  user: { name: 'Coach Avery', email: 'coach@example.com' },
}));

vi.mock('@auth0/auth0-react', () => ({ useAuth0: () => auth0 }));
vi.mock('../../api/auth');

const currentUser: User = {
  id: '11111111-1111-4111-8111-111111111111',
  auth0Id: 'auth0|coach-1',
  name: 'Coach Avery',
  email: 'coach@example.com',
  role: 'coach',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
};

function renderPage() {
  return render(<CurrentUserProvider user={currentUser}><AuthPage /></CurrentUserProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AuthPage', () => {
  it('creates a short-lived Auth0 password link', async () => {
    vi.mocked(authApi.createPasswordTicket).mockResolvedValue('https://example.auth0.com/ticket/abc');
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Change password' }));

    const link = await screen.findByRole('link', { name: 'Continue to Auth0' });
    expect(link).toHaveAttribute('href', 'https://example.auth0.com/ticket/abc');
    expect(screen.getByRole('status')).toHaveTextContent('expires in 15 minutes');
  });

  it('requires typed confirmation before deleting and then signs out', async () => {
    vi.mocked(authApi.deleteCurrentAccount).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    const dialog = screen.getByRole('dialog', { name: 'Permanently delete account' });
    const submit = screen.getByRole('button', { name: 'Delete permanently' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Confirmation'), 'DELETE');
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(authApi.deleteCurrentAccount).toHaveBeenCalledOnce());
    expect(auth0.logout).toHaveBeenCalledWith({ logoutParams: { returnTo: window.location.origin } });
    expect(dialog).toBeInTheDocument();
  });

  it('keeps the account available with an announced error when deletion fails', async () => {
    vi.mocked(authApi.deleteCurrentAccount).mockRejectedValue(
      new ApiError(502, 'AUTH0_IDENTITY_DELETE_FAILED', 'Could not delete the Auth0 identity'),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    await user.type(screen.getByLabelText('Confirmation'), 'DELETE');
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete the Auth0 identity');
    expect(screen.getByRole('dialog', { name: 'Permanently delete account' })).toBeInTheDocument();
    expect(auth0.logout).not.toHaveBeenCalled();
  });

  it('signs out through Auth0 with a local return URL', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(auth0.logout).toHaveBeenCalledWith({ logoutParams: { returnTo: window.location.origin } });
  });

  it('directs social users to manage passwords with their identity provider', () => {
    render(
      <CurrentUserProvider user={{ ...currentUser, auth0Id: 'google-oauth2|coach-1' }}>
        <AuthPage />
      </CurrentUserProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Change password' })).not.toBeInTheDocument();
    expect(screen.getByText('Your password is managed by your identity provider.')).toBeInTheDocument();
  });
});
