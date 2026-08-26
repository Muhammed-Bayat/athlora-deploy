import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CoachConsole } from './CoachConsole';

vi.mock('./DashboardPage', () => ({
  DashboardPage: ({
    onOpenAthlete,
    onOpenEvent,
    onResumeLogging,
  }: {
    onOpenAthlete: (id: string) => void;
    onOpenEvent: (id: string) => void;
    onResumeLogging: (id: string) => void;
  }) => <div>
    <button type="button" onClick={() => onOpenAthlete('athlete-42')}>Open athlete record</button>
    <button type="button" onClick={() => onOpenEvent('event-42')}>Open event record</button>
    <button type="button" onClick={() => onResumeLogging('live-42')}>Resume event logging</button>
  </div>,
}));

vi.mock('../athletes/AthletesPage', () => ({
  AthletesPage: ({ initialAthleteId }: { initialAthleteId?: string }) => <p>Athlete target: {initialAthleteId ?? 'none'}</p>,
}));

vi.mock('../events/EventsPage', () => ({
  EventsPage: () => <p>Events list</p>,
}));
vi.mock('../events/EventDetailPage', () => ({ EventDetailPage: ({ eventId }: { eventId: string }) => <p>Event target: {eventId}</p> }));

vi.mock('../timeline/LiveLoggingPage', () => ({
  LiveLoggingPage: ({ initialEventId }: { initialEventId?: string }) => <p>Live target: {initialEventId ?? 'none'}</p>,
}));

vi.mock('../auth/AuthPage', () => ({ AuthPage: () => <p>Account view</p> }));

describe('CoachConsole dashboard navigation', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
  });

  it('opens exact athlete, event, and live logging destinations', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/console']}><CoachConsole /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'Open athlete record' }));
    expect(screen.getByText('Athlete target: athlete-42')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /athletes/i })[0]).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getAllByRole('button', { name: /dashboard/i })[0]);
    await user.click(screen.getByRole('button', { name: 'Open event record' }));
    expect(screen.getByText('Event target: event-42')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /events/i })[0]).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getAllByRole('button', { name: /dashboard/i })[0]);
    await user.click(screen.getByRole('button', { name: 'Resume event logging' }));
    expect(screen.getByText('Live target: live-42')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /live logger/i })[0]).toHaveAttribute('aria-current', 'page');
  });

  it('clears a targeted record when standard navigation is used', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/console']}><CoachConsole /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'Open athlete record' }));
    expect(screen.getByText('Athlete target: athlete-42')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /athletes/i })[0]);
    expect(screen.getByText('Athlete target: none')).toBeInTheDocument();
  });
});
