import { createHash, randomBytes } from 'node:crypto';
import { getPool, type DbExecutor } from '../db/client.js';
import { mapEventParticipantSummaryRow, mapEventRow, mapResultRow, mapTimelineEntryRow, type EventParticipantSummaryRow, type EventRow } from '../db/row-mappers.js';
import { withTransaction } from '../db/transaction.js';
import { ApiError } from '../middleware/errors.js';
import type { AthleticsEvent, EventParticipantSummary, Result, TimelineEntry } from '../types/domain.js';
import { isCanonicalUuid } from '../validation/primitives.js';
import type { FixtureInvitationCreatePayload, FixtureInvitationResponsePayload } from '../validation/payloads.js';

const EVENT_COLUMNS = 'e.id, e.created_by, e.type, e.discipline, e.title, e.date, e.time, e.location_name, e.latitude, e.longitude, e.status, e.created_at, e.updated_at';
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

type FixtureInvitationStatus = 'pending' | 'accepted' | 'declined' | 'change_requested' | 'revoked';
type FixtureWorkspaceStatus = 'accepted' | 'reacceptance_required' | 'withdrawn';

export interface FixtureInvitation {
  id: string;
  eventId: string;
  email: string;
  revision: number;
  status: FixtureInvitationStatus;
  expiresAt: string;
  createdAt: string;
  targetWorkspaceId: string | null;
  responseMessage: string | null;
  respondedAt: string | null;
  token?: string;
}

export interface FixtureTeam {
  workspaceId: string;
  workspaceName: string;
  status: FixtureWorkspaceStatus;
  acceptedRevision: number;
  withdrawnAt: string | null;
}

export interface FixtureDetail {
  event: AthleticsEvent;
  revision: number;
  teamStatus: FixtureWorkspaceStatus;
  teams: FixtureTeam[];
}

export interface FixtureTeamRoster {
  team: FixtureTeam;
  participants: EventParticipantSummary[];
}

export interface IncomingFixtureInvitation extends FixtureInvitation {
  event: AthleticsEvent;
}

function notFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'Resource not found');
}

function unavailable(): ApiError {
  return new ApiError(410, 'INVITATION_UNAVAILABLE', 'Invitation is expired, revoked, or no longer available');
}

function fixtureHostOnly(): ApiError {
  return new ApiError(403, 'FIXTURE_HOST_ONLY', 'Only the host workspace can perform this action');
}

function scopedIds(workspaceId: string, ...ids: unknown[]): string[] {
  if (!isCanonicalUuid(workspaceId) || !ids.every(isCanonicalUuid)) throw notFound();
  return ids as string[];
}

