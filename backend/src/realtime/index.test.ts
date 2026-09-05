import { describe, expect, it } from 'vitest';
import type { DbExecutor } from '../db/client.js';
import { authorizeEventSubscription } from './index.js';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';

describe('realtime event subscriptions', () => {
  it('rejects malformed event identifiers without querying the database', async () => {
    const query = () => {
      throw new Error('should not query');
    };

    await expect(authorizeEventSubscription('auth0|coach', 'not-a-uuid', { query } as unknown as DbExecutor)).resolves.toBe(false);
  });

  it('uses workspace and accepted guest-fixture visibility when authorizing an event room', async () => {
    let sql = '';
    let parameters: unknown[] = [];
    const executor = {
      query: async (statement: string, values?: unknown[]) => {
        sql = statement;
        parameters = values ?? [];
        return { rows: [{ exists: 1 }] };
      },
    } as unknown as DbExecutor;
    const allowed = await authorizeEventSubscription('auth0|coach', EVENT_ID, executor);

    expect(allowed).toBe(true);
    expect(parameters).toEqual(['auth0|coach', EVENT_ID]);
    expect(sql).toContain('workspace_members');
    expect(sql).toContain("fw.role = 'guest'");
    expect(sql).toContain("fw.status = 'accepted'");
  });
});
