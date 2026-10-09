import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import {
  createEventInvitation,
  generateHumanCode,
  hashSecret,
  listEventGrants,
  listEventInvitations,
  redeemInvitation,
  revokeIndividualGrant,
  rotateEventInvitation,
  updateInvitationStatus,
} from '../services/eventHelpers.js';

vi.mock('../db/client.js', () => ({ getPool: vi.fn() }));

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const INVITATION_ID = '22222222-2222-4222-8222-222222222222';
const GRANT_ID = '33333333-3333-4333-8333-333333333333';
const ACTOR = 'auth0|coach';
const invitationRow = {
  id: INVITATION_ID,
  event_id: EVENT_ID,
  secret_hash: 'a'.repeat(64),
  human_code: 'ABC123',
  max_cap: 2,
  status: 'active',
  created_by: ACTOR,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
};
const grantRow = {
  id: GRANT_ID,
  invitation_id: INVITATION_ID,
  event_id: EVENT_ID,
  auth0_sub: 'auth0|official',
  status: 'active',
  redeemed_at: new Date('2026-01-01T00:00:00.000Z'),
};
const query = vi.fn();
const release = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  query.mockReset();
  vi.mocked(getPool).mockReturnValue({
    connect: vi.fn().mockResolvedValue({ query, release }),
    query,
  } as never);
});

describe('Event Helpers Service', () => {
  it('hashes secrets securely using sha256', () => {
    const h1 = hashSecret('test-secret');
    const h2 = hashSecret('test-secret');
    const h3 = hashSecret('other-secret');
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1.length).toBe(64);
  });

  it('generates 6-character human readable codes', () => {
    const code = generateHumanCode();
    expect(code.length).toBe(6);
    expect(/^[A-Z0-9]+$/.test(code)).toBe(true);
  });

  it('creates an active invitation and audits it in one transaction', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'scheduled' }] })
      .mockResolvedValueOnce({ rows: [invitationRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const created = await createEventInvitation(EVENT_ID, ACTOR, 2);

    expect(created.invitation).toMatchObject({ id: INVITATION_ID, eventId: EVENT_ID, maxCap: 2, status: 'active' });
    expect(created.rawSecret).toHaveLength(64);
    expect(created.humanCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(query.mock.calls.map(([sql]) => String(sql))).toEqual(expect.arrayContaining(['BEGIN', 'COMMIT']));
    expect(release).toHaveBeenCalledOnce();
  });

  it('rejects invalid capacity before opening a transaction', async () => {
    await expect(createEventInvitation(EVENT_ID, ACTOR, 0)).rejects.toThrow('capacity must be between 1 and 50');
    expect(getPool).not.toHaveBeenCalled();
  });

  it('rolls back creation when the event is closed', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'completed' }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(createEventInvitation(EVENT_ID, ACTOR)).rejects.toThrow('Cannot create invitation');

    expect(query.mock.calls.map(([sql]) => String(sql))).toEqual(expect.arrayContaining(['BEGIN', 'ROLLBACK']));
    expect(release).toHaveBeenCalledOnce();
  });

  it('rotates an active invitation and rejects a closed invitation', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [invitationRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const rotated = await rotateEventInvitation(EVENT_ID, INVITATION_ID, ACTOR);
    expect(rotated.invitation.humanCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(rotated.rawSecret).toHaveLength(64);

    query.mockReset();
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await expect(rotateEventInvitation(EVENT_ID, INVITATION_ID, ACTOR)).rejects.toThrow('Active invitation not found');
  });

  it('updates invitation and grant status with audit records', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...invitationRow, status: 'revoked' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(updateInvitationStatus(EVENT_ID, INVITATION_ID, 'revoked', ACTOR)).resolves.toMatchObject({ status: 'revoked' });

    query.mockReset();
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...grantRow, status: 'revoked' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(revokeIndividualGrant(EVENT_ID, GRANT_ID, ACTOR)).resolves.toMatchObject({ id: GRANT_ID, status: 'revoked' });
  });

  it('redeems a human code, normalizes it, and returns the new grant', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql.includes('event_helper_audit_logs') || sql.includes('pg_advisory')) return { rows: [] };
      if (sql.includes('FROM event_helper_invitations')) return { rows: [invitationRow] };
      if (sql.includes('SELECT status, updated_at FROM events')) return { rows: [{ status: 'scheduled', updated_at: new Date() }] };
      if (sql.includes('FROM event_helper_grants') && sql.includes('auth0_sub')) return { rows: [] };
      if (sql.includes('COUNT(*)')) return { rows: [{ count: '0' }] };
      if (sql.includes('INSERT INTO event_helper_grants')) return { rows: [grantRow] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(redeemInvitation({ humanCode: ' abc123 ' }, grantRow.auth0_sub)).resolves.toEqual({
      grant: expect.objectContaining({ id: GRANT_ID, auth0Sub: grantRow.auth0_sub, status: 'active' }),
      eventId: EVENT_ID,
    });
    expect(query.mock.calls.find(([sql]) => String(sql).includes('human_code'))?.[1]).toEqual(['ABC123']);
  });

  it('rejects missing, inactive, revoked, and capacity-exhausted invitation credentials', async () => {
    await expect(redeemInvitation({}, grantRow.auth0_sub)).rejects.toThrow('Provide a valid invitation');

    query.mockReset();
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await expect(redeemInvitation({ secret: 'missing' }, grantRow.auth0_sub)).rejects.toThrow('Invalid or inactive');

    query.mockReset();
    query.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('event_helper_invitations')) return { rows: [invitationRow] };
      if (sql.includes('SELECT status, updated_at')) return { rows: [{ status: 'scheduled', updated_at: new Date() }] };
      if (sql.includes('auth0_sub')) return { rows: [{ ...grantRow, status: 'revoked' }] };
      throw new Error(`Unexpected query: ${sql}`);
    });
    await expect(redeemInvitation({ secret: 'valid' }, grantRow.auth0_sub)).rejects.toThrow('Helper grant has been revoked');

    query.mockReset();
    query.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK' || sql.includes('pg_advisory')) return { rows: [] };
      if (sql.includes('event_helper_invitations')) return { rows: [invitationRow] };
      if (sql.includes('SELECT status, updated_at')) return { rows: [{ status: 'scheduled', updated_at: new Date() }] };
      if (sql.includes('auth0_sub')) return { rows: [] };
      if (sql.includes('COUNT(*)')) return { rows: [{ count: '2' }] };
      throw new Error(`Unexpected query: ${sql}`);
    });
    await expect(redeemInvitation({ secret: 'valid' }, 'auth0|new-official')).rejects.toThrow('capacity reached');
  });

  it('lists invitations and grants through the pool', async () => {
    query.mockResolvedValueOnce({ rows: [invitationRow] }).mockResolvedValueOnce({ rows: [grantRow] });

    await expect(listEventInvitations(EVENT_ID)).resolves.toEqual([expect.objectContaining({ id: INVITATION_ID })]);
    await expect(listEventGrants(EVENT_ID)).resolves.toEqual([expect.objectContaining({ id: GRANT_ID })]);
  });
});
