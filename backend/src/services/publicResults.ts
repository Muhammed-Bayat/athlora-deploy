import type { DbExecutor } from '../db/client.js';
import { ApiError } from '../middleware/errors.js';
import { isCanonicalUuid } from '../validation/primitives.js';
import type { DisciplineDefinition, SafeRelayMember, SessionEntry, VerticalConfig } from '../types/meets.js';
import { mapMeetRow } from '../db/meet-row-mappers.js';
import { authoritativeResult, sessionPlaces } from './sessionResultPolicy.js';
import { withReadTransaction } from '../db/transaction.js';

export interface PublicSessionResultRow {
  entrantId: string;
  name: string;
  kind: 'athlete' | 'guest' | 'relay';
  members: SafeRelayMember[];
  value: number | null;
  outcome: string;
  placing: number | null;
  isSelected: boolean;
}

export interface PublicSessionResults {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  sessions: Array<{
    id: string;
    label: string;
    status: string;
    resultState: string;
    disciplineCode: string;
    disciplineLabel: string;
    unit: string;
    precision: number;
    results: PublicSessionResultRow[];
  }>;
}

export async function publicClubSessionResults(clubId: unknown, db?: DbExecutor): Promise<PublicSessionResults[]> {
  if (!db) return withReadTransaction(client => publicClubSessionResults(clubId, client));
  if (!isCanonicalUuid(clubId)) throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
  const club = await db.query<{ workspace_id: string }>(
    'SELECT workspace_id FROM clubs WHERE id = $1 AND public_results_enabled = true',
    [clubId],
  );
  if (!club.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
  const workspaceId = club.rows[0].workspace_id;

  const events = await db.query<{ id: string; title: string; date: string }>(
    `SELECT DISTINCT e.id, e.title, to_char(e.date, 'YYYY-MM-DD') AS date
     FROM events e
     JOIN discipline_sessions s ON s.event_id = e.id
     WHERE e.workspace_id = $1 AND e.status <> 'cancelled'
      ORDER BY date DESC, e.id`,
    [workspaceId],
  );

  const meetings: PublicSessionResults[] = [];
  for (const event of events.rows) {
    const sessions = await db.query<{
      id: string; label: string; status: string; result_state: string; code: string; label_discipline: string; unit: string; precision: number; definition: Record<string, unknown>; vertical_config: VerticalConfig | null;
    }>(
      `SELECT s.id, s.label, s.status, s.result_state, s.vertical_config, to_jsonb(d) AS definition, d.code, d.presentation->>'label' AS label_discipline, d.unit, d.precision
       FROM discipline_sessions s
       JOIN discipline_definitions d ON d.id = s.discipline_definition_id
       WHERE s.event_id = $1 AND s.status <> 'cancelled'
       ORDER BY s.created_at, s.id`,
      [event.id],
    );
    const rendered: PublicSessionResults['sessions'] = [];
    for (const session of sessions.rows) {
      const results = await db.query<{
        entrant_id: string; name: string; kind: string; value: string | null; outcome: string; placing: number | null; selected_entry_id: string | null;
      }>(
        `SELECT en.id AS entrant_id, en.name, en.kind, r.final_result AS value, r.outcome, r.final_place AS placing, r.selected_entry_id
         FROM session_results r
         JOIN session_entrants sr ON sr.session_id = r.session_id AND sr.entrant_id = r.entrant_id AND sr.withdrawn_at IS NULL
         JOIN meet_entrants en ON en.id = r.entrant_id
         WHERE r.session_id = $1
         ORDER BY r.entrant_id`,
        [session.id],
      );
      const definition = mapMeetRow<DisciplineDefinition>(session.definition);
      const entries = (await db.query('SELECT * FROM session_timeline_entries WHERE session_id = $1 ORDER BY created_at, id', [session.id])).rows.map(r => mapMeetRow<SessionEntry>(r));
      const candidates = results.rows.map(r => {
        const history = entries.filter(e => e.entrantId === r.entrant_id);
        return { entrantId: r.entrant_id, score: authoritativeResult(definition, history, r.selected_entry_id, session.vertical_config), entries: history, eligible: true };
      });
      const placingByEntrant = sessionPlaces(definition, candidates);
      const renderedResults: PublicSessionResultRow[] = [];
      for (const row of results.rows) {
        const members: SafeRelayMember[] = row.kind === 'relay'
          ? (await db.query<{ leg: number; name: string; member_kind: string }>(
              `SELECT rm.leg, me.name, rm.member_kind
               FROM relay_members rm
               JOIN meet_entrants me ON me.id = rm.member_id AND me.event_id = rm.event_id
               WHERE rm.relay_id = $1 ORDER BY rm.leg`,
              [row.entrant_id],
            )).rows.map((member) => ({ leg: Number(member.leg), name: member.name, isGuest: member.member_kind === 'guest' }))
          : [];
        renderedResults.push({
          entrantId: row.entrant_id,
          name: row.name,
          kind: row.kind as 'athlete' | 'guest' | 'relay',
          members,
          value: candidates.find(c => c.entrantId === row.entrant_id)!.score.value,
          outcome: candidates.find(c => c.entrantId === row.entrant_id)!.score.outcome,
          placing: session.result_state === 'final' ? row.placing : placingByEntrant.get(row.entrant_id) ?? null,
          isSelected: Boolean(row.selected_entry_id),
        });
      }
      renderedResults.sort((a, b) => (a.placing ?? 999) - (b.placing ?? 999) || a.name.localeCompare(b.name));
      rendered.push({
        id: session.id,
        label: session.label,
        status: session.status,
        resultState: session.result_state,
        disciplineCode: session.code,
        disciplineLabel: session.label_discipline ?? session.code,
        unit: session.unit,
        precision: Number(session.precision),
        results: renderedResults,
      });
    }
    if (rendered.length) {
      meetings.push({ eventId: event.id, eventTitle: event.title, eventDate: event.date, sessions: rendered });
    }
  }
  return meetings;
}
