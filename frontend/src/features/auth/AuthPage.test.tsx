import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import * as authApi from '../../api/auth';
import type { User } from '../../types';
import { CurrentUserProvider } from './CurrentUserProvider';
import { AuthPage } from './AuthPage';

const workspaceApi = vi.hoisted(() => ({
  listWorkspaceMembers: vi.fn(),
  listWorkspaceInvitations: vi.fn(),
  resendWorkspaceInvitation: vi.fn(),
  updateWorkspaceMemberRole: vi.fn(),
}));
const clubApi = vi.hoisted(() => ({
  listClubs: vi.fn(),
  listClubJoinRequests: vi.fn(),
  approveClubJoinRequest: vi.fn(),
  rejectClubJoinRequest: vi.fn(),
}));

const auth0 = vi.hoisted(() => ({
  logout: vi.fn(),
  user: { name: 'Coach Avery', email: 'coach@example.com' },
}));

vi.mock('@auth0/auth0-react', () => ({ useAuth0: () => auth0 }));
vi.mock('../../api/auth');
vi.mock('../../api/workspaces', () => workspaceApi);
vi.mock('../../api/clubs', () => clubApi);

const currentUser: User = {
  id: '11111111-1111-4111-8111-111111111111',
  auth0Id: 'auth0|coach-1',
  name: 'Coach Avery',
  email: 'coach@example.com',
  role: 'coach',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
  consentAcceptedAt: null,
  consentVersion: null,
};

function renderPage() {
  return render(<CurrentUserProvider user={currentUser}><AuthPage /></CurrentUserProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  workspaceApi.listWorkspaceMembers.mockResolvedValue({ data: [], meta: { count: 0 } });
  workspaceApi.listWorkspaceInvitations.mockResolvedValue({ data: [], meta: { count: 0 } });
  clubApi.listClubs.mockResolvedValue({ data: [], meta: { count: 0 } });
  clubApi.listClubJoinRequests.mockResolvedValue({ data: [], meta: { count: 0 } });
});

describe('AuthPage', () => {
  it('shows pending Club requests to a coach and approves an assistant', async () => {
    const user = userEvent.setup();
    clubApi.listClubs.mockResolvedValue({ data: [{ id: 'club-1', workspaceId: '00000000-0000-4000-8000-000000000000', name: 'Track Club', createdAt: '2026-09-04T00:00:00.000Z', updatedAt: '2026-09-04T00:00:00.000Z' }], meta: { count: 1 } });
    clubApi.listClubJoinRequests.mockResolvedValue({ data: [{ id: 'request-1', clubId: 'club-1', userId: 'user-2', userName: 'Assistant Sam', userEmail: 'sam@example.com', status: 'pending', reviewedBy: null, reviewedAt: null, createdAt: '2026-09-04T00:00:00.000Z', updatedAt: '2026-09-04T00:00:00.000Z' }], meta: { count: 1 } });
    clubApi.approveClubJoinRequest.mockResolvedValue({});
    renderPage();

    expect(await screen.findByText('Assistant Sam')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve assistant' }));
    await waitFor(() => expect(clubApi.approveClubJoinRequest).toHaveBeenCalledWith('club-1', 'request-1', 'assistant'));
  });

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

  it('shows workspace management to coaches', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Members and invitations' })).toBeInTheDocument();
    expect(workspaceApi.listWorkspaceMembers).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000000');
  });

  it('uses the themed role menu when changing a Club member role', async () => {
    workspaceApi.listWorkspaceMembers.mockResolvedValue({
      data: [{ userId: 'user-2', name: 'Assistant Sam', email: 'sam@example.com', role: 'assistant' }],
      meta: { count: 1 },
    });
    workspaceApi.updateWorkspaceMemberRole.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    const roleTrigger = await screen.findByRole('button', { name: 'Role for Assistant Sam' });
    await user.click(roleTrigger);
    const roleMenu = roleTrigger.parentElement?.querySelector<HTMLElement>('[role="listbox"]');
    expect(roleMenu).toBeInTheDocument();
    await user.click(within(roleMenu!).getByRole('option', { name: 'Coach' }));

    await waitFor(() => expect(workspaceApi.updateWorkspaceMemberRole).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000000', 'user-2', 'coach'));
  });

  it('replaces a pending invitation link when the coach resends it', async () => {
    workspaceApi.listWorkspaceInvitations.mockResolvedValue({
      data: [{ id: 'invite', email: 'assistant@example.test', role: 'assistant', expiresAt: '2026-09-01T00:00:00.000Z', createdAt: '2026-08-26T00:00:00.000Z' }],
      meta: { count: 1 },
    });
    workspaceApi.resendWorkspaceInvitation.mockResolvedValue({ id: 'replacement', email: 'assistant@example.test', role: 'assistant', expiresAt: '2026-09-02T00:00:00.000Z', createdAt: '2026-08-26T00:00:00.000Z', token: 'replacement-token' });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Resend' }));

    expect(workspaceApi.resendWorkspaceInvitation).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000000', 'invite');
    expect(await screen.findByRole('link', { name: 'Open invitation link' })).toHaveAttribute('href', `${window.location.origin}/invitations/replacement-token`);
  });
});
