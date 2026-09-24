import { Router } from 'express';
import * as meets from '../controllers/meets.js';
import { requireCoach, requireOperationalAccess } from '../middleware/capabilities.js';

export const disciplinesRouter = Router();
disciplinesRouter.get('/', meets.catalogue);

const router = Router();
router.get('/:eventId/sessions', meets.sessions);
router.post('/:eventId/sessions', requireOperationalAccess(), meets.createSession);
router.patch('/:eventId/sessions/:disciplineSessionId', requireOperationalAccess(), meets.changeSession);
router.get('/:eventId/entrants', meets.entrants);
router.post('/:eventId/entrants', requireCoach(), meets.createEntrant);
router.patch('/:eventId/entrants/:entrantId', requireCoach(), meets.updateEntrant);
router.get('/:eventId/sessions/:disciplineSessionId/entrants', meets.registrations);
router.post('/:eventId/sessions/:disciplineSessionId/entrants/:entrantId', requireCoach(), meets.registerEntrant);
router.delete('/:eventId/sessions/:disciplineSessionId/entrants/:entrantId', requireCoach(), meets.withdrawEntrant);
router.get('/:eventId/sessions/:disciplineSessionId/entries', meets.entries);
router.post('/:eventId/sessions/:disciplineSessionId/entrants/:entrantId/entries', requireOperationalAccess(), meets.createEntry);
router.put('/:eventId/sessions/:disciplineSessionId/entrants/:entrantId/entries/:entryId', requireCoach(), meets.replaceEntry);
router.delete('/:eventId/sessions/:disciplineSessionId/entrants/:entrantId/entries/:entryId', requireCoach(), meets.undoEntry);
router.get('/:eventId/sessions/:disciplineSessionId/results', meets.results);
router.put('/:eventId/sessions/:disciplineSessionId/results/:entrantId', requireCoach(), meets.overrideResult);
router.put('/:eventId/sessions/:disciplineSessionId/results/:entrantId/selection', requireCoach(), meets.selectResultEntry);
router.get('/:eventId/sessions/:disciplineSessionId/statistics', meets.statistics);
export default router;