function timestamp(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export async function assertHostWorkspace(
  client: DbExecutor,
  eventId: string,
  workspaceId: string,
): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM event_fixture_workspaces
     WHERE event_id = $1 AND workspace_id = $2 AND role = 'host'`,
    [eventId, workspaceId],
  );
  if (result.rows.length === 0) throw fixtureHostOnly();
}


function invitation(row: {
  id: string;
  event_id: string;
  email: string;
  revision: number;
  status: FixtureInvitationStatus;
  expires_at: Date | string;
  created_at: Date | string;
  target_workspace_id: string | null;
  response_message: string | null;
  responded_at: Date | string | null;
}): FixtureInvitation {
  return {
    id: row.id,
    eventId: row.event_id,
    email: row.email,
    revision: row.revision,
    status: row.status,
    expiresAt: timestamp(row.expires_at)!,
    createdAt: timestamp(row.created_at)!,
    targetWorkspaceId: row.target_workspace_id,
    responseMessage: row.response_message,
    respondedAt: timestamp(row.responded_at),
  };
}

async function lockHostedFixture(
  client: DbExecutor,
  workspaceId: string,
  eventId: string,
): Promise<{ type: string; discipline: string | null; status: string; fixture_revision: number }> {
  const result = await client.query<{ type: string; discipline: string | null; status: string; fixture_revision: number }>(
    `SELECT type, discipline, status, fixture_revision
     FROM events
     WHERE id = $1 AND workspace_id = $2
     FOR UPDATE`,
    [eventId, workspaceId],
  );
  const event = result.rows[0];
  if (!event) throw notFound();
  return event;
}

function assertFixtureCanBeScheduled(event: { type: string; discipline: string | null; status: string }): void {
  if (event.type !== 'competition' || event.discipline !== '100m') {
    throw new ApiError(409, 'FIXTURE_EVENT_INELIGIBLE', 'Only 100m competition events can host fixtures');
  }
  if (event.status !== 'scheduled') {
    throw new ApiError(409, 'FIXTURE_EVENT_LOCKED', 'Fixture teams can only change before the event starts');
  }
}

async function createInvitationRecord(
  client: DbExecutor,
  eventId: string,
  email: string,
  revision: number,
  actorId: string,
  expiresInDays: number,
  targetWorkspaceId: string | null = null,
): Promise<FixtureInvitation & { token: string }> {
  const token = randomBytes(32).toString('base64url');
  const result = await client.query<{
    id: string; event_id: string; email: string; revision: number; status: FixtureInvitationStatus;
    expires_at: Date | string; created_at: Date | string; target_workspace_id: string | null;
    response_message: string | null; responded_at: Date | string | null;
  }>(
    `INSERT INTO fixture_invitations
       (event_id, target_workspace_id, email, revision, token_hash, invited_by, expires_at)
     VALUES ($1, $2, lower($3), $4, $5, $6, now() + ($7 * interval '1 day'))
     RETURNING id, event_id, email, revision, status, expires_at, created_at, target_workspace_id,
               NULL::text AS response_message, NULL::timestamptz AS responded_at`,
    [eventId, targetWorkspaceId, email, revision, hashToken(token), actorId, expiresInDays],
  );
  return { ...invitation(result.rows[0]), token };
}

async function createReacceptanceInvitations(
  client: DbExecutor,
  eventId: string,
  revision: number,
  actorId: string,
  excludedWorkspaceId: string | null = null,
): Promise<void> {
  const teams = await client.query<{ workspace_id: string; contact_email: string; status: FixtureWorkspaceStatus }>(
    `SELECT workspace_id, contact_email
     FROM event_fixture_workspaces
     WHERE event_id = $1 AND role = 'guest' AND status IN ('accepted', 'reacceptance_required')
       AND ($2::uuid IS NULL OR workspace_id <> $2::uuid)
     FOR UPDATE`,
    [eventId, excludedWorkspaceId],
  );
  for (const team of teams.rows) {
    await client.query(
      `UPDATE fixture_invitations
       SET status = 'revoked', revoked_at = now(), revoked_by = $3
       WHERE event_id = $1 AND target_workspace_id = $2 AND status IN ('pending', 'change_requested')`,
      [eventId, team.workspace_id, actorId],
    );
    await client.query(
      `UPDATE event_fixture_workspaces
       SET status = 'reacceptance_required'
       WHERE event_id = $1 AND workspace_id = $2`,
      [eventId, team.workspace_id],
    );
    await createInvitationRecord(client, eventId, team.contact_email, revision, actorId, 7, team.workspace_id);
  }
}

async function advanceFixtureRevision(
  client: DbExecutor,
  eventId: string,
  actorId: string,
  excludedWorkspaceId: string | null = null,
): Promise<number> {
  const updated = await client.query<{ fixture_revision: number }>(
    `UPDATE events SET fixture_revision = fixture_revision + 1, updated_at = now()
     WHERE id = $1
     RETURNING fixture_revision`,
    [eventId],
  );
  const revision = updated.rows[0]?.fixture_revision;
  if (!revision) throw notFound();
  await createReacceptanceInvitations(client, eventId, revision, actorId, excludedWorkspaceId);
  return revision;
}

export async function createFixtureInvitation(
  workspaceId: string,
  actorId: string,
  eventId: unknown,
  payload: FixtureInvitationCreatePayload,
): Promise<FixtureInvitation & { token: string }> {
  const [, ownedEventId] = scopedIds(workspaceId, actorId, eventId);
  return withTransaction(async (client) => {
    const event = await lockHostedFixture(client, workspaceId, ownedEventId);
    assertFixtureCanBeScheduled(event);
    const duplicate = await client.query(
      `SELECT 1 FROM fixture_invitations
       WHERE event_id = $1 AND lower(email) = lower($2)
         AND status IN ('pending', 'change_requested') AND expires_at > now()
       LIMIT 1`,
      [ownedEventId, payload.email],
    );
    if (duplicate.rows.length > 0) {
      throw new ApiError(409, 'FIXTURE_INVITATION_EXISTS', 'An active invitation already exists for this email');
    }
    return createInvitationRecord(client, ownedEventId, payload.email, event.fixture_revision, actorId, payload.expiresInDays);
  });
}

export async function listFixtureInvitations(
  workspaceId: string,
  eventId: unknown,
  executor: DbExecutor = getPool(),
): Promise<FixtureInvitation[]> {
  const [ownedEventId] = scopedIds(workspaceId, eventId);
  const result = await executor.query<{
    id: string; event_id: string; email: string; revision: number; status: FixtureInvitationStatus;
    expires_at: Date | string; created_at: Date | string; target_workspace_id: string | null;
    response_message: string | null; responded_at: Date | string | null;
  }>(
    `SELECT i.id, i.event_id, i.email, i.revision, i.status, i.expires_at, i.created_at, i.target_workspace_id,
            response.message AS response_message, response.created_at AS responded_at
     FROM fixture_invitations i
     JOIN events e ON e.id = i.event_id AND e.workspace_id = $2
     LEFT JOIN LATERAL (
       SELECT message, created_at FROM fixture_invitation_responses
       WHERE invitation_id = i.id ORDER BY created_at DESC, id DESC LIMIT 1
     ) response ON true
     WHERE i.event_id = $1
     ORDER BY i.created_at DESC, i.id DESC`,
    [ownedEventId, workspaceId],
  );
  return result.rows.map(invitation);
}

export async function resendFixtureInvitation(
  workspaceId: string,
  actorId: string,
  eventId: unknown,
  invitationId: unknown,
): Promise<FixtureInvitation & { token: string }> {
  const [, ownedEventId, ownedInvitationId] = scopedIds(workspaceId, actorId, eventId, invitationId);
  return withTransaction(async (client) => {
    const event = await lockHostedFixture(client, workspaceId, ownedEventId);
    assertFixtureCanBeScheduled(event);
    const existing = await client.query<{ email: string; revision: number; target_workspace_id: string | null }>(
      `SELECT email, revision, target_workspace_id FROM fixture_invitations
       WHERE id = $1 AND event_id = $2 AND status IN ('pending', 'declined', 'change_requested')
       FOR UPDATE`,
      [ownedInvitationId, ownedEventId],
    );
    const current = existing.rows[0];
    if (!current) throw notFound();
    await client.query(
      `UPDATE fixture_invitations
       SET status = 'revoked', revoked_at = now(), revoked_by = $2
       WHERE id = $1`,
      [ownedInvitationId, actorId],
    );
    return createInvitationRecord(
      client,
      ownedEventId,
      current.email,
      event.fixture_revision,
      actorId,
      7,
      current.target_workspace_id,
    );
  });
}

export async function revokeFixtureInvitation(
  workspaceId: string,
  actorId: string,
  eventId: unknown,
  invitationId: unknown,
): Promise<void> {
  const [, ownedEventId, ownedInvitationId] = scopedIds(workspaceId, actorId, eventId, invitationId);
  const result = await getPool().query(
    `UPDATE fixture_invitations i
     SET status = 'revoked', revoked_at = now(), revoked_by = $3
     FROM events e
     WHERE i.id = $1 AND i.event_id = $2 AND e.id = i.event_id AND e.workspace_id = $4
       AND i.status IN ('pending', 'declined', 'change_requested')
     RETURNING i.id`,
    [ownedInvitationId, ownedEventId, actorId, workspaceId],
  );
  if (result.rows.length === 0) throw notFound();
}

async function respondToFixtureInvitationWhere(
  workspaceId: string,
  actorId: string,
  invitationValue: string,
  invitationCondition: string,
  payload: FixtureInvitationResponsePayload,
): Promise<FixtureInvitation> {
  return withTransaction(async (client) => {
    const result = await client.query<{
      id: string; event_id: string; email: string; revision: number; status: FixtureInvitationStatus;
      expires_at: Date | string; created_at: Date | string; target_workspace_id: string | null;
      type: string; discipline: string | null; event_status: string; fixture_revision: number; user_email: string;
    }>(
      `SELECT i.id, i.event_id, i.email, i.revision, i.status, i.expires_at, i.created_at, i.target_workspace_id,
              e.type, e.discipline, e.status AS event_status, e.fixture_revision, u.email AS user_email
       FROM fixture_invitations i
       JOIN events e ON e.id = i.event_id
       JOIN users u ON u.id = $2
        WHERE ${invitationCondition} AND i.status IN ('pending', 'change_requested')
         AND i.expires_at > now()
       FOR UPDATE OF i, e`,
      [invitationValue, actorId],
    );
    const current = result.rows[0];
    if (!current || current.user_email.toLowerCase() !== current.email.toLowerCase()) throw unavailable();
    if (current.target_workspace_id !== null && current.target_workspace_id !== workspaceId) throw notFound();

    if (payload.response === 'accepted') {
      assertFixtureCanBeScheduled({ type: current.type, discipline: current.discipline, status: current.event_status });
      const host = await client.query('SELECT 1 FROM event_fixture_workspaces WHERE event_id = $1 AND workspace_id = $2 AND role = $3', [current.event_id, workspaceId, 'host']);
      if (host.rows.length > 0) throw new ApiError(409, 'FIXTURE_HOST_CANNOT_ACCEPT', 'The hosting workspace cannot accept its own invitation');
      const team = await client.query<{ status: FixtureWorkspaceStatus }>(
        `SELECT status FROM event_fixture_workspaces
         WHERE event_id = $1 AND workspace_id = $2 AND role = 'guest'
         FOR UPDATE`,
        [current.event_id, workspaceId],
      );
      let acceptedRevision = current.fixture_revision;
      if (team.rows[0]) {
        if (team.rows[0].status === 'withdrawn') throw unavailable();
      } else {
        acceptedRevision = await advanceFixtureRevision(client, current.event_id, actorId, workspaceId);
        await client.query(
          `INSERT INTO event_fixture_workspaces
             (event_id, workspace_id, role, status, accepted_revision, contact_email, joined_by)
           VALUES ($1, $2, 'guest', 'accepted', $3, lower($4), $5)`,
          [current.event_id, workspaceId, acceptedRevision, current.email, actorId],
        );
      }
      await client.query(
        `UPDATE event_fixture_workspaces
         SET status = 'accepted', accepted_revision = $3, joined_by = $4, joined_at = now()
         WHERE event_id = $1 AND workspace_id = $2`,
        [current.event_id, workspaceId, acceptedRevision, actorId],
      );
      await client.query(
        `UPDATE fixture_invitations SET status = 'accepted', accepted_at = now(), accepted_by = $2 WHERE id = $1`,
        [current.id, actorId],
      );
      await client.query(
        `INSERT INTO fixture_invitation_responses (invitation_id, revision, workspace_id, response, responded_by)
         VALUES ($1, $2, $3, 'accepted', $4)`,
        [current.id, acceptedRevision, workspaceId, actorId],
      );
    } else {
      await client.query(`UPDATE fixture_invitations SET status = $2 WHERE id = $1`, [current.id, payload.response]);
      await client.query(
        `INSERT INTO fixture_invitation_responses (invitation_id, revision, workspace_id, response, message, responded_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [current.id, current.fixture_revision, workspaceId, payload.response, payload.message, actorId],
      );
    }
    const updated = await client.query<{
      id: string; event_id: string; email: string; revision: number; status: FixtureInvitationStatus;
      expires_at: Date | string; created_at: Date | string; target_workspace_id: string | null;
      response_message: string | null; responded_at: Date | string | null;
    }>(
      `SELECT i.id, i.event_id, i.email, i.revision, i.status, i.expires_at, i.created_at, i.target_workspace_id,
              response.message AS response_message, response.created_at AS responded_at
       FROM fixture_invitations i
       LEFT JOIN LATERAL (
         SELECT message, created_at FROM fixture_invitation_responses
         WHERE invitation_id = i.id ORDER BY created_at DESC, id DESC LIMIT 1
       ) response ON true
       WHERE i.id = $1`,
      [current.id],
    );
    return invitation(updated.rows[0]);
  });
}

