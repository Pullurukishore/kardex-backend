import { Router } from 'express';
import { body } from 'express-validator';
import { startOnsiteVisit, reachOnsiteVisit, endOnsiteVisit, backOnsiteVisit } from '../controllers/onsite-visit.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate-request';

const router = Router();

router.use(authenticate);

const coordinateValidators = [
  body('ticketId').exists().withMessage('ticketId is required').isInt().toInt(),
  body('latitude').exists().withMessage('latitude is required').isFloat({ min: -90, max: 90 }).toFloat(),
  body('longitude').exists().withMessage('longitude is required').isFloat({ min: -180, max: 180 }).toFloat(),
  validateRequest
];

router.post('/start', coordinateValidators, requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), startOnsiteVisit);
router.post('/reach', coordinateValidators, requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), reachOnsiteVisit);
router.post('/end', coordinateValidators, requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), endOnsiteVisit);
router.post('/back', coordinateValidators, requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), backOnsiteVisit);

export default router;


