import { describe, expect, it, vi } from 'vitest';
import { assertPublicSessionEntryContent, listSessionResults } from './sessionPerformances.js';
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
