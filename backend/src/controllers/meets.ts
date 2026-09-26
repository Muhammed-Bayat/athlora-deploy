import type { Request, RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import { ApiError } from '../middleware/errors.js';
import { notifyEventInvalidated, notifySessionInvalidated } from '../realtime/index.js';
import * as meets from '../services/meets.js';
import * as performances from '../services/sessionPerformances.js';
import * as offlineResolution from '../services/offlineResolution.js';
import type { MeetActor, SessionTarget } from '../types/meets.js';
import { object, parseEntrantCreate, parseEntrantUpdate, parseSessionCreate, parseSessionEntry, parseSessionEntryReplacement, parseSessionOverride, parseSessionSelection, parseSessionState, parseVersion } from '../validation/meets.js';
import { meetIds } from '../services/meetAccess.js';

function actor(req: Request): MeetActor {
  const context = getApplicationUserContext(req);
  return { userId: context.userId, workspaceId: context.workspaceId, role: context.workspaceRole };
}
function parameter(req: Request, name: string): string {
  const value = req.params[name];
  meetIds(value);
  return value as string;
}
function target(req: Request): SessionTarget {
  return { disciplineSessionId: parameter(req, 'disciplineSessionId'), entrantId: parameter(req, 'entrantId') };
}
function entrantFilter(req: Request): string | undefined {
  if (req.query.entrantId === undefined) return undefined;
  meetIds(req.query.entrantId);
  return req.query.entrantId as string;
}
function handler(operation: (req: Request) => Promise<unknown>, status = 200): RequestHandler {
  return async (req, res, next) => {
    try {
      const data = await operation(req);
      if (status === 204) res.status(status).end();
      else res.status(status).json({ data, ...(Array.isArray(data) ? { meta: { count: data.length } } : {}) });
    } catch (error) { next(error); }
  };
}

export const catalogue = handler(() => meets.listDisciplines());
export const sessions = handler((req) => meets.listSessions(actor(req), parameter(req, 'eventId')));
export const entrants = handler((req) => meets.listEntrants(actor(req), parameter(req, 'eventId')));
export const createSession = handler(async (req) => {
  const eventId = parameter(req, 'eventId');
  const session = await meets.createSession(actor(req), eventId, parseSessionCreate(req.body));
  notifySessionInvalidated(eventId, session.id);
  return session;
}, 201);
export const changeSession = handler(async (req) => {
  const eventId = parameter(req, 'eventId');
  const session = await meets.changeSessionState(actor(req), eventId, parameter(req, 'disciplineSessionId'), parseSessionState(req.body));
  notifySessionInvalidated(eventId, session.id);
  return session;
});
export const createEntrant = handler(async (req) => {
  const eventId = parameter(req, 'eventId');
  const entrant = await meets.createEntrant(actor(req), eventId, parseEntrantCreate(req.body));
  notifyEventInvalidated(eventId, 'entrants');
  return entrant;
}, 201);
export const updateEntrant = handler(async (req) => {
  const eventId = parameter(req, 'eventId');
  const entrant = await meets.updateEntrant(actor(req), eventId, parameter(req, 'entrantId'), parseEntrantUpdate(req.body));
  notifyEventInvalidated(eventId, 'entrants');
  return entrant;
});
export const registrations = handler((req) => meets.listRegistrations(actor(req), parameter(req, 'eventId'), parameter(req, 'disciplineSessionId')));
export const registerEntrant = handler(async (req) => {
  object(req.body ?? {}, []);
  const eventId = parameter(req, 'eventId');
  const registration = await meets.registerEntrant(actor(req), eventId, target(req));
  notifySessionInvalidated(eventId, registration.disciplineSessionId, registration.entrantId);
  return registration;
}, 201);
export const withdrawEntrant = handler(async (req) => {
  const eventId = parameter(req, 'eventId');
  const ids = target(req);
  await meets.withdrawEntrant(actor(req), eventId, ids);
  notifySessionInvalidated(eventId, ids.disciplineSessionId, ids.entrantId);
}, 204);
export const entries = handler((req) => performances.listSessionEntries(actor(req), parameter(req, 'eventId'), parameter(req, 'disciplineSessionId'), entrantFilter(req)));
export const createEntry = handler(async (req) => {
  const eventId = parameter(req, 'eventId');
  const ids = target(req);
  const entry = await performances.createSessionEntry(actor(req), eventId, ids, parseSessionEntry(req.body));
  notifySessionInvalidated(eventId, ids.disciplineSessionId, ids.entrantId);
  return entry;
}, 201);
export const replaceEntry = handler(async (req) => {
  const eventId = parameter(req, 'eventId');
  const ids = target(req);
  const entry = await performances.mutateSessionEntry(actor(req), eventId, ids, parameter(req, 'entryId'), parseSessionEntryReplacement(req.body), false);
  notifySessionInvalidated(eventId, ids.disciplineSessionId, ids.entrantId);
  return entry;
});
export const undoEntry = handler(async (req) => {
  const body = object(req.body, ['expectedVersion']);
  const eventId = parameter(req, 'eventId');
  const ids = target(req);
  await performances.mutateSessionEntry(actor(req), eventId, ids, parameter(req, 'entryId'), { expectedVersion: parseVersion(body.expectedVersion) }, true);
  notifySessionInvalidated(eventId, ids.disciplineSessionId, ids.entrantId);
}, 204);
export const results = handler((req) => performances.listSessionResults(actor(req), parameter(req, 'eventId'), parameter(req, 'disciplineSessionId')));
export const resolution = handler((req) => offlineResolution.getSessionResolution(actor(req), parameter(req, 'eventId'), parameter(req, 'disciplineSessionId')));
export const resolveConflict = handler((req) => {
  const body = object(req.body, ['reason']);
  if (typeof body.reason !== 'string') throw new ApiError(400, 'VALIDATION_ERROR', 'reason is required');
  return offlineResolution.resolveOfflineConflict(actor(req), parameter(req, 'eventId'), parameter(req, 'disciplineSessionId'), parameter(req, 'conflictId'), body.reason);
});
export const overrideResult = handler(async (req) => {
  const eventId = parameter(req, 'eventId');
  const ids = target(req);
  await performances.overrideSessionResult(actor(req), eventId, ids, parseSessionOverride(req.body));
  notifySessionInvalidated(eventId, ids.disciplineSessionId, ids.entrantId);
  return (await performances.listSessionResults(actor(req), eventId, ids.disciplineSessionId)).find((row) => row.entrantId === ids.entrantId);
});
export const selectResultEntry = handler(async (req) => {
  const eventId = parameter(req, 'eventId');
  const ids = target(req);
  const result = await performances.selectSessionResultEntry(actor(req), eventId, ids, parseSessionSelection(req.body));
  notifySessionInvalidated(eventId, ids.disciplineSessionId, ids.entrantId);
  return result;
});
export const statistics = handler((req) => performances.sessionStatistics(actor(req), parameter(req, 'eventId'), parameter(req, 'disciplineSessionId'), entrantFilter(req)));
