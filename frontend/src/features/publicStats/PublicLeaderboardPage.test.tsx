import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicLeaderboardPage } from './PublicLeaderboardPage';

const getLeaderboard = vi.fn();

vi.mock('../../api/publicStatistics', () => ({
  getPublicLeaderboard: (...args: unknown[]) => getLeaderboard(...args),
  listPublicClubs: vi.fn().mockResolvedValue({ data: [{ id: 'club', name: 'Open Track' }] }),
  listPublicSeasons: vi.fn().mockResolvedValue([2026]),
  listPublicStatisticsReportDisciplines: vi.fn().mockResolvedValue([{ code: '100m', label: '100m' }]),
}));

describe('PublicLeaderboardPage', () => {
  beforeEach(() => {
    getLeaderboard.mockReset();
    getLeaderboard.mockResolvedValue([]);
  });

  it('uses the themed discipline picker to update the public leaderboard query', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/stats/leaderboard']}><PublicLeaderboardPage /></MemoryRouter>);

    await waitFor(() => expect(getLeaderboard).toHaveBeenCalledWith(expect.objectContaining({ discipline: '' }), expect.anything()));
    await user.click(await screen.findByRole('button', { name: 'Discipline' }));
    await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: '100m' }));

    await waitFor(() => expect(getLeaderboard).toHaveBeenLastCalledWith(expect.objectContaining({ discipline: '100m' }), expect.anything()));
    expect(screen.getByRole('button', { name: 'Club' })).toBeInTheDocument();
  });
});
