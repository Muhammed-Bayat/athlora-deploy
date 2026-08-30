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

vi.mock('../../api/workspaces', () => ({ listWorkspaces: mocks.listWorkspaces }));

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
});
