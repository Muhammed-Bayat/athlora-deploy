import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FitnessView } from './FitnessView';
import type { Injury, InjuryDraft } from '../../types';

const injuryApi = vi.hoisted(() => ({
  listInjuries: vi.fn(),
  createInjury: vi.fn(),
  resolveInjury: vi.fn(),
  reopenInjury: vi.fn(),
  deleteInjury: vi.fn(),
}));

vi.mock('../../api/injuries', () => injuryApi);

vi.mock('./BodyViewer', () => ({
  BodyViewer: ({ injuries, preview }: { injuries: Injury[]; preview: InjuryDraft | null }) => (
    <p>Body viewer: {injuries.length} saved; {preview ? `${preview.side} ${preview.area} ${preview.severity}` : 'no preview'}</p>
  ),
}));

async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(screen.getByRole('button', { name: label }));
  await user.click(screen.getByRole('option', { name: option }));
}

describe('FitnessView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    injuryApi.listInjuries.mockResolvedValue([]);
  });

  it('uses a page view with progressive controls and loads/saves injuries via API', async () => {
    const user = userEvent.setup();
    const mockInjury: Injury = {
      id: 'inj-1',
      workspaceId: 'ws-1',
      athleteId: 'ath-1',
      bodyRegion: 'Leg',
      region: 'Leg',
      area: 'Knee',
      side: 'Left',
      severity: 'Severe',
      notes: null,
      occurrenceDate: '2026-08-30',
      expectedReturnDate: null,
      resolvedDate: null,
      resolutionNotes: null,
      createdBy: 'user-1',
      updatedBy: null,
      createdAt: '2026-08-30T10:00:00.000Z',
      updatedAt: '2026-08-30T10:00:00.000Z',
      deletedAt: null,
      deletedBy: null,
    };
    injuryApi.createInjury.mockResolvedValue(mockInjury);

    render(
      <FitnessView
        athleteId="ath-1"
        athleteName="Ari Runner"
        athleteSquad="Sprint A"
        athleteStatus="active"
        canOperate
        onBack={vi.fn()}
        onSetInactive={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    await choose(user, '1. Body region', 'Leg');
    await choose(user, '2. Specific area', 'Knee');
    await choose(user, '3. Side', 'Left');
    await choose(user, '4. Severity', 'Severe · red');

    await user.click(screen.getByRole('button', { name: 'Save injury' }));

    expect(injuryApi.createInjury).toHaveBeenCalledWith('ath-1', expect.objectContaining({
      bodyRegion: 'Leg',
      area: 'Knee',
      side: 'Left',
      severity: 'Severe',
    }));
  });

  it('marks the selected injury-history filter and shows its matching records', async () => {
    const user = userEvent.setup();
    injuryApi.listInjuries.mockResolvedValue([
      {
        id: 'inj-active', workspaceId: 'ws-1', athleteId: 'ath-1', bodyRegion: 'Leg', region: 'Leg', area: 'Knee', side: 'Left', severity: 'Minor', notes: null, occurrenceDate: '2026-08-30', expectedReturnDate: null, resolvedDate: null, resolutionNotes: null, createdBy: 'user-1', updatedBy: null, createdAt: '2026-08-30T10:00:00.000Z', updatedAt: '2026-08-30T10:00:00.000Z', deletedAt: null, deletedBy: null,
      },
      {
        id: 'inj-resolved', workspaceId: 'ws-1', athleteId: 'ath-1', bodyRegion: 'Arm', region: 'Arm', area: 'Shoulder', side: 'Right', severity: 'Moderate', notes: null, occurrenceDate: '2026-08-20', expectedReturnDate: null, resolvedDate: '2026-08-25T10:00:00.000Z', resolutionNotes: null, createdBy: 'user-1', updatedBy: null, createdAt: '2026-08-20T10:00:00.000Z', updatedAt: '2026-08-25T10:00:00.000Z', deletedAt: null, deletedBy: null,
      },
    ] satisfies Injury[]);

    render(<FitnessView athleteId="ath-1" athleteName="Ari Runner" athleteSquad="Sprint A" athleteStatus="active" canOperate onBack={vi.fn()} onSetInactive={vi.fn()} />);

    await screen.findByText('Left Knee');
    expect(screen.getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Right Shoulder')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Resolved' }));
    expect(screen.getByRole('button', { name: 'Resolved' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Right Shoulder')).toBeInTheDocument();
    expect(screen.queryByText('Left Knee')).not.toBeInTheDocument();
  });
});