export async function respondToFixtureInvitation(
  workspaceId: string,
  actorId: string,
  token: unknown,
  payload: FixtureInvitationResponsePayload,
): Promise<FixtureInvitation> {
  if (!isCanonicalUuid(workspaceId) || !isCanonicalUuid(actorId) || typeof token !== 'string' || token.length < 20) throw notFound();
  return respondToFixtureInvitationWhere(workspaceId, actorId, hashToken(token), 'i.token_hash = $1', payload);
}

export async function respondToIncomingFixtureInvitation(
  workspaceId: string,
  actorId: string,
  invitationId: unknown,
  payload: FixtureInvitationResponsePayload,
): Promise<FixtureInvitation> {
  if (!isCanonicalUuid(workspaceId) || !isCanonicalUuid(actorId) || !isCanonicalUuid(invitationId)) throw notFound();
  return respondToFixtureInvitationWhere(workspaceId, actorId, invitationId, 'i.id = $1', payload);
}

export async function listIncomingFixtureInvitations(
  actorId: string,
  executor: DbExecutor = getPool(),
): Promise<IncomingFixtureInvitation[]> {
  if (!isCanonicalUuid(actorId)) throw notFound();
  const result = await executor.query<{
    invitation_id: string; event_id: string; email: string; revision: number; status: FixtureInvitationStatus;
    expires_at: Date | string; created_at: Date | string; target_workspace_id: string | null;
    response_message: string | null; responded_at: Date | string | null;
  } & EventRow>(
    `SELECT i.id AS invitation_id, i.event_id, i.email, i.revision, i.status, i.expires_at, i.created_at, i.target_workspace_id,
            NULL::text AS response_message, NULL::timestamptz AS responded_at, ${EVENT_COLUMNS}
     FROM fixture_invitations i
     JOIN events e ON e.id = i.event_id
     JOIN users u ON u.id = $1
     WHERE lower(i.email) = lower(u.email)
       AND i.status IN ('pending', 'change_requested')
       AND i.expires_at > now()
     ORDER BY e.date ASC, e.time ASC NULLS LAST, i.created_at DESC`,
    [actorId],
  );
  return result.rows.map((row) => ({ ...invitation({ ...row, id: row.invitation_id }), event: mapEventRow(row) }));
}

