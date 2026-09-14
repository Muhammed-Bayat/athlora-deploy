import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Result } from '../../types';
import { ResultCorrectionForm } from './ResultCorrectionForm';

const resultsApi = vi.hoisted(() => ({
  overrideResult: vi.fn(),
}));

vi.mock('../../api/results', () => resultsApi);

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const ATHLETE_ID = '22222222-2222-4222-8222-222222222222';

function result(overrides: Partial<Result> = {}): Result {
  return {
    eventId: EVENT_ID,
    athleteId: ATHLETE_ID,
    discipline: '100m',
    outcome: 'valid',
    finalResult: 11.24,
    unit: 'seconds',
    placing: 1,
    isPb: false,
    isSb: false,
    manualOverride: null,
    overrideReason: null,
    overriddenBy: null,
    overrideAt: null,
    updatedAt: '2026-08-17T10:00:00.000Z',
    ...overrides,
  };
}

const currentUser = { id: 'coach-1', name: 'Coach Avery' };

function renderForm({
  resultValue = result(),
  user = currentUser,
}: {
  resultValue?: Result;
  user?: { id: string; name: string } | null;
} = {}) {
  const callbacks = {
    onBack: vi.fn(),
    onSaved: vi.fn(),
    onBusyChange: vi.fn(),
  };
  const view = render(
    <ResultCorrectionForm
      target={{ athleteName: 'Ari Runner', result: resultValue }}
      currentUser={user}
      {...callbacks}
    />,
  );
  return { ...view, ...callbacks };
}

beforeEach(() => {
  vi.clearAllMocks();
  resultsApi.overrideResult.mockResolvedValue(result());
});

