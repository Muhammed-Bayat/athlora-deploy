import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { PublicScheduleIndexPage } from './PublicScheduleIndexPage';
import { PublicScheduleClubPage } from './PublicScheduleClubPage';

const mockListPublicScheduleClubs = vi.fn();
const mockGetPublicClubSchedule = vi.fn();

vi.mock('../../api/publicSchedule', () => ({
  listPublicScheduleClubs: (...args: unknown[]) => mockListPublicScheduleClubs(...args),
  getPublicClubSchedule: (...args: unknown[]) => mockGetPublicClubSchedule(...args),
}));

const CLUB_ID = '33333333-3333-4333-8333-333333333333';

const schedule = {
  club: {
    id: CLUB_ID,
    name: 'Open Track Club',
    branding: { description: 'Sprint-focused club.', primaryColor: null, accentColor: null, logoUrl: null, coverUrl: null },
  },
  events: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      title: 'Spring Open',
      date: '2026-10-01',
      time: '10:00:00',
      type: 'competition' as const,
      discipline: '100m' as const,
      disciplines: [{ code: '100m', label: '100m' }, { code: 'long_jump', label: 'Long jump' }],
      locationName: 'City Track',
      status: 'scheduled' as const,
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      title: 'Evening Session',
      date: '2026-11-12',
      time: null,
      type: 'training' as const,
      discipline: null,
      disciplines: [],
      locationName: null,
      status: 'scheduled' as const,
    },
  ],
};

function renderClubPage() {
  return render(
    <MemoryRouter initialEntries={[`/schedule/${CLUB_ID}`]}>
      <Routes>
        <Route path="/schedule/:clubId" element={<PublicScheduleClubPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PublicScheduleIndexPage', () => {
  it('lists published clubs as links to their schedule pages', async () => {
    mockListPublicScheduleClubs.mockResolvedValue({ data: [{ id: CLUB_ID, name: 'Open Track Club' }], meta: { count: 1 } });

    render(<MemoryRouter initialEntries={['/schedule']}><Routes><Route path="/schedule" element={<PublicScheduleIndexPage />} /></Routes></MemoryRouter>);

    const link = await screen.findByRole('link', { name: /Open Track Club/ });
    expect(link).toHaveAttribute('href', `/schedule/${CLUB_ID}`);
    expect(mockListPublicScheduleClubs).toHaveBeenCalledWith('', expect.any(AbortSignal));
  });

  it('re-queries clubs when the search form is submitted', async () => {
    mockListPublicScheduleClubs.mockResolvedValue({ data: [], meta: { count: 0 } });

    render(<MemoryRouter initialEntries={['/schedule']}><Routes><Route path="/schedule" element={<PublicScheduleIndexPage />} /></Routes></MemoryRouter>);
    await screen.findByText(/No clubs have published their schedule/);

    await userEvent.type(screen.getByLabelText('Search published clubs'), 'harbour');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(mockListPublicScheduleClubs).toHaveBeenCalledWith('harbour', expect.any(AbortSignal)));
  });

  it('shows the empty state when no clubs publish a schedule', async () => {
    mockListPublicScheduleClubs.mockResolvedValue({ data: [], meta: { count: 0 } });

    render(<MemoryRouter initialEntries={['/schedule']}><Routes><Route path="/schedule" element={<PublicScheduleIndexPage />} /></Routes></MemoryRouter>);

    expect(await screen.findByText(/No clubs have published their schedule/)).toBeInTheDocument();
  });
});

describe('PublicScheduleClubPage', () => {
  it('renders upcoming meets with accessible date/time, venue and disciplines', async () => {
    mockGetPublicClubSchedule.mockResolvedValue(schedule);

    renderClubPage();

    expect(await screen.findByRole('heading', { name: /Open Track Club/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Spring Open' })).toBeInTheDocument();

    const time = screen.getByText('01 Oct 2026, 10:00');
    expect(time.closest('time')).toHaveAttribute('dateTime', '2026-10-01T10:00:00');
    const allDayTime = screen.getByText('12 Nov 2026');
    expect(allDayTime.closest('time')).toHaveAttribute('dateTime', '2026-11-12T00:00:00');

    expect(screen.getByText('Venue: City Track')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Disciplines at Spring Open' })).toHaveTextContent('100m');
    expect(screen.getByRole('list', { name: 'Disciplines at Spring Open' })).toHaveTextContent('Long jump');
    expect(screen.getAllByText(/^Venue:/)).toHaveLength(1);
  });

  it('shows the empty state when the published club has no upcoming meets', async () => {
    mockGetPublicClubSchedule.mockResolvedValue({ club: schedule.club, events: [] });

    renderClubPage();

    expect(await screen.findByRole('heading', { name: 'No upcoming meets' })).toBeInTheDocument();
  });

  it('shows a non-disclosing unavailable state for disabled or unknown clubs', async () => {
    mockGetPublicClubSchedule.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Resource not found'));

    renderClubPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("This schedule isn't published.");
    expect(alert).not.toHaveTextContent('Open Track Club');
    expect(screen.getByRole('link', { name: 'Browse published schedules' })).toHaveAttribute('href', '/schedule');
    expect(mockGetPublicClubSchedule).toHaveBeenCalledWith(CLUB_ID, expect.any(AbortSignal));
  });

  it('shows a generic error for non-404 failures', async () => {
    mockGetPublicClubSchedule.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong'));

    renderClubPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });
});
