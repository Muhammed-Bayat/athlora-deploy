import { Router } from 'express';
import * as publicStatistics from '../controllers/publicStatistics.js';
import { getPool } from '../db/client.js';
import { ApiError } from '../middleware/errors.js';
import { isCanonicalUuid } from '../validation/primitives.js';
import { verticalAthleteStatistics } from '../services/verticalStatistics.js';
import { disciplineAthleteStatistics } from '../services/disciplineStatistics.js';
import { publicClubSessionResults } from '../services/publicResults.js';
import { parseSeasonYear } from '../services/seasons.js';

const router = Router();

router.get('/seasons', publicStatistics.listSeasons);
router.get('/clubs', publicStatistics.listClubs);
router.get('/comparison', publicStatistics.athleteComparison);
router.get('/clubs/:clubId', publicStatistics.clubStatistics);
router.get('/clubs/:clubId/session-results', async (req, res, next) => {
  try {
    res.json({ data: await publicClubSessionResults(req.params.clubId) });
  } catch (error) { next(error); }
});
router.get(['/clubs/:clubId/vertical', '/clubs/:clubId/disciplines'], async (req, res, next) => {
  try {
    if (!isCanonicalUuid(req.params.clubId)) throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
    const db = getPool();
    const club = await db.query<{ workspace_id: string }>('SELECT workspace_id FROM clubs WHERE id = $1 AND public_results_enabled = true', [req.params.clubId]);
    if (!club.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
    const season = parseSeasonYear(req.query.year);
    const statistics = req.path.endsWith('/vertical') ? verticalAthleteStatistics : disciplineAthleteStatistics;
    res.json({ data: await statistics(db, club.rows[0].workspace_id, null, season.selected === 'all' ? new Date().getUTCFullYear() : Number(season.selected)) });
  } catch (error) { next(error); }
});

export default router;
