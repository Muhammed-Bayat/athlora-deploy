import { Router, type RequestHandler } from 'express';
import { ApiError } from '../middleware/errors.js';
import { notifySessionInvalidated } from '../realtime/index.js';
import { resolvePublicMeetActor } from '../services/publicLoggers.js';
import { listDisciplines, listEntrants, listRegistrations, listSessions, listSafeRelayMembers } from '../services/meets.js';
import { assertPublicSessionEntryContent, createSessionEntry, listSessionEntries, listSessionResults, mutateSessionEntry } from '../services/sessionPerformances.js';
import type { SessionEntry, SessionEntryInput } from '../types/meets.js';
import { object, parseSessionEntry, parseSessionEntryReplacement, parseVersion } from '../validation/meets.js';
import { meetIds } from '../services/meetAccess.js';

function publicEntry(entry: SessionEntry, publicLoggerSessionId: string) {
  return { id: entry.id, eventId: entry.eventId, disciplineSessionId: entry.disciplineSessionId,
    verticalState: entry.verticalState, attemptOrder: entry.attemptOrder,
    entrantId: entry.entrantId, entryType: entry.entryType, value: entry.value, unit: entry.unit,
    isFoul: entry.isFoul, incidentType: entry.incidentType, version: entry.version, createdAt: entry.createdAt,
    canEdit: entry.publicLoggerSessionId === publicLoggerSessionId, canUndo: entry.publicLoggerSessionId === publicLoggerSessionId };
}

const snapshot: RequestHandler = async (req, res, next) => {
  try {
    const eventId = String(req.params.eventId);
    const token = req.header('X-Public-Logger-Session');
    if (!token) throw new ApiError(401, 'PUBLIC_LOGGER_SESSION_INVALID', 'Public logger access is unavailable');
    const actor = await resolvePublicMeetActor(token, eventId);
    const sessions = await listSessions(actor, eventId);
    const entrants = await listEntrants(actor, eventId);
    const safeEntrants = await Promise.all(entrants.map(async ({ id, name, kind }) => ({
      id, name, kind,
      members: kind === 'relay' ? await listSafeRelayMembers(eventId, id) : [],
    })));
    res.json({ data: { disciplines: await listDisciplines(),
      entrants: safeEntrants,
      sessions: await Promise.all(sessions.map(async ({ id, label, disciplineDefinitionId, status, resultState, version, verticalConfig }) => ({
        id, label, disciplineDefinitionId, status, resultState, version, verticalConfig,
        results: (await listSessionResults(actor, eventId, id)).map(r => ({ entrantId: r.entrantId, value: r.effectiveResult, outcome: r.effectiveOutcome, placing: r.placing, vertical: r.vertical })),
        entrantIds: (await listRegistrations(actor, eventId, id)).filter((registration) => !registration.withdrawnAt).map((registration) => registration.entrantId),
        entries: (await listSessionEntries(actor, eventId, id)).map((entry) => publicEntry(entry, 'publicLoggerSessionId' in actor ? actor.publicLoggerSessionId : '')),
      }))),
    } });
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
      else res.status(mode === 'create' ? 201 : 200).json({ data: publicEntry(entry, 'publicLoggerSessionId' in actor ? actor.publicLoggerSessionId : '') });
    } catch (error) { next(error); }
  };
}

function publicEntryInput<T extends SessionEntryInput>(input: T): T {
  assertPublicSessionEntryContent(input);
  return { ...input, deviceId: null };
}

const router = Router();
router.get('/events/:eventId/discipline-sessions', snapshot);
const entries = '/events/:eventId/discipline-sessions/:disciplineSessionId/entrants/:entrantId/entries';
router.post(entries, mutation('create'));
router.put(`${entries}/:entryId`, mutation('replace'));
router.delete(`${entries}/:entryId`, mutation('undo'));
export default router;
