import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicStatisticsReportPage } from './PublicStatisticsReportPage';

const getReport = vi.fn();
const listClubs = vi.fn();
const listSeasons = vi.fn();
const listDisciplines = vi.fn();
vi.mock('../../api/publicStatistics', () => ({
  getPublicStatisticsReport: (...args: unknown[]) => getReport(...args),
  listPublicClubs: (...args: unknown[]) => listClubs(...args),
  listPublicSeasons: (...args: unknown[]) => listSeasons(...args),
  listPublicStatisticsReportDisciplines: (...args: unknown[]) => listDisciplines(...args),
}));

describe('PublicStatisticsReportPage', () => {
  beforeEach(() => {
    getReport.mockReset();
    listClubs.mockReset();
    listSeasons.mockReset();
    listDisciplines.mockReset();
    getReport.mockResolvedValue({ data: [], meta: { count: 0, generatedAt: '2026-09-25T00:00:00.000Z' } });
    listClubs.mockResolvedValue({ data: [{ id: 'club', name: 'Open Track' }] });
    listSeasons.mockResolvedValue([2026, 2025]);
    listDisciplines.mockResolvedValue([{ code: '100m', label: '100 metres' }, { code: 'long-jump', label: 'Long jump' }]);
  });

  it('loads URL filters without authentication and updates the shareable query', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/stats/report?discipline=100m&season=2026']}><PublicStatisticsReportPage /></MemoryRouter>);

    await waitFor(() => expect(getReport).toHaveBeenCalledWith(expect.objectContaining({ discipline: '100m', season: '2026' }), expect.anything()));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Discipline' })).toHaveTextContent('100 metres'));
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Gender' }));
    await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Female' }));
    await waitFor(() => expect(getReport).toHaveBeenLastCalledWith(expect.objectContaining({ gender: 'female' }), expect.anything()));
  });

  it('searches and selects a published discipline', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/stats/report']}><PublicStatisticsReportPage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'Discipline' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search disciplines' }), 'long');
    await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Long jump' }));
    await waitFor(() => expect(getReport).toHaveBeenLastCalledWith(expect.objectContaining({ discipline: 'long-jump' }), expect.anything()));
    expect(await screen.findByText('No matching published performances found.')).toBeInTheDocument();
  });

  it('queries clubs as the user searches and applies the selected club', async () => {
    const user = userEvent.setup();
    listClubs.mockImplementation((search: string) => Promise.resolve({ data: search === 'valley' ? [{ id: 'valley-club', name: 'Valley Athletics' }] : [{ id: 'club', name: 'Open Track' }] }));
    render(<MemoryRouter initialEntries={['/stats/report']}><PublicStatisticsReportPage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'Club' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search published clubs' }), 'valley');
    await waitFor(() => expect(listClubs).toHaveBeenLastCalledWith('valley'));
    await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Valley Athletics' }));
    await waitFor(() => expect(getReport).toHaveBeenLastCalledWith(expect.objectContaining({ club: 'valley-club' }), expect.anything()));
  });

  it('uses all seasons by default and lets visitors select an earlier season', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/stats/report']}><PublicStatisticsReportPage /></MemoryRouter>);

    await waitFor(() => expect(getReport).toHaveBeenCalledWith(expect.objectContaining({ season: 'all' }), expect.anything()));
    await user.click(screen.getByRole('button', { name: 'Season' }));
    await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: '2025' }));
    await waitFor(() => expect(getReport).toHaveBeenLastCalledWith(expect.objectContaining({ season: '2025' }), expect.anything()));
  });

  it('keeps available filters when another filter source fails', async () => {
    const user = userEvent.setup();
    listDisciplines.mockRejectedValue(new Error('Unavailable'));
    render(<MemoryRouter initialEntries={['/stats/report']}><PublicStatisticsReportPage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'Season' }));
    await waitFor(() => expect(within(screen.getByRole('listbox')).getByRole('option', { name: '2025' })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Some report filters could not be loaded'));
  });

});
