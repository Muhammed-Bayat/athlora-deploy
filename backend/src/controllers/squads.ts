import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import { createSquad, listSquads, replaceSquad, setSquadArchived } from '../services/squads.js';

export const list: RequestHandler = async (req, res, next) => { try { const includeArchived = req.query.includeArchived === 'true'; const squads = await listSquads(getApplicationUserContext(req).workspaceId, includeArchived); res.json({ data: squads, meta: { count: squads.length } }); } catch (error) { next(error); } };
export const create: RequestHandler = async (req, res, next) => { try { const squad = await createSquad(getApplicationUserContext(req).workspaceId, req.body.name); res.status(201).json({ data: squad }); } catch (error) { next(error); } };
export const update: RequestHandler = async (req, res, next) => { try { res.json({ data: await replaceSquad(getApplicationUserContext(req).workspaceId, req.params.id, req.body.name) }); } catch (error) { next(error); } };
export const archive: RequestHandler = async (req, res, next) => { try { res.json({ data: await setSquadArchived(getApplicationUserContext(req).workspaceId, req.params.id, true) }); } catch (error) { next(error); } };
export const unarchive: RequestHandler = async (req, res, next) => { try { res.json({ data: await setSquadArchived(getApplicationUserContext(req).workspaceId, req.params.id, false) }); } catch (error) { next(error); } };
