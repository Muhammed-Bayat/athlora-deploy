import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicLoggerPanel } from './PublicLoggerPanel';
import * as publicLoggerApi from '../../api/publicLoggers';

vi.mock('../../api/publicLoggers');
vi.mock('qrcode', () => ({ toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,qr-code') }));

const event = {
  id: '22222222-2222-4222-8222-222222222222',
  type: 'competition' as const,
  discipline: '100m' as const,
  title: 'City Sprint Meet',
  date: '2026-09-01',
  time: null,
  locationName: null,
  latitude: null,
  longitude: null,
  status: 'in_progress' as const,
  createdBy: '11111111-1111-4111-8111-111111111111',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

describe('PublicLoggerPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(publicLoggerApi.listPublicLoggerLinks).mockResolvedValue({ data: [], meta: { count: 0 } });
    vi.mocked(publicLoggerApi.createPublicLoggerLink).mockResolvedValue({
      token: 'public-link-token',
      link: { id: '33333333-3333-4333-8333-333333333333', eventId: event.id, status: 'active', createdAt: event.createdAt, revokedAt: null },
    });
  });

  it('reveals the URL and QR code after creating a link', async () => {
    const user = userEvent.setup();
    render(<PublicLoggerPanel event={event} />);

    await user.click(screen.getByRole('button', { name: 'Create shareable link' }));

    await waitFor(() => expect(publicLoggerApi.createPublicLoggerLink).toHaveBeenCalledWith(event.id));
    expect(screen.getByLabelText('New link, shown once')).toHaveValue(`${window.location.origin}/log/public-link-token`);
    expect(await screen.findByRole('img', { name: 'QR code for the public event logger' })).toBeInTheDocument();
  });
});
