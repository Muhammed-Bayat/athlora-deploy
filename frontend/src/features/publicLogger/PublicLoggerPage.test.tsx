import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as publicLoggerApi from '../../api/publicLoggers';
import { PublicLoggerPage } from './PublicLoggerPage';

vi.mock('../../api/publicLoggers');

const snapshot = {
  event: { id: '22222222-2222-4222-8222-222222222222', title: 'City Sprint Meet', status: 'in_progress' as const },
  participants: [{ athleteId: '33333333-3333-4333-8333-333333333333', name: 'Nia Runner' }],
  timeline: [],
};

function renderPage() {
  return render(<MemoryRouter initialEntries={['/log/opaque-link-token']}><Routes><Route path="/log/:token" element={<PublicLoggerPage />} /></Routes></MemoryRouter>);
}

describe('PublicLoggerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.mocked(publicLoggerApi.startPublicLoggerSession).mockResolvedValue({ sessionToken: 'opaque-session-token', snapshot });
    vi.mocked(publicLoggerApi.getPublicLoggerSnapshot).mockResolvedValue(snapshot);
    vi.mocked(publicLoggerApi.createPublicLoggerEntry).mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444', eventId: snapshot.event.id,
      athleteId: snapshot.participants[0].athleteId, discipline: '100m', entryType: 'attempt', value: 11.42,
      unit: 'seconds', isFoul: false, incidentType: null, noteText: null, version: 1,
      createdAt: '2026-09-01T10:00:00.000Z',
    });
  });

  it('exchanges the link once, stores only the issued session in sessionStorage, and records an attempt', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Name'), 'Timekeeper Sam');
    expect(screen.getByLabelText('Club or organization')).toHaveValue('Independent');
    await user.clear(screen.getByLabelText('Club or organization'));
    await user.type(screen.getByLabelText('Club or organization'), 'North Club');
    await user.click(screen.getByRole('button', { name: 'Open logger' }));

    await screen.findByRole('heading', { name: 'City Sprint Meet' });
    expect(publicLoggerApi.startPublicLoggerSession).toHaveBeenCalledWith('opaque-link-token', 'Timekeeper Sam', 'North Club');
    expect(sessionStorage.getItem('athlora_public_logger_session')).toBe('opaque-session-token');
    expect(sessionStorage.getItem('athlora_public_logger_session')).not.toContain('opaque-link-token');

    await user.type(screen.getByLabelText('100m time in seconds'), '11.42');
    await user.click(screen.getByRole('button', { name: 'Record attempt' }));
    await waitFor(() => expect(publicLoggerApi.createPublicLoggerEntry).toHaveBeenCalledWith(
      'opaque-session-token', snapshot.event.id, expect.objectContaining({ athleteId: snapshot.participants[0].athleteId, entryType: 'attempt', value: 11.42 }),
    ));
  });
});