export async function markFixtureReacceptanceRequired(
  client: DbExecutor,
  eventId: string,
  actorId: string,
): Promise<void> {
  const teams = await client.query<{ workspace_id: string }>(
    `SELECT workspace_id FROM event_fixture_workspaces
     WHERE event_id = $1 AND role = 'guest' AND status <> 'withdrawn'
     FOR UPDATE`,
    [eventId],
  );
  if (teams.rows.length > 0) await advanceFixtureRevision(client, eventId, actorId);
}

export async function assertFixtureReadyToStart(
  client: DbExecutor,
  eventId: string,
): Promise<void> {
  const pending = await client.query(
    `SELECT 1 FROM event_fixture_workspaces fw
     JOIN events e ON e.id = fw.event_id
     WHERE fw.event_id = $1 AND fw.role = 'guest' AND fw.status <> 'withdrawn'
       AND (fw.status <> 'accepted' OR fw.accepted_revision <> e.fixture_revision)
     LIMIT 1`,
    [eventId],
  );
  if (pending.rows.length > 0) {
    throw new ApiError(409, 'FIXTURE_REACCEPTANCE_REQUIRED', 'Every participating team must accept the current fixture details before it starts');
  }
}

async function guestFixtureEvent(
  executor: DbExecutor,
  workspaceId: string,
  eventId: string,
): Promise<{ event: AthleticsEvent; revision: number; teamStatus: FixtureWorkspaceStatus }> {
  const result = await executor.query<EventRow & { fixture_revision: number; fixture_status: FixtureWorkspaceStatus }>(
    `SELECT ${EVENT_COLUMNS}, e.fixture_revision, fw.status AS fixture_status
     FROM events e
     JOIN event_fixture_workspaces fw ON fw.event_id = e.id AND fw.workspace_id = $2 AND fw.role = 'guest'
     WHERE e.id = $1`,
    [eventId, workspaceId],
  );
  const row = result.rows[0];
  if (!row) throw notFound();
  return { event: mapEventRow(row), revision: row.fixture_revision, teamStatus: row.fixture_status };
}

