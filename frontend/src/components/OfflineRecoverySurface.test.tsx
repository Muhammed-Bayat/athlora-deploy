import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OfflineRecoverySurface } from './OfflineRecoverySurface';

describe('OfflineRecoverySurface', () => {
  it('distinguishes a local failed action from server-canonical data and retries it', () => {
    const retry = vi.fn();
    render(
      <OfflineRecoverySurface
        isOnline
        cacheFreshness={Date.UTC(2026, 8, 24, 10, 0)}
        designation={{ label: 'Coach Taylor', deviceId: 'device-1', isCurrentDevice: true }}
        actions={[{
          id: 'action-1',
          actionType: 'create_entry',
          status: 'failed',
          createdAt: Date.UTC(2026, 8, 24, 9, 55),
          deviceId: 'device-1',
          subject: 'Athlete: Jordan',
          target: '100m session',
          error: 'VERSION_CONFLICT',
        }]}
        onRetryAction={retry}
      />,
    );

    expect(screen.getByText(/server-canonical data/i)).toBeInTheDocument();
    expect(screen.getByText('Athlete: Jordan · 100m session')).toBeInTheDocument();
    expect(screen.getByText(/Server response: VERSION_CONFLICT/i)).toBeInTheDocument();
    expect(screen.getByText(/Coach Taylor \(this device\)/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledWith('action-1');
  });
});
