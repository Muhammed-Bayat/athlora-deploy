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

function renderPage(token = 'opaque-link-token') {
  return render(<MemoryRouter initialEntries={[`/log/${token}`]}><Routes><Route path="/log/:token" element={<PublicLoggerPage />} /></Routes></MemoryRouter>);
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
      unit: 'seconds', isFoul: false, incidentType: null, version: 1,
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
    expect([...Array(sessionStorage.length)].map((_, index) => sessionStorage.key(index)).filter((key): key is string => key !== null)).toHaveLength(2);
    expect([...Array(sessionStorage.length)].map((_, index) => sessionStorage.getItem(sessionStorage.key(index)!))).toContain('opaque-session-token');
    expect([...Array(sessionStorage.length)].map((_, index) => sessionStorage.getItem(sessionStorage.key(index)!))).not.toContain('opaque-link-token');

    await user.type(screen.getByLabelText('Finish time for Nia Runner'), '11.42');
    await user.click(screen.getByRole('button', { name: 'Record' }));
    await waitFor(() => expect(publicLoggerApi.createPublicLoggerEntry).toHaveBeenCalledWith(
      'opaque-session-token', snapshot.event.id, expect.objectContaining({ athleteId: snapshot.participants[0].athleteId, entryType: 'attempt', value: 11.42 }),
    ));
  });

  it('does not reuse a session opened from a different QR link', async () => {
    const user = userEvent.setup();
    const first = renderPage('first-link-token');

    await user.type(screen.getByLabelText('Name'), 'Timekeeper Sam');
    await user.click(screen.getByRole('button', { name: 'Open logger' }));
    await screen.findByRole('heading', { name: 'City Sprint Meet' });
    first.unmount();

    renderPage('second-link-token');

    expect(screen.getByRole('heading', { name: 'Join event logging' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Name'), 'Timekeeper Lee');
    await user.click(screen.getByRole('button', { name: 'Open logger' }));
    expect(publicLoggerApi.startPublicLoggerSession).toHaveBeenLastCalledWith('second-link-token', 'Timekeeper Lee', 'Independent');
  });

  it('only shows correction controls supplied for the current public session', async () => {
    const ownEntry = {
      id: '44444444-4444-4444-8444-444444444444', eventId: snapshot.event.id,
      athleteId: snapshot.participants[0].athleteId, discipline: '100m' as const, entryType: 'attempt' as const,
      value: 11.42, unit: 'seconds' as const, isFoul: false, incidentType: null, version: 1,
      createdAt: '2026-09-01T10:00:00.000Z', canEdit: true, canUndo: true,
    };
    const otherEntry = { ...ownEntry, id: '55555555-5555-4555-8555-555555555555', canEdit: false, canUndo: false };
    const sessionSnapshot = { ...snapshot, timeline: [ownEntry, otherEntry] };
    vi.mocked(publicLoggerApi.startPublicLoggerSession).mockResolvedValue({ sessionToken: 'opaque-session-token', snapshot: sessionSnapshot });
    vi.mocked(publicLoggerApi.getPublicLoggerSnapshot).mockResolvedValue(sessionSnapshot);
    vi.mocked(publicLoggerApi.updatePublicLoggerEntry).mockResolvedValue(ownEntry);
    vi.mocked(publicLoggerApi.removePublicLoggerEntry).mockResolvedValue();
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Name'), 'Timekeeper Sam');
    await user.click(screen.getByRole('button', { name: 'Open logger' }));
    await screen.findByRole('button', { name: 'Edit' });
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('Finish time in seconds'));
    await user.type(screen.getByLabelText('Finish time in seconds'), '11.40');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(publicLoggerApi.updatePublicLoggerEntry).toHaveBeenCalledWith('opaque-session-token', snapshot.event.id, ownEntry.id, { expectedVersion: 1, value: 11.4 }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(publicLoggerApi.removePublicLoggerEntry).toHaveBeenCalledWith('opaque-session-token', snapshot.event.id, ownEntry.id, { expectedVersion: 1 }));
  });
});