async function fixtureTeams(executor: DbExecutor, eventId: string): Promise<FixtureTeam[]> {
  const result = await executor.query<{
    workspace_id: string; workspace_name: string; status: FixtureWorkspaceStatus;
    accepted_revision: number; withdrawn_at: Date | string | null;
  }>(
    `SELECT fw.workspace_id, w.name AS workspace_name, fw.status, fw.accepted_revision, fw.withdrawn_at
     FROM event_fixture_workspaces fw JOIN workspaces w ON w.id = fw.workspace_id
     WHERE fw.event_id = $1 ORDER BY CASE fw.role WHEN 'host' THEN 0 ELSE 1 END, lower(w.name), w.id`,
    [eventId],
  );
  return result.rows.map((row) => ({
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    status: row.status,
    acceptedRevision: row.accepted_revision,
    withdrawnAt: timestamp(row.withdrawn_at),
  }));
}

export async function listHostedFixtureRosters(workspaceId: string, eventId: unknown): Promise<FixtureTeamRoster[]> {
  const [ownedEventId] = scopedIds(workspaceId, eventId);
  const host = await getPool().query(
    'SELECT 1 FROM events WHERE id = $1 AND workspace_id = $2',
    [ownedEventId, workspaceId],
  );
  if (host.rows.length === 0) throw notFound();
  const teams = await fixtureTeams(getPool(), ownedEventId);
  const rows = await getPool().query<EventParticipantSummaryRow & { participant_workspace_id: string }>(
    `SELECT ${PARTICIPANT_COLUMNS}, ep.participant_workspace_id
     FROM event_participants ep JOIN athletes a ON a.id = ep.athlete_id
     WHERE ep.event_id = $1
     ORDER BY lower(a.name), a.id`,
    [ownedEventId],
  );
  const byWorkspace = new Map<string, EventParticipantSummary[]>();
  for (const row of rows.rows) {
    const entries = byWorkspace.get(row.participant_workspace_id) ?? [];
    entries.push(mapEventParticipantSummaryRow(row));
    byWorkspace.set(row.participant_workspace_id, entries);
  }
  return teams.map((team) => ({ team, participants: byWorkspace.get(team.workspaceId) ?? [] }));
}