describe('ResultCorrectionForm', () => {
  it('presents derived and current effective values as read-only context', () => {
    renderForm({
      resultValue: result({
        manualOverride: 11.1,
        overrideReason: 'Photo finish review',
        overriddenBy: 'coach-1',
        overrideAt: '2026-08-17T10:05:00.000Z',
      }),
    });

    expect(screen.getByText('Derived value · read only')).toBeInTheDocument();
    expect(screen.getByText('11.24s')).toBeInTheDocument();
    expect(screen.getByText('Current effective value')).toBeInTheDocument();
    expect(screen.getAllByText('11.10s')).toHaveLength(2);
    expect(screen.queryByRole('textbox', { name: /Derived value|Current effective value/ })).not.toBeInTheDocument();
  });

  it('requires a positive corrected time and a reason', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Apply correction' }));
    expect(screen.getByText('Enter a corrected time greater than zero.')).toBeInTheDocument();
    expect(screen.getByText('A reason is required for every correction.')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Corrected time (seconds)' })).toHaveFocus();
    expect(resultsApi.overrideResult).not.toHaveBeenCalled();

    await user.type(screen.getByRole('spinbutton', { name: 'Corrected time (seconds)' }), '0');
    await user.click(screen.getByRole('button', { name: 'Apply correction' }));
    expect(screen.getByText('Enter a corrected time greater than zero.')).toBeInTheDocument();
    expect(resultsApi.overrideResult).not.toHaveBeenCalled();

    await user.clear(screen.getByRole('spinbutton', { name: 'Corrected time (seconds)' }));
    await user.type(screen.getByRole('spinbutton', { name: 'Corrected time (seconds)' }), '10.98');
    await user.click(screen.getByRole('button', { name: 'Apply correction' }));
    expect(screen.getByText('A reason is required for every correction.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Reason for correction' })).toHaveFocus();
    expect(resultsApi.overrideResult).not.toHaveBeenCalled();
  });

  it('sets a correction with the exact normalized API payload', async () => {
    const user = userEvent.setup();
    const { onSaved } = renderForm();

    await user.type(screen.getByRole('spinbutton', { name: 'Corrected time (seconds)' }), '10.98');
    await user.type(screen.getByRole('textbox', { name: 'Reason for correction' }), '  Photo finish correction  ');
    await user.click(screen.getByRole('button', { name: 'Apply correction' }));

    expect(resultsApi.overrideResult).toHaveBeenCalledWith(EVENT_ID, ATHLETE_ID, {
      manualOverride: 10.98,
      overrideReason: 'Photo finish correction',
    });
    expect(onSaved).toHaveBeenCalledWith(
      "Ari Runner's result corrected to 10.98s. All event placings were refreshed.",
    );
  });

  it('rejects sub-hundredth precision that the result board cannot display', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByRole('spinbutton', { name: 'Corrected time (seconds)' }), '10.987');
    await user.type(screen.getByRole('textbox', { name: 'Reason for correction' }), 'Camera review');
    await user.click(screen.getByRole('button', { name: 'Apply correction' }));

    expect(screen.getByText('Use no more than two decimal places for a 100m time.')).toBeInTheDocument();
    expect(resultsApi.overrideResult).not.toHaveBeenCalled();
  });

  it('requires confirmation and clears with the exact paired-null payload', async () => {
    const user = userEvent.setup();
    const { onSaved } = renderForm({
      resultValue: result({
        manualOverride: 10.9,
        overrideReason: 'Camera review',
        overriddenBy: 'coach-1',
        overrideAt: '2026-08-17T10:05:00.000Z',
      }),
    });

    await user.click(screen.getByRole('button', { name: 'Clear correction' }));
    expect(resultsApi.overrideResult).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: /Clear the 10.90s correction/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep correction' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Keep correction' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clear correction' })).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Clear correction' }));

    await user.click(screen.getByRole('button', { name: 'Confirm clear' }));
    expect(resultsApi.overrideResult).toHaveBeenCalledWith(EVENT_ID, ATHLETE_ID, {
      manualOverride: null,
      overrideReason: null,
    });
    expect(onSaved).toHaveBeenCalledWith(
      "Ari Runner's manual correction was cleared. The timeline-derived result is authoritative again.",
    );
  });

  it('labels the current user by name and falls back to a shortened actor ID', () => {
    const auditedResult = result({
      manualOverride: 11.1,
      overrideReason: 'Timing review',
      overriddenBy: 'abcdefgh-1234-5678',
      overrideAt: '2026-08-17T10:05:00.000Z',
    });
    const matching = renderForm({
      resultValue: auditedResult,
      user: { id: 'abcdefgh-1234-5678', name: 'Coach Jordan' },
    });
    expect(screen.getByText(/Applied by/)).toHaveTextContent('Applied by Coach Jordan (you)');
    matching.unmount();

    renderForm({ resultValue: auditedResult, user: null });
    expect(screen.getByText(/Applied by/)).toHaveTextContent('Applied by User abcdefgh');
  });

  it('keeps a void outcome effective, disables time editing, and permits clearing its audit', () => {
    renderForm({
      resultValue: result({
        outcome: 'dq',
        finalResult: null,
        unit: null,
        placing: null,
        manualOverride: 10.9,
        overrideReason: 'Timing review',
        overriddenBy: 'coach-1',
        overrideAt: '2026-08-17T10:05:00.000Z',
      }),
    });

    expect(screen.getByRole('note')).toHaveTextContent(
      'Disqualified takes precedence over a corrected time',
    );
    expect(screen.getAllByText('Disqualified')).toHaveLength(3);
    expect(screen.queryByRole('spinbutton', { name: 'Corrected time (seconds)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Reason for correction' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update correction' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear correction' })).toBeInTheDocument();
  });

  it('preserves the form draft and existing audit when a mutation fails', async () => {
    resultsApi.overrideResult.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    const { onSaved } = renderForm({
      resultValue: result({
        manualOverride: 11.1,
        overrideReason: 'Original review',
        overriddenBy: 'coach-1',
        overrideAt: '2026-08-17T10:05:00.000Z',
      }),
    });
    const time = screen.getByRole('spinbutton', { name: 'Corrected time (seconds)' });
    const reason = screen.getByRole('textbox', { name: 'Reason for correction' });

    await user.clear(time);
    await user.type(time, '10.88');
    await user.clear(reason);
    await user.type(reason, 'Second camera review');
    await user.click(screen.getByRole('button', { name: 'Update correction' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The correction could not be saved. Please try again.',
    );
    expect(time).toHaveValue(10.88);
    expect(reason).toHaveValue('Second camera review');
    expect(screen.getByText(/Current correction:/)).toHaveTextContent('Current correction: 11.10s');
    expect(screen.getByText(/Current correction:/)).toHaveTextContent('Reason: Original review');
    expect(onSaved).not.toHaveBeenCalled();
    expect(resultsApi.overrideResult).toHaveBeenCalledWith(EVENT_ID, ATHLETE_ID, {
      manualOverride: 10.88,
      overrideReason: 'Second camera review',
    });
  });
});
