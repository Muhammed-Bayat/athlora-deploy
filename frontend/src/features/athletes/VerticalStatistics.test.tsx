import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { request, requestPublic } from '../../api/client';
import { VerticalStatistics } from './VerticalStatistics';

vi.mock('../../api/client', () => ({ request: vi.fn(), requestPublic: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
const performance = { athleteId: 'a', athleteName: 'Runner', discipline: '200m', label: '200 metres', unit: 'seconds', precision: 2, pb: 22, sb: 22.5, resultCount: 3, seasonCount: 2, seasonAverage: 23, placing: 1 };
it('shows finalized discipline PB/SB, season aggregates and leaderboard for athlete/dashboard consumers', async () => {
  vi.mocked(request).mockResolvedValue({ data: [performance] });
  render(<VerticalStatistics path="/api/v1/dashboard/disciplines?year=2026" />);
  fireEvent.click(screen.getByRole('button', { name: /Load discipline statistics/ }));
  expect(await screen.findByRole('table')).toHaveTextContent('200 metres');
  expect(screen.getByRole('table')).toHaveTextContent('22.00 seconds');
  expect(screen.getByRole('table')).toHaveTextContent('22.50 seconds');
  expect(screen.getByRole('table')).toHaveTextContent('23.00 seconds');
  vi.mocked(request).mockResolvedValue({ data: [] });
  fireEvent(window, new Event('focus'));
  expect(await screen.findByText('No finalized performances.')).toBeInTheDocument();
});
it('uses unauthenticated public statistics and clears stale values on failed refresh', async () => {
  vi.mocked(requestPublic).mockResolvedValue({ data: [performance] });
  render(<VerticalStatistics path="/api/v1/public/statistics/clubs/club/vertical?year=2026" />);
  fireEvent.click(screen.getByRole('button', { name: /Load discipline statistics/ }));
  await screen.findByRole('table');
  expect(requestPublic).toHaveBeenCalledWith('/api/v1/public/statistics/clubs/club/disciplines?year=2026');
  vi.mocked(requestPublic).mockRejectedValue(new Error('Refresh unavailable'));
  fireEvent(window, new Event('focus'));
  await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument());
  expect(screen.getByRole('alert')).toHaveTextContent('Refresh unavailable');
});
