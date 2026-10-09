import { Router, type RequestHandler } from 'express';
import { ApiError } from '../middleware/errors.js';
import { notifySessionInvalidated } from '../realtime/index.js';
import { resolvePublicMeetActor } from '../services/publicLoggers.js';
import { listDisciplines, listEntrants, listRegistrations, listSessions, listSafeRelayMembers } from '../services/meets.js';
import { assertPublicSessionEntryContent, createSessionEntry, listSessionEntries, listSessionResults, mutateSessionEntry } from '../services/sessionPerformances.js';
import type { SessionEntry, SessionEntryInput } from '../types/meets.js';
import { object, parseSessionEntry, parseSessionEntryReplacement, parseVersion } from '../validation/meets.js';
import { meetIds } from '../services/meetAccess.js';

function publicEntry(entry: SessionEntry, canEdit: boolean, canUndo: boolean) {
  return { id: entry.id, eventId: entry.eventId, disciplineSessionId: entry.disciplineSessionId,
    verticalState: entry.verticalState, attemptOrder: entry.attemptOrder,
    entrantId: entry.entrantId, relayMemberId: entry.relayMemberId ?? null, entryType: entry.entryType, value: entry.value, unit: entry.unit,
    isFoul: entry.isFoul, incidentType: entry.incidentType, version: entry.version, createdAt: entry.createdAt,
    recorderName: entry.recorderName ?? null,
    canEdit, canUndo };
}

async function publicSession(actor: Awaited<ReturnType<typeof resolvePublicMeetActor>>, eventId: string, session: Awaited<ReturnType<typeof listSessions>>[number]) {
  const [results, registrations, entries] = await Promise.all([
    listSessionResults(actor, eventId, session.id),
    listRegistrations(actor, eventId, session.id),
    listSessionEntries(actor, eventId, session.id),
  ]);
  return {
    id: session.id,
    label: session.label,
    disciplineDefinitionId: session.disciplineDefinitionId,
    status: session.status,
    resultState: session.resultState,
    version: session.version,
    verticalConfig: session.verticalConfig,
    results: results.map((result) => ({ entrantId: result.entrantId, value: result.effectiveResult, outcome: result.effectiveOutcome, placing: result.placing, vertical: result.vertical, selectedEntryId: result.selectedEntryId, relayLegs: result.relayLegs ?? null })),
    entrantIds: registrations.filter((registration) => !registration.withdrawnAt).map((registration) => registration.entrantId),
    entries: entries.map((entry) => publicEntry(entry, entry.canEdit === true, entry.canUndo === true)),
  };
}

const snapshot: RequestHandler = async (req, res, next) => {
  try {
    const eventId = String(req.params.eventId);
    const token = req.header('X-Public-Logger-Session');
    if (!token) throw new ApiError(401, 'PUBLIC_LOGGER_SESSION_INVALID', 'Public logger access is unavailable');
    const actor = await resolvePublicMeetActor(token, eventId);
    const [sessions, entrants, disciplines] = await Promise.all([listSessions(actor, eventId), listEntrants(actor, eventId), listDisciplines()]);
    const safeEntrants = await Promise.all(entrants.map(async (entrant) => ({
      id: entrant.id, name: entrant.name, kind: entrant.kind,
      workspaceName: entrant.workspaceName ?? null,
      clubName: entrant.clubName ?? null,
      attending: entrant.kind === 'relay' || !entrant.athleteId || entrant.rsvpStatus === 'yes',
      // listEntrants already includes the safe member projection, avoiding one query per relay.
      members: entrant.kind === 'relay' ? entrant.members ?? await listSafeRelayMembers(eventId, entrant.id) : [],
    })));
    res.json({ data: { disciplines,
      entrants: safeEntrants,
      sessions: await Promise.all(sessions.map((session) => publicSession(actor, eventId, session))),
    } });
  } catch (error) { next(error); }
};

const sessionSnapshot: RequestHandler = async (req, res, next) => {
  try {
    const eventId = String(req.params.eventId);
    const sessionId = String(req.params.disciplineSessionId);
    const token = req.header('X-Public-Logger-Session');
    if (!token) throw new ApiError(401, 'PUBLIC_LOGGER_SESSION_INVALID', 'Public logger access is unavailable');
    const actor = await resolvePublicMeetActor(token, eventId);
    const session = (await listSessions(actor, eventId)).find((item) => item.id === sessionId);
    if (!session) throw new ApiError(404, 'NOT_FOUND', 'Discipline session not found');
    res.json({ data: await publicSession(actor, eventId, session) });
  } catch (error) { next(error); }
};

function mutation(mode: 'create' | 'replace' | 'undo'): RequestHandler {
  return async (req, res, next) => {
    try {
      const eventId = String(req.params.eventId);
      const disciplineSessionId = String(req.params.disciplineSessionId);
      const entrantId = String(req.params.entrantId);
      meetIds(eventId, disciplineSessionId, entrantId);
      const token = req.header('X-Public-Logger-Session');
      if (!token) throw new ApiError(401, 'PUBLIC_LOGGER_SESSION_INVALID', 'Public logger access is unavailable');
      const actor = await resolvePublicMeetActor(token, eventId);
      const target = { disciplineSessionId, entrantId };
      const entry = mode === 'create'
        ? await createSessionEntry(actor, eventId, target, publicEntryInput(parseSessionEntry(req.body)))
        : await mutateSessionEntry(actor, eventId, target, String(req.params.entryId), mode === 'undo'
          ? { expectedVersion: parseVersion(object(req.body, ['expectedVersion']).expectedVersion) }
          : publicEntryInput(parseSessionEntryReplacement(req.body)), mode === 'undo');
      notifySessionInvalidated(eventId, disciplineSessionId, entrantId);
      if (mode === 'undo') res.status(204).end();
      else res.status(mode === 'create' ? 201 : 200).json({ data: publicEntry(entry, true, true) });
    } catch (error) { next(error); }
  };
}

function publicEntryInput<T extends SessionEntryInput>(input: T): T {
  assertPublicSessionEntryContent(input);
  return { ...input, deviceId: null };
}

const router = Router();
router.get('/events/:eventId/discipline-sessions', snapshot);
router.get('/events/:eventId/discipline-sessions/:disciplineSessionId', sessionSnapshot);
const entries = '/events/:eventId/discipline-sessions/:disciplineSessionId/entrants/:entrantId/entries';
router.post(entries, mutation('create'));
router.put(`${entries}/:entryId`, mutation('replace'));
router.delete(`${entries}/:entryId`, mutation('undo'));
export default router;
