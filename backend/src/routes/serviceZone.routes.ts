import { Router, Response, NextFunction, Request, RequestHandler } from 'express';
import { query, param, body } from 'express-validator';
import { AuthUser } from '../types/express';

// Define the ServiceZoneRequest type that extends Express Request with user property
type ServiceZoneRequest = Request & {
  user: AuthUser;
};
import {
  listServiceZones,
  getServiceZone,
  createServiceZone,
  updateServiceZone,
  deleteServiceZone,
  getServiceZoneStats
} from '../controllers/serviceZone.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate-request';

const router = Router();

// Apply auth middleware to all routes
router.use(authenticate);

// Get all service zones with pagination and search
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON']),
  (req: Request, res: Response) => listServiceZones(req as unknown as ServiceZoneRequest, res)
);

// Get service zone by ID
router.get(
  '/:id',
  [
    param('id').isInt().toInt().withMessage('Invalid service zone ID'),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON']),
  (req: Request, res: Response) => getServiceZone(req as unknown as ServiceZoneRequest, res)
);

// Get service zone statistics
router.get(
  '/:id/stats',
  [
    param('id').isInt().toInt().withMessage('Invalid service zone ID'),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON']),
  (req: Request, res: Response) => getServiceZoneStats(req as unknown as ServiceZoneRequest, res)
);

// Create a new service zone (Admin only)
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('description').optional().trim(),
    body('city').trim().notEmpty().withMessage('City is required'),
    body('state').trim().notEmpty().withMessage('State is required'),
    body('country').trim().notEmpty().withMessage('Country is required'),
    body('status').optional().isIn(['ACTIVE', 'INACTIVE']).withMessage('Invalid status'),
    body('servicePersonIds').optional().isArray().withMessage('servicePersonIds must be an array'),
    body('servicePersonIds.*').optional().isInt().withMessage('Each service person ID must be an integer'),
    validateRequest
  ],
  requireRole(['ADMIN']),
  (req: Request, res: Response) => createServiceZone(req as unknown as ServiceZoneRequest, res)
);

// Update a service zone (Admin only)
router.put(
  '/:id',
  [
    param('id').isInt().toInt().withMessage('Invalid service zone ID'),
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('description').optional().trim(),
    body('city').optional().trim().notEmpty().withMessage('City cannot be empty'),
    body('state').optional().trim().notEmpty().withMessage('State cannot be empty'),
    body('country').optional().trim().notEmpty().withMessage('Country cannot be empty'),
    body('status').optional().isIn(['ACTIVE', 'INACTIVE']).withMessage('Invalid status'),
    body('servicePersonIds').optional().isArray().withMessage('servicePersonIds must be an array'),
    body('servicePersonIds.*').optional().isInt().withMessage('Each service person ID must be an integer'),
    validateRequest
  ],
  requireRole(['ADMIN']),
  (req: Request, res: Response) => updateServiceZone(req as unknown as ServiceZoneRequest, res)
);

// Delete a service zone (Admin only)
router.delete(
  '/:id',
  [
    param('id').isInt().toInt().withMessage('Invalid service zone ID'),
    validateRequest
  ],
  requireRole(['ADMIN']),
  (req: Request, res: Response) => deleteServiceZone(req as unknown as ServiceZoneRequest, res)
);

export default router;
