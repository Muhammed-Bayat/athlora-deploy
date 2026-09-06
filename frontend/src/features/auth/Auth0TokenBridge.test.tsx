import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../../types';
import { ApiError } from '../../api/client';
import { Auth0TokenBridge } from './Auth0TokenBridge';
import { useCurrentUser } from './CurrentUserContext';

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: false,
    user: undefined as { sub?: string } | undefined,
    getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
  },
  setAccessTokenGetter: vi.fn(() => vi.fn()),
  setActiveWorkspaceId: vi.fn(),
  syncCurrentUser: vi.fn(),
  listWorkspaces: vi.fn(),
  acceptWorkspaceInvitation: vi.fn(),
  listClubs: vi.fn(),
  listMyClubJoinRequests: vi.fn(),
  createClub: vi.fn(),
  requestToJoinClub: vi.fn(),
  withdrawClubJoinRequest: vi.fn(),
}));

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: () => mocks.auth,
}));

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    setAccessTokenGetter: mocks.setAccessTokenGetter,
    setActiveWorkspaceId: mocks.setActiveWorkspaceId,
    syncCurrentUser: mocks.syncCurrentUser,
  };
});

vi.mock('../../api/workspaces', () => ({ listWorkspaces: mocks.listWorkspaces, acceptWorkspaceInvitation: mocks.acceptWorkspaceInvitation }));
vi.mock('../../api/clubs', () => ({
  listClubs: mocks.listClubs,
  listMyClubJoinRequests: mocks.listMyClubJoinRequests,
  createClub: mocks.createClub,
  requestToJoinClub: mocks.requestToJoinClub,
  withdrawClubJoinRequest: mocks.withdrawClubJoinRequest,
}));

const synchronizedUser: User = {
  id: 'user-1',
  auth0Id: 'auth0|user-1',
  name: 'Coach One',
  email: 'coach@example.com',
  role: 'coach',
  createdAt: '2026-08-13T10:00:00.000Z',
  updatedAt: '2026-08-13T10:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderBridge(children: ReactNode = <div>Private application</div>) {
  return render(<Auth0TokenBridge>{children}</Auth0TokenBridge>);
}

function CurrentUserName() {
  const currentUser = useCurrentUser();

  return <div>{currentUser?.name ?? 'Anonymous user'}</div>;
}

beforeEach(() => {
  mocks.auth.isAuthenticated = false;
  mocks.auth.user = undefined;
  mocks.auth.getAccessTokenSilently = vi.fn().mockResolvedValue('access-token');
  mocks.setAccessTokenGetter.mockReset();
  mocks.setAccessTokenGetter.mockImplementation(() => vi.fn());
  mocks.setActiveWorkspaceId.mockReset();
  mocks.syncCurrentUser.mockReset();
  mocks.listWorkspaces.mockReset();
  mocks.listWorkspaces.mockResolvedValue({
    data: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Private application', timezone: 'UTC', role: 'coach' }],
    meta: { count: 1, activeWorkspaceId: '11111111-1111-4111-8111-111111111111' },
  });
  mocks.listClubs.mockResolvedValue({ data: [], meta: { count: 0 } });
  mocks.listMyClubJoinRequests.mockResolvedValue({ data: [], meta: { count: 0 } });
  mocks.createClub.mockReset();
  mocks.requestToJoinClub.mockReset();
  mocks.withdrawClubJoinRequest.mockReset();
  mocks.acceptWorkspaceInvitation.mockReset();
});