export async function listGuestFixtures(
  workspaceId: string,
  executor: DbExecutor = getPool(),
): Promise<FixtureDetail[]> {
  if (!isCanonicalUuid(workspaceId)) throw notFound();
  const result = await executor.query<EventRow & { fixture_revision: number; fixture_status: FixtureWorkspaceStatus }>(
    `SELECT ${EVENT_COLUMNS}, e.fixture_revision, fw.status AS fixture_status
     FROM events e
     JOIN event_fixture_workspaces fw ON fw.event_id = e.id AND fw.workspace_id = $1 AND fw.role = 'guest'
     ORDER BY e.date, e.time NULLS LAST, e.id`,
    [workspaceId],
  );
  return Promise.all(result.rows.map(async (row) => ({
    event: mapEventRow(row), revision: row.fixture_revision, teamStatus: row.fixture_status,
    teams: await fixtureTeams(executor, row.id),
  })));
}

export async function getGuestFixture(workspaceId: string, eventId: unknown): Promise<FixtureDetail> {
  const [ownedEventId] = scopedIds(workspaceId, eventId);
  const detail = await guestFixtureEvent(getPool(), workspaceId, ownedEventId);
  return { ...detail, teams: await fixtureTeams(getPool(), ownedEventId) };
}

const PARTICIPANT_COLUMNS = `ep.event_id, ep.athlete_id, ep.rsvp_status,
  a.name AS athlete_name,
  COALESCE((SELECT array_agg(s.name ORDER BY lower(s.name), s.id) FROM athlete_squads axs JOIN squads s ON s.id = axs.squad_id WHERE axs.athlete_id = a.id), ARRAY[]::text[]) AS athlete_squad_names,
  a.archived_at AS athlete_archived_at, a.lifecycle_status AS athlete_lifecycle_status,
  false AS status_review_required`;

async function assertGuestRosterOpen(client: DbExecutor, workspaceId: string, eventId: string): Promise<void> {
  const result = await client.query<{ status: string; fixture_revision: number; accepted_revision: number; fixture_status: FixtureWorkspaceStatus }>(
    `SELECT e.status, e.fixture_revision, fw.accepted_revision, fw.status AS fixture_status
     FROM events e JOIN event_fixture_workspaces fw ON fw.event_id = e.id
     WHERE e.id = $1 AND fw.workspace_id = $2 AND fw.role = 'guest'
     FOR UPDATE OF e, fw`,
    [eventId, workspaceId],
  );
  const fixture = result.rows[0];
  if (!fixture) throw notFound();
  if (fixture.status !== 'scheduled' || fixture.fixture_status !== 'accepted' || fixture.accepted_revision !== fixture.fixture_revision) {
    throw new ApiError(409, 'FIXTURE_ROSTER_LOCKED', 'Roster changes require an accepted scheduled fixture');
  }
}

export async function listGuestFixtureParticipants(workspaceId: string, eventId: unknown): Promise<EventParticipantSummary[]> {
  const [ownedEventId] = scopedIds(workspaceId, eventId);
  await guestFixtureEvent(getPool(), workspaceId, ownedEventId);
  const result = await getPool().query<EventParticipantSummaryRow>(
    `SELECT ${PARTICIPANT_COLUMNS}
     FROM event_participants ep JOIN athletes a ON a.id = ep.athlete_id
     WHERE ep.event_id = $1 AND ep.participant_workspace_id = $2
     ORDER BY lower(a.name), a.id`,
    [ownedEventId, workspaceId],
  );
  return result.rows.map(mapEventParticipantSummaryRow);
}

