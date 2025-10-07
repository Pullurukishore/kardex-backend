import { Router } from 'express';
import { query, body } from 'express-validator';
import { reverseGeocode, validateLocationJump } from '../controllers/geocoding.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate-request';

const router = Router();

// Reverse geocode coordinates to address with validation
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
    query('accuracy')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Accuracy must be a positive number'),
    query('source')
      .optional()
      .isIn(['gps', 'manual', 'network'])
      .withMessage('Source must be one of: gps, manual, network'),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  reverseGeocode
);

// Validate location jump detection
router.post(
  '/validate-jump',
  authenticate,
  [
    body('previousLocation.latitude')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Previous latitude must be a valid number between -90 and 90'),
    body('previousLocation.longitude')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Previous longitude must be a valid number between -180 and 180'),
    body('newLocation.latitude')
      .isFloat({ min: -90, max: 90 })
      .withMessage('New latitude must be a valid number between -90 and 90'),
    body('newLocation.longitude')
      .isFloat({ min: -180, max: 180 })
      .withMessage('New longitude must be a valid number between -180 and 180'),
    body('maxSpeed')
      .optional()
      .isFloat({ min: 0, max: 1000 })
      .withMessage('Max speed must be between 0 and 1000 km/h'),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  validateLocationJump
);

export default router;
