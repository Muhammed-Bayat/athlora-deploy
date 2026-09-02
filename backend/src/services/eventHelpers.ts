import { randomBytes, createHash } from 'node:crypto';
import { getPool } from '../db/client.js';
import {
  mapEventHelperInvitationRow,
  mapEventHelperGrantRow,
  type EventHelperInvitationRow,
  type EventHelperGrantRow,
} from '../db/row-mappers.js';
import type { EventHelperInvitation, EventHelperGrant } from '../types/domain.js';

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function generateHumanCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

export async function createEventInvitation(
  eventId: string,
  actorSub: string,
  maxCap: number = 10,
): Promise<{ invitation: EventHelperInvitation; rawSecret: string; humanCode: string }> {
  if (maxCap < 1 || maxCap > 50) {
    throw new Error('Invitation capacity must be between 1 and 50');
  }

  const rawSecret = randomBytes(32).toString('hex');
  const secretHash = hashSecret(rawSecret);
  const humanCode = generateHumanCode();

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const eventRes = await client.query('SELECT status FROM events WHERE id = $1', [eventId]);
    if (eventRes.rows.length === 0) {
      throw new Error('Event not found');
    }
    const eventStatus = eventRes.rows[0].status;
    if (eventStatus === 'completed' || eventStatus === 'cancelled') {
      throw new Error('Cannot create invitation for completed or cancelled event');
    }

    const insertRes = await client.query<EventHelperInvitationRow>(
      `INSERT INTO event_helper_invitations (event_id, secret_hash, human_code, max_cap, status, created_by)
       VALUES ($1, $2, $3, $4, 'active', $5)
       RETURNING id, event_id, secret_hash, human_code, max_cap, status, created_by, created_at, updated_at`,
      [eventId, secretHash, humanCode, maxCap, actorSub],
    );

    const invitation = mapEventHelperInvitationRow(insertRes.rows[0]);

    await client.query(
      `INSERT INTO event_helper_audit_logs (event_id, invitation_id, action, actor_sub, details)
       VALUES ($1, $2, 'create_invitation', $3, $4)`,
      [eventId, invitation.id, actorSub, JSON.stringify({ maxCap, humanCode })],
    );

    await client.query('COMMIT');
    return { invitation, rawSecret, humanCode };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function rotateEventInvitation(
  eventId: string,
  invitationId: string,
  actorSub: string,
): Promise<{ invitation: EventHelperInvitation; rawSecret: string; humanCode: string }> {
  const rawSecret = randomBytes(32).toString('hex');
  const secretHash = hashSecret(rawSecret);
  const humanCode = generateHumanCode();

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const updateRes = await client.query<EventHelperInvitationRow>(
      `UPDATE event_helper_invitations
       SET secret_hash = $1, human_code = $2, updated_at = now()
       WHERE id = $3 AND event_id = $4 AND status = 'active'
       RETURNING id, event_id, secret_hash, human_code, max_cap, status, created_by, created_at, updated_at`,
      [secretHash, humanCode, invitationId, eventId],
    );

    if (updateRes.rows.length === 0) {
      throw new Error('Active invitation not found or already closed/revoked');
    }

    const invitation = mapEventHelperInvitationRow(updateRes.rows[0]);

    await client.query(
      `INSERT INTO event_helper_audit_logs (event_id, invitation_id, action, actor_sub, details)
       VALUES ($1, $2, 'rotate_invitation', $3, $4)`,
      [eventId, invitationId, actorSub, JSON.stringify({ humanCode })],
    );

    await client.query('COMMIT');
    return { invitation, rawSecret, humanCode };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateInvitationStatus(
  eventId: string,
  invitationId: string,
  status: 'closed' | 'revoked' | 'active',
  actorSub: string,
): Promise<EventHelperInvitation> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const updateRes = await client.query<EventHelperInvitationRow>(
      `UPDATE event_helper_invitations
       SET status = $1, updated_at = now()
       WHERE id = $2 AND event_id = $3
       RETURNING id, event_id, secret_hash, human_code, max_cap, status, created_by, created_at, updated_at`,
      [status, invitationId, eventId],
    );

    if (updateRes.rows.length === 0) {
      throw new Error('Invitation not found');
    }

    const invitation = mapEventHelperInvitationRow(updateRes.rows[0]);

    await client.query(
      `INSERT INTO event_helper_audit_logs (event_id, invitation_id, action, actor_sub, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [eventId, invitationId, `${status}_invitation`, actorSub, JSON.stringify({ status })],
    );

    await client.query('COMMIT');
    return invitation;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeIndividualGrant(
  eventId: string,
  grantId: string,
  actorSub: string,
): Promise<EventHelperGrant> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const updateRes = await client.query<EventHelperGrantRow>(
      `UPDATE event_helper_grants
       SET status = 'revoked'
       WHERE id = $1 AND event_id = $2
       RETURNING id, invitation_id, event_id, auth0_sub, status, redeemed_at`,
      [grantId, eventId],
    );

    if (updateRes.rows.length === 0) {
      throw new Error('Grant not found');
    }

    const grant = mapEventHelperGrantRow(updateRes.rows[0]);

    await client.query(
      `INSERT INTO event_helper_audit_logs (event_id, invitation_id, action, actor_sub, details)
       VALUES ($1, $2, 'revoke_grant', $3, $4)`,
      [eventId, grant.invitationId, actorSub, JSON.stringify({ grantId, targetSub: grant.auth0Sub })],
    );

    await client.query('COMMIT');
    return grant;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function redeemInvitation(
  credential: { secret?: string; humanCode?: string },
  auth0Sub: string,
): Promise<{ grant: EventHelperGrant; eventId: string }> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let invitationRes;
    if (credential.secret) {
      const secretHash = hashSecret(credential.secret);
      invitationRes = await client.query<EventHelperInvitationRow>(
        `SELECT id, event_id, secret_hash, human_code, max_cap, status, created_by, created_at, updated_at
         FROM event_helper_invitations
         WHERE secret_hash = $1 AND status = 'active'`,
        [secretHash],
      );
    } else if (credential.humanCode) {
      invitationRes = await client.query<EventHelperInvitationRow>(
        `SELECT id, event_id, secret_hash, human_code, max_cap, status, created_by, created_at, updated_at
         FROM event_helper_invitations
         WHERE human_code = $1 AND status = 'active'`,
        [credential.humanCode.toUpperCase().trim()],
      );
    } else {
      throw new Error('Provide a valid invitation secret or human code');
    }

    if (invitationRes.rows.length === 0) {
      throw new Error('Invalid or inactive invitation code/secret');
    }

    const inv = mapEventHelperInvitationRow(invitationRes.rows[0]);
    const eventId = inv.eventId;

    const eventRes = await client.query('SELECT status, updated_at FROM events WHERE id = $1', [eventId]);
    if (eventRes.rows.length === 0) {
      throw new Error('Event not found');
    }
    const event = eventRes.rows[0];
    if (event.status === 'cancelled' || event.status === 'completed') {
      const updatedAt = new Date(event.updated_at).getTime();
      const now = Date.now();
      const twoHoursMs = 2 * 60 * 60 * 1000;
      if (now - updatedAt > twoHoursMs) {
        throw new Error('Event access expired (past 2-hour read-only window)');
      }
      throw new Error('New helper redemption is closed for completed or cancelled events');
    }

    const existingGrantRes = await client.query<EventHelperGrantRow>(
      `SELECT id, invitation_id, event_id, auth0_sub, status, redeemed_at
       FROM event_helper_grants
       WHERE event_id = $1 AND auth0_sub = $2`,
      [eventId, auth0Sub],
    );

    if (existingGrantRes.rows.length > 0) {
      const grant = mapEventHelperGrantRow(existingGrantRes.rows[0]);
      if (grant.status === 'revoked') {
        throw new Error('Helper grant has been revoked');
      }
      await client.query('COMMIT');
      return { grant, eventId };
    }

    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`event_helper:${eventId}`]);

    const activeCountRes = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM event_helper_grants WHERE event_id = $1 AND status = 'active'`,
      [eventId],
    );
    const activeCount = parseInt(activeCountRes.rows[0].count, 10);

    if (activeCount >= inv.maxCap) {
      throw new Error('Invitation distinct-account capacity reached');
    }

    const insertGrantRes = await client.query<EventHelperGrantRow>(
      `INSERT INTO event_helper_grants (invitation_id, event_id, auth0_sub, status, redeemed_at)
       VALUES ($1, $2, $3, 'active', now())
       RETURNING id, invitation_id, event_id, auth0_sub, status, redeemed_at`,
      [inv.id, eventId, auth0Sub],
    );

    const grant = mapEventHelperGrantRow(insertGrantRes.rows[0]);

    await client.query(
      `INSERT INTO event_helper_audit_logs (event_id, invitation_id, action, actor_sub, details)
       VALUES ($1, $2, 'redeem_invitation', $3, $4)`,
      [eventId, inv.id, auth0Sub, JSON.stringify({ grantId: grant.id })],
    );

    await client.query('COMMIT');
    return { grant, eventId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listEventInvitations(eventId: string): Promise<EventHelperInvitation[]> {
  const pool = getPool();
  const res = await pool.query<EventHelperInvitationRow>(
    `SELECT id, event_id, secret_hash, human_code, max_cap, status, created_by, created_at, updated_at
     FROM event_helper_invitations
     WHERE event_id = $1
     ORDER BY created_at DESC`,
    [eventId],
  );
  return res.rows.map(mapEventHelperInvitationRow);
}

export async function listEventGrants(eventId: string): Promise<EventHelperGrant[]> {
  const pool = getPool();
  const res = await pool.query<EventHelperGrantRow>(
    `SELECT id, invitation_id, event_id, auth0_sub, status, redeemed_at
     FROM event_helper_grants
     WHERE event_id = $1
     ORDER BY redeemed_at DESC`,
    [eventId],
  );
  return res.rows.map(mapEventHelperGrantRow);
}