export async function listGuestFixtureResults(workspaceId: string, eventId: unknown): Promise<Result[]> {
  const [ownedEventId] = scopedIds(workspaceId, eventId);
  await guestFixtureEvent(getPool(), workspaceId, ownedEventId);
  const result = await getPool().query(
    `SELECT r.* FROM results r
     JOIN event_participants ep ON ep.event_id = r.event_id AND ep.athlete_id = r.athlete_id
     WHERE r.event_id = $1 AND r.discipline = '100m' AND ep.participant_workspace_id = $2
     ORDER BY r.athlete_id`,
    [ownedEventId, workspaceId],
  );
  return result.rows.map(mapResultRow);
}

export async function addGuestFixtureParticipant(workspaceId: string, eventId: unknown, athleteId: unknown): Promise<EventParticipantSummary> {
  const [ownedEventId, ownedAthleteId] = scopedIds(workspaceId, eventId, athleteId);
  return withTransaction(async (client) => {
    await assertGuestRosterOpen(client, workspaceId, ownedEventId);
    const athlete = await client.query<{ archived_at: Date | string | null; lifecycle_status: string }>(
      `SELECT archived_at, lifecycle_status FROM athletes
       WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
      [ownedAthleteId, workspaceId],
    );
    const row = athlete.rows[0];
    if (!row) throw notFound();
    if (row.archived_at !== null) throw new ApiError(409, 'ATHLETE_ARCHIVED', 'Archived athletes cannot be assigned to events');
    if (row.lifecycle_status !== 'active') throw new ApiError(409, 'ATHLETE_INACTIVE', 'Inactive athletes cannot be assigned to events');
    try {
      await client.query(
        `INSERT INTO event_participants (event_id, athlete_id, participant_workspace_id) VALUES ($1, $2, $3)`,
        [ownedEventId, ownedAthleteId, workspaceId],
      );
    } catch (error: unknown) {
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(409, 'PARTICIPANT_ALREADY_ASSIGNED', 'Athlete is already assigned to this event');
      }
      throw error;
    }
    const participant = await client.query<EventParticipantSummaryRow>(
      `SELECT ${PARTICIPANT_COLUMNS} FROM event_participants ep JOIN athletes a ON a.id = ep.athlete_id
       WHERE ep.event_id = $1 AND ep.athlete_id = $2 AND ep.participant_workspace_id = $3`,
      [ownedEventId, ownedAthleteId, workspaceId],
    );
    return mapEventParticipantSummaryRow(participant.rows[0]);
  });
}

export async function updateGuestFixtureParticipant(workspaceId: string, eventId: unknown, athleteId: unknown, rsvpStatus: string): Promise<EventParticipantSummary> {
  const [ownedEventId, ownedAthleteId] = scopedIds(workspaceId, eventId, athleteId);
  return withTransaction(async (client) => {
    await assertGuestRosterOpen(client, workspaceId, ownedEventId);
    const result = await client.query<EventParticipantSummaryRow>(
      `UPDATE event_participants ep SET rsvp_status = $1
       FROM athletes a WHERE ep.event_id = $2 AND ep.athlete_id = $3
         AND ep.participant_workspace_id = $4 AND a.id = ep.athlete_id
       RETURNING ${PARTICIPANT_COLUMNS}`,
      [rsvpStatus, ownedEventId, ownedAthleteId, workspaceId],
    );
    if (!result.rows[0]) throw notFound();
    return mapEventParticipantSummaryRow(result.rows[0]);
  });
}

export async function removeGuestFixtureParticipant(workspaceId: string, eventId: unknown, athleteId: unknown): Promise<void> {
  const [ownedEventId, ownedAthleteId] = scopedIds(workspaceId, eventId, athleteId);
  await withTransaction(async (client) => {
    await assertGuestRosterOpen(client, workspaceId, ownedEventId);
    const result = await client.query(
      `DELETE FROM event_participants WHERE event_id = $1 AND athlete_id = $2 AND participant_workspace_id = $3 RETURNING event_id`,
      [ownedEventId, ownedAthleteId, workspaceId],
    );
    if (result.rows.length === 0) throw notFound();
  });
}

export async function withdrawGuestFixture(workspaceId: string, actorId: string, eventId: unknown): Promise<void> {
  const [, ownedEventId] = scopedIds(workspaceId, actorId, eventId);
  await withTransaction(async (client) => {
    const event = await client.query<{ status: string }>(
      `SELECT e.status FROM events e JOIN event_fixture_workspaces fw ON fw.event_id = e.id
       WHERE e.id = $1 AND fw.workspace_id = $2 AND fw.role = 'guest' FOR UPDATE OF e, fw`,
      [ownedEventId, workspaceId],
    );
    if (!event.rows[0]) throw notFound();
    if (event.rows[0].status !== 'scheduled') throw new ApiError(409, 'FIXTURE_WITHDRAWAL_HOST_REQUIRED', 'Only the host can record a withdrawal after the fixture starts');
    const changed = await client.query(
      `UPDATE event_fixture_workspaces SET status = 'withdrawn', withdrawn_at = now(), withdrawn_by = $3
       WHERE event_id = $1 AND workspace_id = $2 AND role = 'guest' AND status <> 'withdrawn' RETURNING workspace_id`,
      [ownedEventId, workspaceId, actorId],
    );
    if (!changed.rows[0]) throw notFound();
    await advanceFixtureRevision(client, ownedEventId, actorId, workspaceId);
  });
}

export async function recordFixtureWithdrawal(
  hostWorkspaceId: string,
  actorId: string,
  eventId: unknown,
  guestWorkspaceId: unknown,
): Promise<void> {
  const [, ownedEventId, ownedGuestWorkspaceId] = scopedIds(hostWorkspaceId, actorId, eventId, guestWorkspaceId);
  await withTransaction(async (client) => {
    const event = await lockHostedFixture(client, hostWorkspaceId, ownedEventId);
    if (event.status === 'scheduled') throw new ApiError(409, 'FIXTURE_WITHDRAWAL_GUEST_ALLOWED', 'Guests record withdrawals before the fixture starts');
    const changed = await client.query(
      `UPDATE event_fixture_workspaces SET status = 'withdrawn', withdrawn_at = now(), withdrawn_by = $3
       WHERE event_id = $1 AND workspace_id = $2 AND role = 'guest' AND status <> 'withdrawn' RETURNING workspace_id`,
      [ownedEventId, ownedGuestWorkspaceId, actorId],
    );
    if (!changed.rows[0]) throw notFound();
  });
}

export async function listHostedFixtureEntries(
  workspaceId: string,
  eventId: unknown,
): Promise<TimelineEntry[]> {
  const [ownedEventId] = scopedIds(workspaceId, eventId);
  await assertHostWorkspace(getPool(), ownedEventId, workspaceId);
  const result = await getPool().query(
    `SELECT te.id, te.event_id, te.athlete_id, te.discipline, te.entry_type,
            te.value, te.unit, te.is_foul, te.incident_type, te.note_text,
            te.recorded_by, te.version, te.device_id, te.created_at, te.updated_at, te.deleted_at
     FROM timeline_entries te
     JOIN events e ON e.id = te.event_id
     WHERE te.event_id = $1 AND te.deleted_at IS NULL
     ORDER BY te.created_at ASC, te.id ASC`,
    [ownedEventId],
  );
  return result.rows.map(mapTimelineEntryRow);
}

export async function listHostedFixtureResults(
  workspaceId: string,
  eventId: unknown,
): Promise<Result[]> {
  const [ownedEventId] = scopedIds(workspaceId, eventId);
  await assertHostWorkspace(getPool(), ownedEventId, workspaceId);
  const result = await getPool().query(
    `SELECT r.* FROM results r
     WHERE r.event_id = $1 AND r.discipline = '100m'
     ORDER BY r.placing ASC NULLS LAST, r.athlete_id`,
    [ownedEventId],
  );
  return result.rows.map(mapResultRow);
}

export async function overrideHostFixtureResult(
  hostWorkspaceId: string,
  actorId: string,
  eventId: unknown,
  athleteId: unknown,
  payload: { manualOverride: number | null; overrideReason: string | null },
): Promise<Result> {
  const [, ownedEventId, ownedAthleteId] = scopedIds(hostWorkspaceId, actorId, eventId, athleteId);
  await assertHostWorkspace(getPool(), ownedEventId, hostWorkspaceId);
  const { overrideResultRecord } = await import('../controllers/results.js');
  return overrideResultRecord(actorId, hostWorkspaceId, ownedEventId, ownedAthleteId, payload);
}
