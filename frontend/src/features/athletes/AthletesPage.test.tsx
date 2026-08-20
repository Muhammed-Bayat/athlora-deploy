import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import type { Athlete } from '../../types';
import { AthletesPage } from './AthletesPage';

const athleteApi = vi.hoisted(() => ({
  getAthlete: vi.fn(),
  listAthletes: vi.fn(),
  createAthlete: vi.fn(),
  updateAthlete: vi.fn(),
  archiveAthlete: vi.fn(),
  unarchiveAthlete: vi.fn(),
}));
const statisticsApi = vi.hoisted(() => ({ getAthleteStatistics: vi.fn() }));

vi.mock('../../api/athletes', () => athleteApi);
vi.mock('../../api/statistics', () => statisticsApi);

const ARI_ID = '11111111-1111-4111-8111-111111111111';
const BEA_ID = '22222222-2222-4222-8222-222222222222';

function athlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: ARI_ID,
    coachId: '33333333-3333-4333-8333-333333333333',
    name: 'Ari Runner',
    dob: '2004-02-29',
    gender: 'Open',
    squad: 'Sprint A',
    notes: 'Starts focus',
    archivedAt: null,
    createdAt: '2026-08-16T10:00:00.000Z',
    updatedAt: '2026-08-16T10:00:00.000Z',
    ...overrides,
  };
}

const ari = athlete();
const bea = athlete({
  id: BEA_ID,
  name: 'Bea Fast',
  dob: null,
  gender: null,
  squad: 'Development',
  notes: null,
});
const archivedBea = athlete({
  ...bea,
  archivedAt: '2026-08-16T11:00:00.000Z',
});

beforeEach(() => {
  vi.clearAllMocks();
  athleteApi.listAthletes.mockResolvedValue({ data: [ari, bea], meta: { count: 2 } });
  athleteApi.getAthlete.mockResolvedValue(ari);
  statisticsApi.getAthleteStatistics.mockResolvedValue({
    athleteId: ARI_ID, discipline: '100m', unit: 'seconds', pb: null, sb: null,
    resultsCount: 0, latestResult: null, latestOutcome: 'no_result', updatedAt: '2026-08-17T10:00:00.000Z',
    athlete: { id: ARI_ID, name: ari.name, squad: ari.squad, archivedAt: null },
    resultCounts: { allTime: 0, currentYear: 0, competitionAllTime: 0, trainingAllTime: 0 },
    latest: null, recentResults: { competitions: [], training: [] },
  });
});

