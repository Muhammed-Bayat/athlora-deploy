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

describe('LandingPage', () => {
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });

  it('shows the branded landing animation for two seconds', () => {
    vi.useFakeTimers();
    renderLanding();

    expect(screen.getByTestId('landing-intro')).toHaveTextContent('ATHLORA');
    act(() => vi.advanceTimersByTime(1999));
    expect(screen.getByTestId('landing-intro')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByTestId('landing-intro')).not.toBeInTheDocument();
  });

  it('renders complete hero lines for scroll reveals without a typewriter', () => {
    vi.useFakeTimers();
    renderLanding();

    const heading = screen.getByRole('heading', { name: 'Track the squad. Run the season.' });
    expect(heading).toHaveTextContent('Run the season.');
    expect(heading.querySelector('i')).toBeNull();
    expect(heading.querySelectorAll('[data-scroll-reveal]')).toHaveLength(2);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 1000 });
    fireEvent.scroll(window);
    act(() => vi.advanceTimersByTime(32));
    act(() => vi.advanceTimersByTime(1400));
    expect(screen.getByRole('heading', { name: 'Track the squad. Run the season.' })).toHaveTextContent('Track the squad.');
    expect(screen.getByRole('link', { name: 'Skip cinematic introduction' })).toHaveAttribute('href', '#top');
    expect(document.getElementById('cinematic-intro')).toHaveAttribute('aria-hidden', 'true');
  });

  it('wires the persistent account actions to the supplied callbacks', () => {
    const callbacks = renderLanding();

    fireEvent.click(screen.getByRole('button', { name: /^log in$/i }));
    fireEvent.click(screen.getByRole('button', { name: /already have an account/i }));
    fireEvent.click(screen.getByRole('button', { name: /^get started$/i }));
    screen.getAllByRole('button', { name: /^get started free$/i }).forEach(fireEvent.click);
    fireEvent.click(screen.getByRole('button', { name: /^forgot password$/i }));

    const menuButton = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(menuButton);
    const dialog = screen.getByRole('dialog', { name: /navigation menu/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /forgot password/i }));

    expect(callbacks.onLogin).toHaveBeenCalledTimes(2);
    expect(callbacks.onSignup).toHaveBeenCalledTimes(3);
    expect(callbacks.onPasswordHelp).toHaveBeenCalledTimes(2);
  });

  it('links visitors to the public statistics page from the header', () => {
    renderLanding();

    expect(screen.getByRole('link', { name: 'Stats' })).toHaveAttribute('href', '/stats');
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

  it('keeps the continuous story and real product information available in native DOM chapters', () => {
    renderLanding();

    expect(screen.getByRole('heading', { name: 'Track the squad. Run the season.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'One squad. Every athlete visible.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The season comes into focus.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Every lane tells a performance story.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'See more than performance.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The entire season, in one place.' })).toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: 'Athletes' })).toHaveTextContent('Jordan Lee');
  });
});
