import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AthleticsEvent } from '../../types';
import { EventFinalResults } from './EventFinalResults';

const meets = vi.hoisted(() => ({ listEventFinalResults: vi.fn() }));
const downloads = vi.hoisted(() => ({ downloadFile: vi.fn() }));
vi.mock('../../api/meets', () => meets);
vi.mock('../../utils/downloadFile', () => downloads);

const event: AthleticsEvent = {
  id: 'event-1', workspaceId: 'club-1', createdBy: 'coach-1', type: 'competition', discipline: null,
  title: 'City Meet', date: '2026-10-01', time: null, locationName: null, latitude: null, longitude: null,
  status: 'scheduled', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('EventFinalResults', () => {
  it('explains that scheduled and live events do not have final results', () => {
    const { rerender } = render(<EventFinalResults event={event} reloadKey={0} />);
    expect(screen.getByText('No results yet')).toBeInTheDocument();
    expect(meets.listEventFinalResults).not.toHaveBeenCalled();

    rerender(<EventFinalResults event={{ ...event, status: 'in_progress' }} reloadKey={0} />);
    expect(screen.getByText('Event has not yet been completed')).toBeInTheDocument();
  });

  it('renders cross-club final results, relay members, and exports the displayed rows', async () => {
    meets.listEventFinalResults.mockResolvedValue({ data: [
      { entrantId: 'athlete-1', name: 'Ari Runner', clubName: 'Harbour AC', discipline: '100m', disciplineLabel: '100m', finalResult: 10.8, outcome: 'valid', unit: 'seconds', precision: 2, placing: 1, relayMembers: [] },
      { entrantId: 'relay-1', name: 'Harbour Relay', clubName: 'Harbour AC', discipline: '4x100m', disciplineLabel: '4 x 100m relay', finalResult: 44.2, outcome: 'valid', unit: 'seconds', precision: 2, placing: 1, relayMembers: ['Ari Runner', 'Bea Dash', 'Casey Lane', 'Drew Pace'] },
    ] });
    const user = userEvent.setup();
    render(<EventFinalResults event={{ ...event, status: 'completed' }} reloadKey={0} />);

    expect(await screen.findByRole('table', { name: 'Final event results' })).toHaveTextContent('Ari RunnerHarbour AC100m10.80 s');
    expect(screen.getByRole('rowheader', { name: /Harbour Relay/ })).toHaveTextContent('Ari Runner, Bea Dash, Casey Lane, Drew Pace');
    await user.click(screen.getByRole('button', { name: 'Export final results CSV' }));
    expect(downloads.downloadFile).toHaveBeenCalledWith(expect.stringContaining('"Harbour Relay","Ari Runner; Bea Dash; Casey Lane; Drew Pace"'), 'city-meet-final-results.csv', 'text/csv;charset=utf-8');
  });
});