describe('AthletesPage', () => {
  it('opens an athlete detail supplied by dashboard navigation', async () => {
    render(<AthletesPage initialAthleteId={ARI_ID} />);

    expect(await screen.findByText('Personal details')).toBeInTheDocument();
    expect(athleteApi.getAthlete).toHaveBeenCalledWith(ARI_ID);
    expect(statisticsApi.getAthleteStatistics).toHaveBeenCalledWith(ARI_ID);
  });

  it('opens API roster athlete performance and restores focus to the exact roster trigger', async () => {
    const user = userEvent.setup();
    render(<AthletesPage />);
    await screen.findByRole('heading', { name: 'Ari Runner' });

    const ariCard = screen.getByRole('heading', { name: 'Ari Runner' }).closest('article')
      ?? screen.getByRole('heading', { name: 'Ari Runner' }).parentElement!;
    const ariPerformanceButton = within(ariCard).getByRole('button', { name: 'View performance' });
    await user.click(ariPerformanceButton);
    expect(await screen.findByText('Personal details')).toBeInTheDocument();
    expect(athleteApi.getAthlete).toHaveBeenCalledWith(ARI_ID);
    await user.click(screen.getByRole('button', { name: 'Back to roster' }));
    expect(screen.getByRole('heading', { name: 'Athletes' })).toBeInTheDocument();
    const returnedAriCard = screen.getByRole('heading', { name: 'Ari Runner' }).closest('article')
      ?? screen.getByRole('heading', { name: 'Ari Runner' }).parentElement!;
    await waitFor(() => expect(within(returnedAriCard).getByRole('button', { name: 'View performance' })).toHaveFocus());
    expect(screen.getAllByRole('button', { name: 'View performance' })[1]).not.toHaveFocus();
    expect(athleteApi.listAthletes).toHaveBeenCalledOnce();
  });

  it('shows an accessible loading state and then renders API athletes', async () => {
    let resolveList!: (value: { data: Athlete[]; meta: { count: number } }) => void;
    athleteApi.listAthletes.mockReturnValue(
      new Promise((resolve) => {
        resolveList = resolve;
      }),
    );

    render(<AthletesPage />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading your roster');
    expect(screen.getByRole('button', { name: 'Add athlete' })).toBeDisabled();
    resolveList({ data: [ari], meta: { count: 1 } });
    expect(await screen.findByRole('heading', { name: 'Ari Runner' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('Athlete roster')).getAllByText('Sprint A')).toHaveLength(1);
    expect(screen.queryByText(/personal best/i)).not.toBeInTheDocument();
    expect(athleteApi.listAthletes).toHaveBeenCalledWith({ includeArchived: true });
  });

  it('shows a load error and retries without losing the page', async () => {
    athleteApi.listAthletes
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline'))
      .mockResolvedValueOnce({ data: [ari], meta: { count: 1 } });
    const user = userEvent.setup();
    render(<AthletesPage />);

    expect(await screen.findByRole('heading', { name: 'Roster unavailable' })).toBeInTheDocument();
    expect(screen.getByText(/could not reach Athlora/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Ari Runner' })).toBeInTheDocument();
    expect(athleteApi.listAthletes).toHaveBeenCalledTimes(2);
  });

  it('distinguishes an empty roster from an empty filtered result', async () => {
    athleteApi.listAthletes.mockResolvedValueOnce({ data: [], meta: { count: 0 } });
    const user = userEvent.setup();
    const { unmount } = render(<AthletesPage />);
    expect(await screen.findByText('No athletes yet')).toBeInTheDocument();
    unmount();

    athleteApi.listAthletes.mockResolvedValueOnce({ data: [ari], meta: { count: 1 } });
    render(<AthletesPage />);
    await screen.findByRole('heading', { name: 'Ari Runner' });
    await user.type(screen.getByRole('textbox', { name: 'Search athletes by name' }), 'nobody');

    expect(await screen.findByText('No athletes match your filters')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('heading', { name: 'Ari Runner' })).toBeInTheDocument();
  });

  it('filters the loaded roster by name, squad, and archive state', async () => {
    athleteApi.listAthletes.mockResolvedValueOnce({
      data: [ari, archivedBea],
      meta: { count: 2 },
    });
    const user = userEvent.setup();
    render(<AthletesPage />);
    await screen.findByRole('heading', { name: 'Ari Runner' });

    await user.selectOptions(screen.getByLabelText('Filter by roster status'), 'all');
    expect(screen.getByRole('heading', { name: 'Bea Fast' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filter by squad'), 'Development');
    expect(screen.queryByRole('heading', { name: 'Ari Runner' })).not.toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: 'Search athletes by name' }));
    await user.type(screen.getByRole('textbox', { name: 'Search athletes by name' }), 'bea');
    expect(screen.getByRole('heading', { name: 'Bea Fast' })).toBeInTheDocument();
  });

  it('validates and creates an athlete with the exact normalized payload', async () => {
    const created = athlete({ id: '44444444-4444-4444-8444-444444444444', name: 'Casey Quick' });
    athleteApi.createAthlete.mockResolvedValue(created);
    const user = userEvent.setup();
    render(<AthletesPage />);
    await screen.findByRole('heading', { name: 'Ari Runner' });
    await user.click(screen.getByRole('button', { name: 'Add athlete' }));
    const dialog = screen.getByRole('dialog', { name: 'Add athlete' });

    await user.click(within(dialog).getByRole('button', { name: 'Add athlete' }));
    expect(within(dialog).getByText('Athlete name is required.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Athlete name')).toBeRequired();
    expect(athleteApi.createAthlete).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText('Athlete name'), '  Casey Quick  ');
    await user.type(within(dialog).getByLabelText(/gender category/i), 'Open');
    await user.type(within(dialog).getByLabelText(/discipline group/i), 'Sprint B');
    await user.type(within(dialog).getByLabelText(/coach notes/i), '  Acceleration block  ');
    await user.click(within(dialog).getByRole('button', { name: 'Add athlete' }));

    await waitFor(() => expect(athleteApi.createAthlete).toHaveBeenCalledWith({
      name: 'Casey Quick',
      dob: null,
      gender: 'Open',
      squad: 'Sprint B',
      notes: 'Acceleration block',
    }));
    expect(await screen.findByRole('heading', { name: 'Casey Quick' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Casey Quick added to the roster');
  });

  it('edits an athlete using a full replacement payload', async () => {
    const updated = athlete({ name: 'Ari Updated', notes: null });
    athleteApi.updateAthlete.mockResolvedValue(updated);
    const user = userEvent.setup();
    render(<AthletesPage />);
    await screen.findByRole('heading', { name: 'Ari Runner' });
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Edit athlete' });
    const name = within(dialog).getByLabelText('Athlete name');
    await user.clear(name);
    await user.type(name, 'Ari Updated');
    await user.clear(within(dialog).getByLabelText(/coach notes/i));
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(athleteApi.updateAthlete).toHaveBeenCalledWith(ARI_ID, {
      name: 'Ari Updated',
      dob: '2004-02-29',
      gender: 'Open',
      squad: 'Sprint A',
      notes: null,
    }));
    expect(await screen.findByRole('heading', { name: 'Ari Updated' })).toBeInTheDocument();
  });

  it('maps backend validation to the form and preserves the draft', async () => {
    athleteApi.createAthlete.mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed', {
        issues: [{ path: 'name', code: 'invalid_value', message: 'Name is unavailable' }],
      }),
    );
    const user = userEvent.setup();
    render(<AthletesPage />);
    await screen.findByRole('heading', { name: 'Ari Runner' });
    await user.click(screen.getByRole('button', { name: 'Add athlete' }));
    const dialog = screen.getByRole('dialog', { name: 'Add athlete' });
    await user.type(within(dialog).getByLabelText('Athlete name'), 'Taken Name');
    await user.click(within(dialog).getByRole('button', { name: 'Add athlete' }));

    expect(await within(dialog).findByText('Name is unavailable')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Athlete name')).toHaveValue('Taken Name');
    expect(dialog).toBeInTheDocument();
  });

  it('keeps focus contained while a form submission is pending', async () => {
    let resolveCreate!: (value: Athlete) => void;
    athleteApi.createAthlete.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<AthletesPage />);
    await screen.findByRole('heading', { name: 'Ari Runner' });
    await user.click(screen.getByRole('button', { name: 'Add athlete' }));
    const dialog = screen.getByRole('dialog', { name: 'Add athlete' });
    await user.type(within(dialog).getByLabelText('Athlete name'), 'Casey Quick');
    await user.click(within(dialog).getByRole('button', { name: 'Add athlete' }));

    await waitFor(() => expect(dialog).toHaveAttribute('aria-busy', 'true'));
    expect(dialog).toHaveFocus();
    await user.tab();
    expect(dialog).toHaveFocus();

    resolveCreate(athlete({ id: '44444444-4444-4444-8444-444444444444', name: 'Casey Quick' }));
    expect(await screen.findByRole('heading', { name: 'Casey Quick' })).toBeInTheDocument();
  });

  it('requires confirmation before archiving and preserves history in the copy', async () => {
    const archived = athlete({ archivedAt: '2026-08-16T12:00:00.000Z' });
    athleteApi.archiveAthlete.mockResolvedValue(archived);
    const user = userEvent.setup();
    render(<AthletesPage />);
    await screen.findByRole('heading', { name: 'Ari Runner' });
    const addButton = screen.getByRole('button', { name: 'Add athlete' });
    await user.click(screen.getAllByRole('button', { name: 'Archive' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Archive athlete' });
    expect(dialog).toHaveTextContent('event assignments, timeline entries, and results will be preserved');
    expect(athleteApi.archiveAthlete).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Archive athlete' }));
    await waitFor(() => expect(athleteApi.archiveAthlete).toHaveBeenCalledWith(ARI_ID));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Ari Runner' })).not.toBeInTheDocument());
    await waitFor(() => expect(addButton).toHaveFocus());
    await user.selectOptions(screen.getByLabelText('Filter by roster status'), 'archived');
    expect(screen.getByRole('heading', { name: 'Ari Runner' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('Athlete roster')).getAllByText('Archived')).toHaveLength(1);
  });

  it('keeps the confirmation and roster available when archival fails', async () => {
    athleteApi.archiveAthlete.mockRejectedValue(
      new ApiError(500, 'INTERNAL_ERROR', 'Archive failed'),
    );
    const user = userEvent.setup();
    render(<AthletesPage />);
    await screen.findByRole('heading', { name: 'Ari Runner' });
    await user.click(screen.getAllByRole('button', { name: 'Archive' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Archive athlete' });
    await user.click(within(dialog).getByRole('button', { name: 'Archive athlete' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Archive failed');
    expect(screen.getByRole('heading', { name: 'Ari Runner' })).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });

  it('restores an archived athlete and reports mutation failures without losing the list', async () => {
    athleteApi.listAthletes.mockResolvedValueOnce({ data: [archivedBea], meta: { count: 1 } });
    athleteApi.unarchiveAthlete
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'Restore failed'))
      .mockResolvedValueOnce(bea);
    const user = userEvent.setup();
    render(<AthletesPage />);
    const addButton = screen.getByRole('button', { name: 'Add athlete' });
    await user.selectOptions(screen.getByLabelText('Filter by roster status'), 'archived');
    await screen.findByRole('heading', { name: 'Bea Fast' });

    await user.click(screen.getByRole('button', { name: 'Restore' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Restore failed');
    expect(screen.getByRole('heading', { name: 'Bea Fast' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Bea Fast' })).not.toBeInTheDocument());
    await waitFor(() => expect(addButton).toHaveFocus());
    await user.selectOptions(screen.getByLabelText('Filter by roster status'), 'active');
    expect(screen.getByRole('heading', { name: 'Bea Fast' })).toBeInTheDocument();
  });

  it('closes a form with Escape and restores focus to its trigger', async () => {
    const user = userEvent.setup();
    render(<AthletesPage />);
    await screen.findByRole('heading', { name: 'Ari Runner' });
    const trigger = screen.getByRole('button', { name: 'Add athlete' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Add athlete' });
    const close = within(dialog).getByRole('button', { name: 'Close' });
    const submit = within(dialog).getByRole('button', { name: 'Add athlete' });
    close.focus();
    await user.tab({ shift: true });
    expect(submit).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Add athlete' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
