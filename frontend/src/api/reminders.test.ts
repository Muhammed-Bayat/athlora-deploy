import { afterEach, describe, expect, it, vi } from 'vitest';
import * as reminders from './reminders';

afterEach(() => vi.unstubAllGlobals());

function response(data: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(data), { status });
}

describe('reminders API', () => {
  it('lists event reminders', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({ data: [{ id: 'r-1', title: 'Meet tomorrow' }], meta: { count: 1 } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await reminders.listEventReminders();

    expect(result.data).toHaveLength(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/v1/reminders');
  });

  it('gets unread reminder count', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({ data: { count: 5 } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const count = await reminders.getUnreadEventReminderCount();

    expect(count).toBe(5);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/v1/reminders/unread-count');
  });

  it('marks a reminder as read', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(null, 204));
    vi.stubGlobal('fetch', fetchMock);

    await reminders.markEventReminderRead('r-1');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/reminders/r-1/read'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