describe('Auth0TokenBridge', () => {
  it('renders anonymous children with no current user without synchronizing', () => {
    renderBridge(<CurrentUserName />);

    expect(screen.getByText('Anonymous user')).toBeInTheDocument();
    expect(mocks.syncCurrentUser).not.toHaveBeenCalled();
    expect(mocks.setAccessTokenGetter).toHaveBeenCalledWith(undefined);
  });

  it('withholds authenticated children until subject synchronization succeeds', async () => {
    const synchronization = deferred<User>();
    mocks.auth.isAuthenticated = true;
    mocks.auth.user = { sub: 'auth0|user-1' };
    mocks.syncCurrentUser.mockReturnValue(synchronization.promise);

    renderBridge(<CurrentUserName />);

    expect(screen.queryByText('Coach One')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Preparing your account');
    expect(mocks.syncCurrentUser).toHaveBeenCalledTimes(1);
    expect(mocks.auth.getAccessTokenSilently).not.toHaveBeenCalled();

    await act(async () => synchronization.resolve(synchronizedUser));

    expect(screen.getByText('Coach One')).toBeInTheDocument();
  });

  it('renders an accessible error and retries synchronization', async () => {
    const user = userEvent.setup();
    mocks.auth.isAuthenticated = true;
    mocks.auth.user = { sub: 'auth0|user-1' };
    mocks.syncCurrentUser
      .mockRejectedValueOnce(new Error('Synchronization unavailable'))
      .mockResolvedValueOnce(synchronizedUser);

    renderBridge();

    expect(await screen.findByRole('alert')).toHaveAccessibleName(
      'We could not finish signing you in',
    );
    expect(screen.queryByText('Private application')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(mocks.syncCurrentUser).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Private application')).toBeInTheDocument();
  });

  it('shows a support-safe code and correlation reference for API failures', async () => {
    mocks.auth.isAuthenticated = true;
    mocks.auth.user = { sub: 'auth0|user-1' };
    mocks.syncCurrentUser.mockRejectedValue(new ApiError(
      500,
      'INTERNAL_ERROR',
      'Internal server error',
      { requestId: 'request-123' },
    ));

    renderBridge();

    expect(await screen.findByText(/Error code: INTERNAL_ERROR/)).toHaveTextContent(
      'Reference: request-123',
    );
  });

  it('shows Club onboarding instead of failing when a synchronized user has no membership', async () => {
    mocks.auth.isAuthenticated = true;
    mocks.auth.user = { sub: 'auth0|user-1' };
    mocks.syncCurrentUser.mockResolvedValue(synchronizedUser);
    mocks.listWorkspaces.mockResolvedValue({ data: [], meta: { count: 0, activeWorkspaceId: '' } });

    renderBridge();

    expect(await screen.findByRole('heading', { name: 'Set up your Club' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start a Club/ })).toBeEnabled();
  });

  it('refreshes into the dashboard when a pending Club request is approved', async () => {
    vi.useFakeTimers();
    try {
      mocks.auth.isAuthenticated = true;
      mocks.auth.user = { sub: 'auth0|user-1' };
      mocks.syncCurrentUser.mockResolvedValue(synchronizedUser);
      const clubWorkspace = { id: '22222222-2222-4222-822222222222', name: 'Track Club', timezone: 'UTC', role: 'assistant' as const };
      mocks.listWorkspaces
        .mockResolvedValueOnce({ data: [], meta: { count: 0, activeWorkspaceId: '' } })
        .mockResolvedValueOnce({ data: [clubWorkspace], meta: { count: 1, activeWorkspaceId: clubWorkspace.id } });
      mocks.listMyClubJoinRequests
        .mockResolvedValueOnce({ data: [{ id: 'request-1', clubId: 'club-1', userId: synchronizedUser.id, status: 'pending', reviewedBy: null, reviewedAt: null, createdAt: '2026-09-06T10:00:00.000Z', updatedAt: '2026-09-06T10:00:00.000Z' }], meta: { count: 1 } })
        .mockResolvedValueOnce({ data: [{ id: 'request-1', clubId: 'club-1', userId: synchronizedUser.id, status: 'approved', reviewedBy: 'coach-1', reviewedAt: '2026-09-06T10:01:00.000Z', createdAt: '2026-09-06T10:00:00.000Z', updatedAt: '2026-09-06T10:01:00.000Z' }], meta: { count: 1 } });

      renderBridge(<CurrentUserName />);
      await act(async () => {});

      expect(screen.getByRole('heading', { name: 'Set up your Club' })).toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });

      expect(screen.getByText('Coach One')).toBeInTheDocument();
      expect(mocks.listMyClubJoinRequests.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(mocks.listWorkspaces.mock.calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('accepts a direct Club invitation before onboarding a user with no membership', async () => {
    mocks.auth.isAuthenticated = true;
    mocks.auth.user = { sub: 'auth0|user-1' };
    mocks.syncCurrentUser.mockResolvedValue(synchronizedUser);
    const clubWorkspace = { id: '22222222-2222-4222-822222222222', name: 'Track Club', timezone: 'UTC', role: 'assistant' as const };
    mocks.listWorkspaces
      .mockResolvedValueOnce({ data: [], meta: { count: 0, activeWorkspaceId: '' } })
      .mockResolvedValueOnce({ data: [clubWorkspace], meta: { count: 1, activeWorkspaceId: clubWorkspace.id } });
    mocks.acceptWorkspaceInvitation.mockResolvedValue(clubWorkspace);
    window.history.replaceState({}, '', '/invitations/token-123');

    renderBridge(<CurrentUserName />);

    expect(await screen.findByText('Coach One')).toBeInTheDocument();
    expect(mocks.acceptWorkspaceInvitation).toHaveBeenCalledWith('token-123');
    expect(window.location.pathname).toBe('/console');
  });
});
