import { describe, expect, it, vi } from 'vitest';
import type { DbExecutor } from '../db/client.js';
import { createPublicLoggerLink, publicLoggerSnapshot } from './publicLoggers.js';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';

describe('public logger service', () => {
  it('stores only a hash when creating a link', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      id: '33333333-3333-4333-8333-333333333333', event_id: EVENT_ID, status: 'active',
      created_at: new Date('2026-09-01T10:00:00.000Z'), revoked_at: null,
    }] });

    const result = await createPublicLoggerLink(WORKSPACE_ID, EVENT_ID, WORKSPACE_ID, { query } as unknown as DbExecutor);

    const storedHash = query.mock.calls[0][1][2];
    expect(result.token).toHaveLength(43);
    expect(storedHash).not.toBe(result.token);
    expect(storedHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not disclose data when the supplied session is no longer valid', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(publicLoggerSnapshot('expired-session', EVENT_ID, { query } as unknown as DbExecutor))
      .rejects.toMatchObject({ status: 401, code: 'PUBLIC_LOGGER_SESSION_INVALID' });
    expect(query.mock.calls[0][1][0]).not.toBe('expired-session');
  });
});
