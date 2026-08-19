import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LandingPage } from './LandingPage';

function renderLanding() {
  const callbacks = {
    onLogin: vi.fn(),
    onSignup: vi.fn(),
    onPasswordHelp: vi.fn(),
  };
  render(<LandingPage {...callbacks}/>);
  return callbacks;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('LandingPage', () => {
  it('wires every account action to the supplied callbacks', () => {
    const callbacks = renderLanding();

    screen.getAllByRole('button', { name: /^log in$/i }).forEach(fireEvent.click);
    fireEvent.click(screen.getByRole('button', { name: /already have an account/i }));
    screen.getAllByRole('button', { name: /^get started$/i }).forEach(fireEvent.click);
    screen.getAllByRole('button', { name: /^get started free$/i }).forEach(fireEvent.click);
    fireEvent.click(screen.getByRole('button', { name: /^forgot password$/i }));

    const menuButton = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(menuButton);
    const dialog = screen.getByRole('dialog', { name: /navigation menu/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /forgot password/i }));

    expect(callbacks.onLogin).toHaveBeenCalledTimes(3);
    expect(callbacks.onSignup).toHaveBeenCalledTimes(4);
    expect(callbacks.onPasswordHelp).toHaveBeenCalledTimes(2);
  });

  it('supports keyboard tabs, FAQ relationships, and menu focus restoration', () => {
    renderLanding();
    const athletesTab = screen.getByRole('tab', { name: 'Athletes' });
    fireEvent.keyDown(athletesTab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Events' })).toBeVisible();

    const faqButton = screen.getByRole('button', { name: 'What can I actually track?' });
    fireEvent.click(faqButton);
    expect(faqButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'What can I actually track?' })).toBeVisible();

    const menuButton = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(menuButton);
    expect(screen.getByRole('button', { name: /close menu/i })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(menuButton).toHaveFocus();
  });

  it('runs the intro and stable counters from zero on each mount', () => {
    vi.useFakeTimers();
    const first = render(<LandingPage onLogin={vi.fn()} onSignup={vi.fn()} onPasswordHelp={vi.fn()}/>);

    expect(screen.getByText('ATHLORA')).toBeInTheDocument();
    expect(screen.getByText('Athletes tracked').previousElementSibling).toHaveTextContent('0');
    expect(screen.getByRole('heading', { name: 'Track the squad. Run the season.' })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByText('ATHLORA')).not.toBeInTheDocument();
    expect(screen.getByText('Athletes tracked').previousElementSibling).toHaveTextContent('128');
    expect(screen.getByText('PBs logged this season').previousElementSibling).toHaveTextContent('342');

    first.unmount();
    render(<LandingPage onLogin={vi.fn()} onSignup={vi.fn()} onPasswordHelp={vi.fn()}/>);
    expect(screen.getByText('ATHLORA')).toBeInTheDocument();
    expect(screen.getByText('Athletes tracked').previousElementSibling).toHaveTextContent('0');
  });
});
