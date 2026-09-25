import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicStatisticsReportPage } from './PublicStatisticsReportPage';

const getReport = vi.fn();
vi.mock('../../api/publicStatistics', () => ({
  getPublicStatisticsReport: (...args: unknown[]) => getReport(...args),
  listPublicClubs: vi.fn().mockResolvedValue({ data: [{ id: 'club', name: 'Open Track' }] }),
  listPublicSeasons: vi.fn().mockResolvedValue([2026]),
}));

describe('PublicStatisticsReportPage', () => {
  beforeEach(() => {
    getReport.mockReset();
    getReport.mockResolvedValue({ data: [], meta: { count: 0, generatedAt: '2026-09-25T00:00:00.000Z' } });
  });

  it('loads URL filters without authentication and updates the shareable query', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/stats/report?discipline=100m&season=2026']}><PublicStatisticsReportPage /></MemoryRouter>);

    await waitFor(() => expect(getReport).toHaveBeenCalledWith(expect.objectContaining({ discipline: '100m', season: '2026' }), expect.anything()));
    expect(screen.getByLabelText('Discipline')).toHaveValue('100m');
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Gender'), 'female');
    await waitFor(() => expect(getReport).toHaveBeenLastCalledWith(expect.objectContaining({ gender: 'female' }), expect.anything()));
  });
});
