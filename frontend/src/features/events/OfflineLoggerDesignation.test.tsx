import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineLoggerDesignation } from './OfflineLoggerDesignation';
import * as eventHelpersApi from '../../api/eventHelpers';
import { CurrentUserProvider } from '../auth/CurrentUserProvider';

vi.mock('../../api/eventHelpers');

const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const GRANT_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '11111111-1111-4111-8111-111111111111';

function renderWithUser(ui: React.ReactElement, userId = USER_ID) {
  return render(
    <CurrentUserProvider user={{ id: userId, name: 'Test Coach', email: 'coach@test.com', role: 'coach' } as never}>
      {ui}
    </CurrentUserProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OfflineLoggerDesignation', () => {
  it('shows no designation message when none exists', () => {
    renderWithUser(<OfflineLoggerDesignation eventId={EVENT_ID} designations={[]} />);
    expect(screen.getByText('No offline logger designated')).toBeInTheDocument();
  });

  it('shows designated user name', () => {
    renderWithUser(
      <OfflineLoggerDesignation
        eventId={EVENT_ID}
        designations={[{
          grantId: GRANT_ID,
          userId: USER_ID,
          eventId: EVENT_ID,
          isOfflineLogger: true,
          offlineQueueDeviceId: 'device-1',
          user: { id: USER_ID, name: 'Alice Coach', email: 'alice@test.com', role: 'coach' } as never,
        }]}
      />,
    );
    expect(screen.getByText('Alice Coach')).toBeInTheDocument();
  });

  it('shows "You" badge when current user is the designated logger', () => {
    renderWithUser(
      <OfflineLoggerDesignation
        eventId={EVENT_ID}
        designations={[{
          grantId: GRANT_ID,
          userId: USER_ID,
          eventId: EVENT_ID,
          isOfflineLogger: true,
          offlineQueueDeviceId: 'device-1',
          user: { id: USER_ID, name: 'Test Coach', email: 'coach@test.com', role: 'coach' } as never,
        }]}
      />,
    );
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('revokes the designation successfully', async () => {
    const user = userEvent.setup();
    vi.mocked(eventHelpersApi.revokeOfflineLoggerDesignation).mockResolvedValue({ success: true });
    const onDesignationChange = vi.fn();

    renderWithUser(
      <OfflineLoggerDesignation
        eventId={EVENT_ID}
        designations={[{
          grantId: GRANT_ID,
          userId: USER_ID,
          eventId: EVENT_ID,
          isOfflineLogger: true,
          offlineQueueDeviceId: 'device-1',
          user: { id: USER_ID, name: 'Test Coach', email: 'coach@test.com', role: 'coach' } as never,
        }]}
        onDesignationChange={onDesignationChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(eventHelpersApi.revokeOfflineLoggerDesignation).toHaveBeenCalledWith(EVENT_ID, GRANT_ID));
    expect(onDesignationChange).toHaveBeenCalledOnce();
    expect(await screen.findByText('Offline logger designation revoked')).toBeInTheDocument();
  });

  it('shows error toast when revocation fails', async () => {
    const user = userEvent.setup();
    vi.mocked(eventHelpersApi.revokeOfflineLoggerDesignation).mockRejectedValue(new Error('Server error'));

    renderWithUser(
      <OfflineLoggerDesignation
        eventId={EVENT_ID}
        designations={[{
          grantId: GRANT_ID,
          userId: USER_ID,
          eventId: EVENT_ID,
          isOfflineLogger: true,
          offlineQueueDeviceId: 'device-1',
          user: { id: USER_ID, name: 'Test Coach', email: 'coach@test.com', role: 'coach' } as never,
        }]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });

  it('does not show revoke button when no user is designated', () => {
    renderWithUser(
      <OfflineLoggerDesignation
        eventId={EVENT_ID}
        designations={[{
          grantId: GRANT_ID,
          userId: USER_ID,
          eventId: EVENT_ID,
          isOfflineLogger: false,
          offlineQueueDeviceId: null,
        }]}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
  });
});
