import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import {
  createFixtureInvitation,
  listFixtureInvitations,
  listFixtureRosters,
} from '../../api/fixtures';
import type { AthleticsEvent } from '../../types';
import { FixtureHostPanel } from './FixtureHostPanel';

vi.mock('../../api/fixtures', () => ({
  createFixtureInvitation: vi.fn(),
  listFixtureInvitations: vi.fn(),
  listFixtureRosters: vi.fn(),
  recordFixtureWithdrawal: vi.fn(),
  resendFixtureInvitation: vi.fn(),
  revokeFixtureInvitation: vi.fn(),
}));

const event: AthleticsEvent = {
  id: '11111111-1111-4111-8111-111111111111',
  createdBy: '22222222-2222-4222-8222-222222222222',
  type: 'competition',
  discipline: '100m',
  title: 'City Sprint Meet',
  date: '2026-09-01',
  time: '09:30:00',
  locationName: 'Central Stadium',
  latitude: null,
  longitude: null,
  status: 'scheduled',
  createdAt: '2026-08-16T10:00:00.000Z',
  updatedAt: '2026-08-16T10:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listFixtureInvitations).mockResolvedValue({ data: [], meta: { count: 0 } });
  vi.mocked(listFixtureRosters).mockResolvedValue({ data: [], meta: { count: 0 } });
});

describe('FixtureHostPanel', () => {
  it('explains how to recover when the event is outside the active workspace', async () => {
    vi.mocked(createFixtureInvitation).mockRejectedValue(
      new ApiError(404, 'NOT_FOUND', 'Resource not found'),
    );
    const user = userEvent.setup();

    render(<FixtureHostPanel event={event} isCoach />);
    await user.type(screen.getByLabelText('Guest coach email'), 'guest@example.com');
    await user.click(screen.getByRole('button', { name: 'Create fixture invitation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This event is unavailable in the selected workspace. Select its host workspace and reopen the event.',
    );
  });
});
