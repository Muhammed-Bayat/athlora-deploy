import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import {
  createFixtureInvitation,
  listFixtureInvitations,
  listFixtureRosters,
  listHostedFixtureResults,
} from '../../api/fixtures';
import type { AthleticsEvent } from '../../types';
import { FixtureHostPanel } from './FixtureHostPanel';

vi.mock('../../api/fixtures', () => ({
  createFixtureInvitation: vi.fn(),
  listFixtureInvitations: vi.fn(),
  listFixtureRosters: vi.fn(),
  listHostedFixtureResults: vi.fn(),
  recordFixtureWithdrawal: vi.fn(),
  resendFixtureInvitation: vi.fn(),
  revokeFixtureInvitation: vi.fn(),
  overrideHostFixtureResult: vi.fn(),
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
  vi.mocked(listHostedFixtureResults).mockResolvedValue({ data: [], meta: { count: 0 } });
});

describe('FixtureHostPanel', () => {
  it('explains how to recover when the event is outside the active workspace', async () => {
    vi.mocked(createFixtureInvitation).mockRejectedValue(
      new ApiError(404, 'NOT_FOUND', 'Resource not found'),
    );
    const user = userEvent.setup();

    render(<FixtureHostPanel event={event} canOperate isCoach />);
    await user.type(screen.getByLabelText('Guest team coach email'), 'guest@example.com');
    await user.click(screen.getByRole('button', { name: 'Create fixture invitation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This event is unavailable in the selected workspace. Select its host workspace and reopen the event.',
    );
  });

  it('shows shared results section when results exist', async () => {
    vi.mocked(listHostedFixtureResults).mockResolvedValue({
      data: [{
        eventId: event.id,
        athleteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        discipline: '100m',
        outcome: 'valid',
        finalResult: 11.2,
        unit: 'seconds',
        placing: 1,
        isPb: true,
        isSb: false,
        manualOverride: null,
        overrideReason: null,
        overriddenBy: null,
        overrideAt: null,
        updatedAt: '2026-08-16T10:00:00.000Z',
      }],
      meta: { count: 1 },
    });
    vi.mocked(listFixtureRosters).mockResolvedValue({
      data: [{
        team: { workspaceId: '22222222-2222-4222-8222-222222222222', workspaceName: 'Guest Team', status: 'accepted', acceptedRevision: 1, withdrawnAt: null },
        participants: [{ eventId: event.id, athleteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', rsvpStatus: 'yes', athlete: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Ari Sprint', archivedAt: null, status: 'active' as const }, statusReviewRequired: false }],
      }],
      meta: { count: 1 },
    });

    render(<FixtureHostPanel event={event} canOperate isCoach />);

    expect(await screen.findByText('Shared results')).toBeInTheDocument();
    expect(screen.getAllByText('Ari Sprint').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('11.2s')).toBeInTheDocument();
    expect(screen.getAllByText('PB').length).toBeGreaterThanOrEqual(1);
  });

  it('lets assistants operate host fixture controls but not record team withdrawals', async () => {
    vi.mocked(listFixtureRosters).mockResolvedValue({
      data: [
        { team: { workspaceId: 'host', workspaceName: 'Host Team', status: 'accepted', acceptedRevision: 1, withdrawnAt: null }, participants: [] },
        { team: { workspaceId: 'guest', workspaceName: 'Guest Team', status: 'accepted', acceptedRevision: 1, withdrawnAt: null }, participants: [] },
      ],
      meta: { count: 2 },
    });
    vi.mocked(listHostedFixtureResults).mockResolvedValue({
      data: [{
        eventId: event.id, athleteId: 'assistant-athlete', discipline: '100m', outcome: 'valid',
        finalResult: 11.2, unit: 'seconds', placing: 1, isPb: false, isSb: false,
        manualOverride: null, overrideReason: null, overriddenBy: null, overrideAt: null,
        updatedAt: '2026-08-16T10:00:00.000Z',
      }],
      meta: { count: 1 },
    });

    render(<FixtureHostPanel event={{ ...event, status: 'in_progress' }} canOperate isCoach={false} />);

    expect(await screen.findByRole('button', { name: 'Correct' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record withdrawal' })).not.toBeInTheDocument();
  });
});
