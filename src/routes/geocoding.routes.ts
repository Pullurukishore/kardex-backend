import { Router } from 'express';
import { query } from 'express-validator';
import { reverseGeocode } from '../controllers/geocoding.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate-request';

const router = Router();

// Reverse geocode coordinates to address
router.get(
  '/reverse',
  authenticate,
  [
    query('latitude')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be a valid number between -90 and 90'),
    query('longitude')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be a valid number between -180 and 180'),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  reverseGeocode
);

export default router;
