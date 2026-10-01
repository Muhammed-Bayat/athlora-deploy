import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { listClubs } from '../../api/clubs';
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
vi.mock('../../api/clubs', () => ({ listClubs: vi.fn() }));
vi.mock('../auth/WorkspaceContext', () => ({ useWorkspace: () => ({ activeWorkspace: { id: 'host-workspace' } }) }));

const event: AthleticsEvent = {
  id: '11111111-1111-4111-8111-111111111111',
  workspaceId: 'host-workspace',
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
  archivedAt: null,
  createdAt: '2026-08-16T10:00:00.000Z',
  updatedAt: '2026-08-16T10:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listFixtureInvitations).mockResolvedValue({ data: [], meta: { count: 0 } });
  vi.mocked(listFixtureRosters).mockResolvedValue({ data: [], meta: { count: 0 } });
  vi.mocked(listClubs).mockResolvedValue({ data: [], meta: { count: 0 } });
});

describe('FixtureHostPanel', () => {
  it('explains how to recover when the event is outside the active workspace', async () => {
    vi.mocked(createFixtureInvitation).mockRejectedValue(
      new ApiError(404, 'NOT_FOUND', 'Resource not found'),
    );
    const user = userEvent.setup();

    render(<FixtureHostPanel event={event} canOperate isCoach />);
    vi.mocked(listClubs).mockResolvedValue({ data: [{ id: 'club-1', workspaceId: 'workspace-1', name: 'Guest Club', createdAt: '2026-08-16T10:00:00.000Z', updatedAt: '2026-08-16T10:00:00.000Z' }], meta: { count: 1 } });
    await user.type(screen.getByLabelText('Search registered clubs'), 'Guest');
    await user.click(await screen.findByRole('button', { name: 'Invite' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This event is unavailable in the selected workspace. Select its host workspace and reopen the event.',
    );
  });

  it('omits shared results from the participating clubs panel', async () => {
    vi.mocked(listFixtureRosters).mockResolvedValue({
      data: [{
        team: { workspaceId: '22222222-2222-4222-8222-222222222222', workspaceName: 'Guest Team', status: 'accepted', acceptedRevision: 1, withdrawnAt: null },
        participants: [{ eventId: event.id, athleteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', rsvpStatus: 'yes', athlete: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Ari Sprint', archivedAt: null, status: 'active' as const }, statusReviewRequired: false }],
      }],
      meta: { count: 1 },
    });

    render(<FixtureHostPanel event={{ ...event, status: 'in_progress' }} canOperate isCoach />);

    expect(await screen.findByRole('heading', { name: 'Accepted' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Shared results' })).not.toBeInTheDocument();
    expect(screen.queryByText('11.2s')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Correct' })).not.toBeInTheDocument();
  });

  it('shows only the club name for a session-roster fixture', async () => {
    vi.mocked(listFixtureRosters).mockResolvedValue({
      data: [{
        team: { workspaceId: 'host-workspace', workspaceName: 'Host Team', status: 'accepted', acceptedRevision: 1, withdrawnAt: null },
        participants: [],
      }],
      meta: { count: 1 },
    });

    render(<FixtureHostPanel event={{ ...event, discipline: null }} canOperate isCoach usesSessionRosters />);

    expect(await screen.findByRole('heading', { name: /Host Team/ })).toBeInTheDocument();
    expect(screen.queryByText('Your discipline entries appear in the event roster tabs.')).not.toBeInTheDocument();
  });

  it('does not render invited team athletes in the host roster', async () => {
    vi.mocked(listFixtureRosters).mockResolvedValue({ data: [
      { team: { workspaceId: 'host-workspace', workspaceName: 'Host Team', status: 'accepted', acceptedRevision: 1, withdrawnAt: null }, participants: [{ eventId: event.id, athleteId: 'host-athlete', rsvpStatus: 'yes', athlete: { id: 'host-athlete', name: 'Host Runner', archivedAt: null, status: 'active' }, statusReviewRequired: false }] },
      { team: { workspaceId: 'guest-workspace', workspaceName: 'Guest Team', status: 'accepted', acceptedRevision: 1, withdrawnAt: null }, participants: [{ eventId: event.id, athleteId: 'guest-athlete', rsvpStatus: 'yes', athlete: { id: 'guest-athlete', name: 'Guest Runner', archivedAt: null, status: 'active' }, statusReviewRequired: false }] },
    ], meta: { count: 2 } });

    render(<FixtureHostPanel event={event} canOperate isCoach />);

    expect(await screen.findByText('Host Runner')).toBeInTheDocument();
    expect(screen.queryByText('Guest Runner')).not.toBeInTheDocument();
  });

  it('lists accepted clubs while the fixture is still scheduled and lets the coach record a withdrawal', async () => {
    vi.mocked(listFixtureRosters).mockResolvedValue({
      data: [
        { team: { workspaceId: 'host-workspace', workspaceName: 'Host Team', status: 'accepted', acceptedRevision: 1, withdrawnAt: null }, participants: [] },
        { team: { workspaceId: 'guest-workspace', workspaceName: 'Guest Team', status: 'accepted', acceptedRevision: 1, withdrawnAt: null }, participants: [] },
      ],
      meta: { count: 2 },
    });

    render(<FixtureHostPanel event={event} canOperate isCoach />);

    expect(await screen.findByRole('heading', { name: 'Accepted' })).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('Guest Team · Accepted');
    expect(screen.getByRole('button', { name: 'Record withdrawal' })).toBeInTheDocument();
  });

  it('flags accepted clubs that must re-accept updated fixture terms', async () => {
    vi.mocked(listFixtureRosters).mockResolvedValue({
      data: [
        { team: { workspaceId: 'guest-workspace', workspaceName: 'Guest Team', status: 'reacceptance_required', acceptedRevision: 1, withdrawnAt: null }, participants: [] },
      ],
      meta: { count: 1 },
    });

    render(<FixtureHostPanel event={event} canOperate isCoach />);

    expect(await screen.findByRole('heading', { name: 'Re-acceptance required' })).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('Guest Team · Awaiting re-acceptance of updated terms');
    expect(screen.queryByRole('button', { name: 'Record withdrawal' })).not.toBeInTheDocument();
  });

  it('lets assistants operate host fixture controls but not record team withdrawals', async () => {
    vi.mocked(listFixtureRosters).mockResolvedValue({
      data: [
        { team: { workspaceId: 'host', workspaceName: 'Host Team', status: 'accepted', acceptedRevision: 1, withdrawnAt: null }, participants: [] },
        { team: { workspaceId: 'guest', workspaceName: 'Guest Team', status: 'accepted', acceptedRevision: 1, withdrawnAt: null }, participants: [] },
      ],
      meta: { count: 2 },
    });

    render(<FixtureHostPanel event={{ ...event, status: 'in_progress' }} canOperate isCoach={false} />);

    expect(await screen.findByRole('heading', { name: 'Accepted' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record withdrawal' })).not.toBeInTheDocument();
  });

  it('shows a guest change request with the existing invitation actions', async () => {
    vi.mocked(listFixtureInvitations).mockResolvedValue({
      data: [{
        id: '33333333-3333-4333-8333-333333333333', eventId: event.id, email: null, revision: 1,
        status: 'change_requested', expiresAt: '2026-09-10T10:00:00.000Z', createdAt: '2026-09-01T10:00:00.000Z',
        targetWorkspaceId: '44444444-4444-4444-8444-444444444444', targetWorkspaceName: 'Team B',
        responseMessage: 'Can we start at 10:00?', respondedAt: '2026-09-02T10:00:00.000Z',
        respondedWorkspaceId: '44444444-4444-4444-8444-444444444444', respondedWorkspaceName: 'Team B', respondedByName: 'Guest Coach',
      }],
      meta: { count: 1 },
    });

    render(<FixtureHostPanel event={event} canOperate isCoach />);

    expect(await screen.findByRole('listitem')).toHaveTextContent('Team B requested a change');
    expect(screen.getByRole('listitem')).toHaveTextContent('Can we start at 10:00?');
    expect(screen.getByRole('button', { name: 'Resend' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeInTheDocument();
  });

  it('keeps declined invitation responses visible to the host', async () => {
    vi.mocked(listFixtureInvitations).mockResolvedValue({
      data: [{
        id: '33333333-3333-4333-8333-333333333333', eventId: event.id, email: null, revision: 1,
        status: 'declined', expiresAt: '2026-09-10T10:00:00.000Z', createdAt: '2026-09-01T10:00:00.000Z',
        targetWorkspaceId: '44444444-4444-4444-8444-444444444444', targetWorkspaceName: 'Team B',
        responseMessage: 'We are unavailable.', respondedAt: '2026-09-02T10:00:00.000Z',
        respondedWorkspaceId: '44444444-4444-4444-8444-444444444444', respondedWorkspaceName: 'Team B', respondedByName: 'Guest Coach',
      }],
      meta: { count: 1 },
    });

    render(<FixtureHostPanel event={event} canOperate isCoach />);

    expect(await screen.findByRole('heading', { name: 'Responses' })).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('Team B · Declined');
    expect(screen.getByRole('listitem')).toHaveTextContent('We are unavailable.');
  });
});
