import { describe, expect, it, vi } from 'vitest';
import { assertPublicSessionEntryContent, canMutateSessionEntry, listSessionResults } from './sessionPerformances.js';
import type { MeetActor } from '../types/meets.js';

describe('public session entry restrictions', () => {
  it('rejects private notes from public logger entries', () => {
    let error: unknown;
    try {
      assertPublicSessionEntryContent({
        entryType: 'note', value: null, unit: null, isFoul: false, incidentType: null, noteText: 'Private note', deviceId: null,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ status: 422, code: 'PUBLIC_LOGGER_ENTRY_RESTRICTED' });
  });

  it('allows public discipline observations without a note', () => {
    expect(() => assertPublicSessionEntryContent({
      entryType: 'attempt', value: 6.45, unit: 'metres', isFoul: false, incidentType: null, noteText: null, deviceId: null,
    })).not.toThrow();
  });
});

describe('canMutateSessionEntry recorder-only corrections', () => {
  const HOST_WORKSPACE = '33333333-3333-4333-8333-333333333333';
  const GUEST_WORKSPACE = '66666666-6666-4666-8666-666666666666';
  const event = { id: '11111111-1111-4111-8111-111111111111', workspace_id: HOST_WORKSPACE, type: 'competition' as const, status: 'in_progress' as const };
  const hostAccess = { event, host: true, helper: false };
  const guestAccess = { event, host: false, helper: false };
  const helperAccess = { event, host: false, helper: true };
  const host: MeetActor = { userId: '44444444-4444-4444-8444-444444444444', workspaceId: HOST_WORKSPACE, role: 'coach' };
  const guest: MeetActor = { userId: '55555555-5555-4555-8555-555555555555', workspaceId: GUEST_WORKSPACE, role: 'coach' };
  const sameClubCoach: MeetActor = { userId: '77777777-7777-4777-8777-777777777777', workspaceId: GUEST_WORKSPACE, role: 'coach' };
  const hostAssistant: MeetActor = { userId: '44444444-4444-4444-8444-444444444444', workspaceId: HOST_WORKSPACE, role: 'assistant' };

  it('lets a public logger correct only their own records on the same link', () => {
    const actor: MeetActor = { publicLoggerSessionId: 'session-1', publicLoggerLinkId: 'link-1', publicLoggerName: 'Official', publicLoggerClub: 'Club' };
    const own = { recordedBy: null, publicLoggerSessionId: 'session-1', recorderLinkId: 'link-1', recorderLoggerName: 'official', recorderLoggerClub: 'club' };
    expect(canMutateSessionEntry(actor, { event, host: false, helper: true }, own)).toBe(true);
    expect(canMutateSessionEntry(actor, { event, host: false, helper: true }, { ...own, recorderLoggerName: '  Official ', recorderLoggerClub: ' CLUB ' })).toBe(true);
    expect(canMutateSessionEntry(actor, { event, host: false, helper: true }, { ...own, recorderLinkId: 'link-2' })).toBe(false);
    expect(canMutateSessionEntry(actor, { event, host: false, helper: true }, { ...own, recorderLoggerName: 'Other official' })).toBe(false);
    expect(canMutateSessionEntry(actor, { event, host: false, helper: true }, { ...own, recorderLoggerClub: 'Other club' })).toBe(false);
    expect(canMutateSessionEntry(actor, { event, host: false, helper: true }, { recordedBy: null, publicLoggerSessionId: null, recordedWorkspaceId: GUEST_WORKSPACE })).toBe(false);
  });

  it('gives host coaches an override over every entry', () => {
    const guestEntry = { recordedBy: '55555555-5555-4555-8555-555555555555', publicLoggerSessionId: null, recordedWorkspaceId: GUEST_WORKSPACE };
    const publicEntry = { recordedBy: null, publicLoggerSessionId: 'session-1', recorderLinkId: 'link-1', recorderLoggerName: 'Official', recorderLoggerClub: 'Club' };
    expect(canMutateSessionEntry(host, hostAccess, guestEntry)).toBe(true);
    expect(canMutateSessionEntry(host, hostAccess, publicEntry)).toBe(true);
  });

  it('restricts guest coaches to entries their club recorded', () => {
    const ownClubEntry = { recordedBy: '55555555-5555-4555-8555-555555555555', publicLoggerSessionId: null, recordedWorkspaceId: GUEST_WORKSPACE };
    const hostEntry = { recordedBy: '44444444-4444-4444-8444-444444444444', publicLoggerSessionId: null, recordedWorkspaceId: HOST_WORKSPACE };
    expect(canMutateSessionEntry(guest, guestAccess, ownClubEntry)).toBe(true);
    expect(canMutateSessionEntry(sameClubCoach, guestAccess, ownClubEntry)).toBe(true);
    expect(canMutateSessionEntry(guest, guestAccess, hostEntry)).toBe(false);
    expect(canMutateSessionEntry(guest, guestAccess, { recordedBy: null, publicLoggerSessionId: null, recordedWorkspaceId: null })).toBe(false);
  });

  it('keeps helper grants person-level', () => {
    const helper: MeetActor = { userId: '88888888-8888-4888-8888-888888888888', workspaceId: GUEST_WORKSPACE, role: 'coach' };
    const ownRecord = { recordedBy: '88888888-8888-4888-8888-888888888888', publicLoggerSessionId: null, recordedWorkspaceId: null };
    const otherRecord = { recordedBy: '44444444-4444-4444-8444-444444444444', publicLoggerSessionId: null, recordedWorkspaceId: HOST_WORKSPACE };
    expect(canMutateSessionEntry(helper, helperAccess, ownRecord)).toBe(true);
    expect(canMutateSessionEntry(helper, helperAccess, otherRecord)).toBe(false);
  });

  it('denies assistants outright', () => {
    const anyEntry = { recordedBy: '44444444-4444-4444-8444-444444444444', publicLoggerSessionId: null, recordedWorkspaceId: HOST_WORKSPACE };
    expect(canMutateSessionEntry(hostAssistant, hostAccess, anyEntry)).toBe(false);
    expect(canMutateSessionEntry(hostAssistant, guestAccess, anyEntry)).toBe(false);
  });
});

function resultsBoardDb(rsvps: Record<string, string | null>) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes(' AS accepted')) {
      return { rows: [{ id: '11111111-1111-4111-8111-111111111111', workspace_id: '33333333-3333-4333-8333-333333333333', type: 'competition', status: 'in_progress', accepted: true, helper: false }] };
    }
    if (sql.startsWith('SELECT * FROM discipline_sessions')) {
      return { rows: [{ id: params[0], event_id: '11111111-1111-4111-8111-111111111111', discipline_definition_id: '55555555-5555-4555-8555-555555555555', label: '200m', status: 'in_progress', result_state: 'provisional', version: 1, vertical_config: null }] };
    }
    if (sql.startsWith('SELECT * FROM discipline_definitions')) {
      return { rows: [{ id: '55555555-5555-4555-8555-555555555555', code: '200m', kind: 'track', presentation: { label: '200m' }, unit: 'seconds', direction: 'lower', default_rules: { entrantType: 'individual', aggregation: 'timed' } }] };
    }
    if (sql.startsWith('SELECT * FROM session_timeline_entries')) return { rows: [] };
    if (sql.includes('FROM session_results r JOIN session_entrants se')) {
      return {
        rows: ['entrant-1', 'entrant-2'].map((entrantId, index) => ({
          id: `result-${index + 1}`, event_id: '11111111-1111-4111-8111-111111111111', session_id: '22222222-2222-4222-8222-222222222222', entrant_id: entrantId,
          workspace_id: '33333333-3333-4333-8333-333333333333', outcome: 'valid', final_result: 11 + index, unit: 'seconds',
          selected_entry_id: null, final_place: null, version: 1,
          withdrawn_at: null, entrant_kind: 'athlete', athlete_rsvp: rsvps[entrantId] ?? null,
        })),
      };
    }
    if (sql.includes('WITH performances AS')) return { rows: [] };
    if (sql.startsWith('SELECT to_char(e.date')) return { rows: [{ date: '2026-09-01', athlete_id: 'athlete-1' }] };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  return { query };
}

describe('listSessionResults RSVP exclusion', () => {
  const host = { userId: '44444444-4444-4444-8444-444444444444', workspaceId: '33333333-3333-4333-8333-333333333333', role: 'coach' as const } satisfies Extract<MeetActor, { userId: string }>;

  it('excludes athlete entrants whose RSVP is not attending', async () => {
    const db = resultsBoardDb({ 'entrant-1': 'yes', 'entrant-2': 'no' });

    const board = await listSessionResults(host, '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', db as never);

    expect(board.map((row) => row.entrantId)).toEqual(['entrant-1']);
    expect(board[0]).not.toHaveProperty('athleteRsvp');
    expect(board[0]).not.toHaveProperty('athleteId');
    expect(board[0]).not.toHaveProperty('attending');
  });

  it('keeps attending athletes and relay entrants on the board', async () => {
    const db = resultsBoardDb({ 'entrant-1': 'pending', 'entrant-2': null });

    const board = await listSessionResults(host, '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', db as never);

    expect(board.map((row) => row.entrantId)).toEqual(['entrant-1', 'entrant-2']);
  });
});
