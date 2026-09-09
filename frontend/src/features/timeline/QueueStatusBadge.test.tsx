import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueStatusBadge } from './QueueStatusBadge';
import * as actionQueue from '../../offline/actionQueue';

vi.mock('../../offline/actionQueue');

const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('QueueStatusBadge', () => {
  it('renders nothing when status is null', async () => {
    vi.mocked(actionQueue.getQueueStatus).mockResolvedValue({ pending: 0, synced: 0, failed: 0 });
    const { container } = render(<QueueStatusBadge eventId={EVENT_ID} userId={USER_ID} />);
    await waitFor(() => expect(actionQueue.getQueueStatus).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('renders pending count', async () => {
    vi.mocked(actionQueue.getQueueStatus).mockResolvedValue({ pending: 3, synced: 0, failed: 0 });
    render(<QueueStatusBadge eventId={EVENT_ID} userId={USER_ID} />);
    expect(await screen.findByRole('status')).toHaveTextContent('3 pending');
  });

  it('renders failed count with highest priority', async () => {
    vi.mocked(actionQueue.getQueueStatus).mockResolvedValue({ pending: 2, synced: 5, failed: 1 });
    render(<QueueStatusBadge eventId={EVENT_ID} userId={USER_ID} />);
    expect(await screen.findByRole('status')).toHaveTextContent('1 failed');
  });

  it('renders All synced when only synced actions remain', async () => {
    vi.mocked(actionQueue.getQueueStatus).mockResolvedValue({ pending: 0, synced: 4, failed: 0 });
    render(<QueueStatusBadge eventId={EVENT_ID} userId={USER_ID} />);
    expect(await screen.findByRole('status')).toHaveTextContent('All synced');
  });

  it('renders nothing when getQueueStatus throws', async () => {
    vi.mocked(actionQueue.getQueueStatus).mockRejectedValue(new Error('IndexedDB unavailable'));
    const { container } = render(<QueueStatusBadge eventId={EVENT_ID} userId={USER_ID} />);
    await waitFor(() => expect(actionQueue.getQueueStatus).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });
});
