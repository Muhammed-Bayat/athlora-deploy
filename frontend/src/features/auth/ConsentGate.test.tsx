import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsentGate } from './ConsentGate';
import * as authApi from '../../api/auth';

vi.mock('../../api/auth');

describe('ConsentGate', () => {
  const onConsented = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the consent form with disabled button until checkbox is accepted', () => {
    render(<ConsentGate onConsented={onConsented} />);
    expect(screen.getByRole('heading', { name: 'Welcome to Athlora' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('enables the button after the checkbox is toggled', async () => {
    const user = userEvent.setup();
    render(<ConsentGate onConsented={onConsented} />);
    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('calls acceptConsent and onConsented on successful submit', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.acceptConsent).mockResolvedValue(undefined);
    render(<ConsentGate onConsented={onConsented} />);

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(authApi.acceptConsent).toHaveBeenCalledWith('1.0'));
    expect(onConsented).toHaveBeenCalledOnce();
  });

  it('displays an error message when consent submission fails', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.acceptConsent).mockRejectedValue(new Error('Network error'));
    render(<ConsentGate onConsented={onConsented} />);

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your consent. Please try again.');
    expect(onConsented).not.toHaveBeenCalled();
  });

  it('shows Saving... while the request is in flight', async () => {
    const user = userEvent.setup();
    let resolveConsent: () => void;
    vi.mocked(authApi.acceptConsent).mockImplementation(() => new Promise<void>((resolve) => { resolveConsent = resolve; }));
    render(<ConsentGate onConsented={onConsented} />);

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    resolveConsent!();
    await waitFor(() => expect(onConsented).toHaveBeenCalled());
  });
});
