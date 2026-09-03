import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import { ApiError } from '../middleware/errors.js';
import {
  addGuestFixtureParticipant,
  createFixtureInvitation,
  getGuestFixture,
  listFixtureInvitations,
  listIncomingFixtureInvitations,
  listGuestFixtureParticipants,
  listGuestFixtureResults,
  listGuestFixtures,
  listHostedFixtureEntries,
  listHostedFixtureRosters,
  listHostedFixtureResults,
  overrideHostFixtureResult,
  recordFixtureWithdrawal,
  removeGuestFixtureParticipant,
  respondToFixtureInvitation,
  respondToIncomingFixtureInvitation,
  resendFixtureInvitation,
  revokeFixtureInvitation,
  updateGuestFixtureParticipant,
  withdrawGuestFixture,
} from '../services/fixtures.js';
import { overrideResultRecord } from './results.js';
import { createTimelineEntry, listTimelineEntries, removeTimelineEntry, updateTimelineEntry } from '../services/timeline.js';

function parameter(value: string | string[] | undefined): string {
  if (typeof value !== 'string') throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
  return value;
}

export const createInvitation: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId, userId } = getApplicationUserContext(req);
    const invitation = await createFixtureInvitation(workspaceId, userId, req.params.eventId, req.body);
    res.status(201).json({ data: invitation });
  } catch (error) { next(error); }
};

export const listInvitations: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const invitations = await listFixtureInvitations(workspaceId, req.params.eventId);
    res.json({ data: invitations, meta: { count: invitations.length } });
  } catch (error) { next(error); }
};

export const resendInvitation: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId, userId } = getApplicationUserContext(req);
    const invitation = await resendFixtureInvitation(workspaceId, userId, req.params.eventId, req.params.invitationId);
    res.status(201).json({ data: invitation });
  } catch (error) { next(error); }
};

export const revokeInvitation: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId, userId } = getApplicationUserContext(req);
    await revokeFixtureInvitation(workspaceId, userId, req.params.eventId, req.params.invitationId);
    res.status(204).end();
  } catch (error) { next(error); }
};

export const hostedRosters: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const rosters = await listHostedFixtureRosters(workspaceId, req.params.eventId);
    res.json({ data: rosters, meta: { count: rosters.length } });
  } catch (error) { next(error); }
};

export const hostWithdrawal: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId, userId } = getApplicationUserContext(req);
    await recordFixtureWithdrawal(workspaceId, userId, req.params.eventId, req.params.workspaceId);
    res.status(204).end();
  } catch (error) { next(error); }
};

export const respond: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId, userId } = getApplicationUserContext(req);
    const invitation = await respondToFixtureInvitation(workspaceId, userId, req.params.token, req.body);
    res.json({ data: invitation });
  } catch (error) { next(error); }
};

export const listIncoming: RequestHandler = async (req, res, next) => {
  try {
    const { userId } = getApplicationUserContext(req);
    const invitations = await listIncomingFixtureInvitations(userId);
    res.json({ data: invitations, meta: { count: invitations.length } });
  } catch (error) { next(error); }
};

export const respondIncoming: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId, userId } = getApplicationUserContext(req);
    const invitation = await respondToIncomingFixtureInvitation(workspaceId, userId, req.params.invitationId, req.body);
    res.json({ data: invitation });
  } catch (error) { next(error); }
};

export const listGuest: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const fixtures = await listGuestFixtures(workspaceId);
    res.json({ data: fixtures, meta: { count: fixtures.length } });
  } catch (error) { next(error); }
};

export const getGuest: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    res.json({ data: await getGuestFixture(workspaceId, req.params.eventId) });
  } catch (error) { next(error); }
};

export const listGuestParticipants: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const participants = await listGuestFixtureParticipants(workspaceId, req.params.eventId);
    res.json({ data: participants, meta: { count: participants.length } });
  } catch (error) { next(error); }
};

export const addGuestParticipant: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const participant = await addGuestFixtureParticipant(workspaceId, req.params.eventId, req.body.athleteId);
    res.status(201).json({ data: participant });
  } catch (error) { next(error); }
};

export const updateGuestParticipant: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const participant = await updateGuestFixtureParticipant(workspaceId, req.params.eventId, req.params.athleteId, req.body.rsvpStatus);
    res.json({ data: participant });
  } catch (error) { next(error); }
};

export const removeGuestParticipant: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    await removeGuestFixtureParticipant(workspaceId, req.params.eventId, req.params.athleteId);
    res.status(204).end();
  } catch (error) { next(error); }
};

export const guestWithdrawal: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId, userId } = getApplicationUserContext(req);
    await withdrawGuestFixture(workspaceId, userId, req.params.eventId);
    res.status(204).end();
  } catch (error) { next(error); }
};

export const listGuestEntries: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const entries = await listTimelineEntries(workspaceId, req.params.eventId, undefined, true);
    res.json({ data: entries, meta: { count: entries.length } });
  } catch (error) { next(error); }
};

export const createGuestEntry: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId, userId } = getApplicationUserContext(req);
    const entry = await createTimelineEntry(userId, req.params.eventId, req.body, undefined, workspaceId, true);
    res.status(201).json({ data: entry });
  } catch (error) { next(error); }
};

export const updateGuestEntry: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const entry = await updateTimelineEntry(workspaceId, req.params.eventId, req.params.entryId, req.body, undefined, true);
    res.json({ data: entry });
  } catch (error) { next(error); }
};

export const removeGuestEntry: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    await removeTimelineEntry(workspaceId, req.params.eventId, req.params.entryId, req.body, undefined, true);
    res.status(204).end();
  } catch (error) { next(error); }
};

export const listGuestResults: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const results = await listGuestFixtureResults(workspaceId, req.params.eventId);
    res.json({ data: results, meta: { count: results.length } });
  } catch (error) { next(error); }
};

export const overrideGuestResult: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId, userId } = getApplicationUserContext(req);
    const result = await overrideResultRecord(userId, workspaceId, parameter(req.params.eventId), parameter(req.params.athleteId), req.body, true);
    res.json({ data: result });
  } catch (error) { next(error); }
};

export const hostedEntries: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const entries = await listHostedFixtureEntries(workspaceId, req.params.eventId);
    res.json({ data: entries, meta: { count: entries.length } });
  } catch (error) { next(error); }
};

export const hostedResults: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const results = await listHostedFixtureResults(workspaceId, req.params.eventId);
    res.json({ data: results, meta: { count: results.length } });
  } catch (error) { next(error); }
};

export const overrideHostResult: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId, userId } = getApplicationUserContext(req);
    const result = await overrideHostFixtureResult(workspaceId, userId, req.params.eventId, req.params.athleteId, req.body);
    res.json({ data: result });
  } catch (error) { next(error); }
};
