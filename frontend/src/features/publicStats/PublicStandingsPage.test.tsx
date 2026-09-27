import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicStandingsPage } from './PublicStandingsPage';

const getStandings = vi.fn();
vi.mock('../../api/publicStatistics', () => ({
  getPublicClubStandings: (...args: unknown[]) => getStandings(...args),
  listPublicSeasons: vi.fn().mockResolvedValue([2026, 2025]),
}));

describe('PublicStandingsPage', () => {
  beforeEach(() => getStandings.mockReset().mockResolvedValue([{ clubId: 'club', clubName: 'Open Track', totalPoints: 8, fixtures: 2, wins: 1, seconds: 1, thirds: 0, scoredResults: 2, rank: 1 }]));

  it('shows public fixture points and updates the season scope', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/stats/standings']}><PublicStandingsPage /></MemoryRouter>);

    expect(await screen.findByText('Open Track')).toBeInTheDocument();
    await waitFor(() => expect(getStandings).toHaveBeenCalledWith('all', expect.anything()));
    await user.click(screen.getByRole('button', { name: 'Season' }));
    await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: '2025' }));
    await waitFor(() => expect(getStandings).toHaveBeenLastCalledWith('2025', expect.anything()));
  });
});
