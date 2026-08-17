import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import { withTransaction } from '../db/transaction.js';
import { mapTimelineEntryRow } from '../db/row-mappers.js';
import { DISCIPLINE_100M, RESULT_UNIT_SECONDS } from '../types/domain.js';
import { recomputeAndUpsertResult } from '../services/resultRecomputation.js';
import { ApiError } from '../middleware/errors.js';

export const createTimelineEntry: RequestHandler = async (req, res, next) => {
  try {
    const { userId } = getApplicationUserContext(req);
    const eventId = req.params.eventId as string;
    const { athleteId, entryType, value, unit, isFoul, incidentType, noteText, deviceId } = req.body;

    const entry = await withTransaction(async (client) => {
      const insertRes = await client.query(
        `INSERT INTO timeline_entries (
           event_id, athlete_id, discipline, entry_type, value, unit, is_foul, incident_type, note_text, recorded_by, version, device_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, $11)
         RETURNING *`,
        [
          eventId,
          athleteId,
          DISCIPLINE_100M,
          entryType,
          value ?? null,
          value !== null && value !== undefined ? (unit ?? RESULT_UNIT_SECONDS) : null,
          isFoul ?? false,
          incidentType ?? null,
          noteText ?? null,
          userId,
          deviceId ?? null,
        ]
      );

      const row = insertRes.rows[0];
      await recomputeAndUpsertResult(client, eventId, athleteId, DISCIPLINE_100M);
      return mapTimelineEntryRow(row);
    });

    res.status(201).json({ data: entry });
  } catch (error) {
    next(error);
  }
};

export const updateTimelineEntry: RequestHandler = async (req, res, next) => {
  try {
    const eventId = req.params.eventId as string;
    const entryId = req.params.entryId as string;
    const patch = req.body;

    const entry = await withTransaction(async (client) => {
      const existingRes = await client.query(
        `SELECT athlete_id, discipline, entry_type, value, unit, is_foul, incident_type, note_text, version
         FROM timeline_entries WHERE id = $1 AND event_id = $2 AND deleted_at IS NULL`,
        [entryId, eventId]
      );
      if (existingRes.rows.length === 0) {
        throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
      }
      const existing = existingRes.rows[0];

      const newEntryType = patch.entryType !== undefined ? patch.entryType : existing.entry_type;
      const newValue = patch.value !== undefined ? patch.value : (existing.value !== null ? Number(existing.value) : null);
      const newUnit = newValue !== null ? (patch.unit !== undefined ? patch.unit : existing.unit) : null;
      const newIsFoul = patch.isFoul !== undefined ? patch.isFoul : existing.is_foul;
      const newIncidentType = patch.incidentType !== undefined ? patch.incidentType : existing.incident_type;
      const newNoteText = patch.noteText !== undefined ? patch.noteText : existing.note_text;

      const updateRes = await client.query(
        `UPDATE timeline_entries
         SET entry_type = $1,
             value = $2,
             unit = $3,
             is_foul = $4,
             incident_type = $5,
             note_text = $6,
             version = version + 1,
             updated_at = NOW()
         WHERE id = $7 AND event_id = $8
         RETURNING *`,
        [
          newEntryType,
          newValue,
          newUnit,
          newIsFoul,
          newIncidentType,
          newNoteText,
          entryId,
          eventId,
        ]
      );

      const row = updateRes.rows[0];
      await recomputeAndUpsertResult(client, eventId, existing.athlete_id, existing.discipline);
      return mapTimelineEntryRow(row);
    });

    res.json({ data: entry });
  } catch (error) {
    next(error);
  }
};

export const deleteTimelineEntry: RequestHandler = async (req, res, next) => {
  try {
    const eventId = req.params.eventId as string;
    const entryId = req.params.entryId as string;

    const entry = await withTransaction(async (client) => {
      const existingRes = await client.query(
        `SELECT athlete_id, discipline FROM timeline_entries WHERE id = $1 AND event_id = $2 AND deleted_at IS NULL`,
        [entryId, eventId]
      );
      if (existingRes.rows.length === 0) {
        throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
      }
      const existing = existingRes.rows[0];

      const updateRes = await client.query(
        `UPDATE timeline_entries
         SET deleted_at = NOW(),
             updated_at = NOW()
         WHERE id = $1 AND event_id = $2
         RETURNING *`,
        [entryId, eventId]
      );

      const row = updateRes.rows[0];
      await recomputeAndUpsertResult(client, eventId, existing.athlete_id, existing.discipline);
      return mapTimelineEntryRow(row);
    });

    res.json({ data: entry });
  } catch (error) {
    next(error);
  }
};
