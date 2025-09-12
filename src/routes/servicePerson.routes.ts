import { Router } from 'express';
import {
  listServicePersons,
  getServicePerson,
  createServicePerson,
  updateServicePerson,
  deleteServicePerson
} from '../controllers/servicePerson.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate-request';
import { body, param } from 'express-validator';

const router = Router();

router.use(authenticate);

// Get all service persons
router.get(
  '/',
  requireRole(['ADMIN', 'ZONE_USER', 'SERVICE_PERSON']),
  listServicePersons
);

// Get a specific service person
router.get(
  '/:id',
  [
    param('id').isInt().toInt().withMessage('Invalid service person ID'),
    validateRequest
  ],
  requireRole(['ADMIN']),
  getServicePerson
);

// Create a new service person
router.post(
  '/',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('serviceZoneIds').optional().isArray().withMessage('serviceZoneIds must be an array'),
    body('serviceZoneIds.*').optional().isInt().withMessage('Each service zone ID must be an integer'),
    validateRequest
  ],
  requireRole(['ADMIN']),
  createServicePerson
);

// Update a service person
router.put(
  '/:id',
  [
    param('id').isInt().toInt().withMessage('Invalid service person ID'),
    body('email').optional().isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('serviceZoneIds').optional().isArray().withMessage('serviceZoneIds must be an array'),
    body('serviceZoneIds.*').optional().isInt().withMessage('Each service zone ID must be an integer'),
    validateRequest
  ],
  requireRole(['ADMIN']),
  updateServicePerson
);

// Delete a service person
router.delete(
  '/:id',
  [
    param('id').isInt().toInt().withMessage('Invalid service person ID'),
    validateRequest
  ],
  requireRole(['ADMIN']),
  deleteServicePerson
);

export default router;