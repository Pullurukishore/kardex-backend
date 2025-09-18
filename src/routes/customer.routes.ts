import { Router, Response, Request, NextFunction, RequestHandler } from 'express';
import { AuthUser } from '../types/express';
import { body, query } from 'express-validator';
import { 
  listCustomers, 
  getCustomer, 
  createCustomer, 
  updateCustomer, 
  deleteCustomer 
} from '../controllers/customer.controller';
import { createAsset } from '../controllers/asset.controller';
import contactRoutes from './contact.routes';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { canManageCustomers, canViewCustomers, canManageContacts } from '../middleware/customer.middleware';
import { validateRequest } from '../middleware/validate-request';
import { AuthenticatedRequest, isAuthenticatedRequest } from '../types/express';

const router = Router();

// Apply auth middleware to all routes
router.use(authenticate);

// Nested contact routes
router.use('/:id/contacts', contactRoutes);

// Get all customers with pagination and search
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
    validateRequest
  ],
  canViewCustomers,
  listCustomers as RequestHandler
);

// Get customer by ID
router.get(
  '/:id',
  [
    // Add validation for ID if needed
    validateRequest
  ],
  canViewCustomers,
  getCustomer as RequestHandler
);

// Create a new customer
router.post(
  '/',
  [
    body('companyName').trim().notEmpty().withMessage('Company name is required'),
    body('address').optional().trim(),
    body('industry').optional().trim(),
    body('timezone').optional().trim(),
    body('serviceZoneId').optional().isInt().toInt(),
    body('isActive').optional().isBoolean(),
    validateRequest
  ],
  canManageCustomers,
  createCustomer as RequestHandler
);

// Create asset for a specific customer
router.post(
  '/:id/assets',
  [
    body('machineId').trim().notEmpty().withMessage('Machine ID is required'),
    body('model').optional().trim(),
    body('serialNo').optional().trim(),
    body('purchaseDate').optional().isISO8601().withMessage('Invalid purchase date format'),
    body('warrantyStart').optional().isISO8601().withMessage('Invalid warranty start date format'),
    body('warrantyEnd').optional().isISO8601().withMessage('Invalid warranty end date format'),
    body('amcStart').optional().isISO8601().withMessage('Invalid AMC start date format'),
    body('amcEnd').optional().isISO8601().withMessage('Invalid AMC end date format'),
    body('location').optional().trim(),
    body('status').optional().isIn(['ACTIVE', 'MAINTENANCE', 'INACTIVE']).withMessage('Invalid status'),
    validateRequest
  ],
  requireRole(['ADMIN', 'ZONE_USER']),
  (req: Request, res: Response, next: NextFunction) => {
    // Set the customerId from the URL parameter
    req.body.customerId = parseInt(req.params.id);
    next();
  },
  createAsset as RequestHandler
);

// Update customer
router.put(
  '/:id',
  [
    body('companyName').optional().trim().notEmpty().withMessage('Company name cannot be empty'),
    body('address').optional().trim(),
    body('industry').optional().trim(),
    body('timezone').optional().trim(),
    body('serviceZoneId').optional().isInt().toInt(),
    body('isActive').optional().isBoolean(),
    validateRequest
  ],
  canManageCustomers,
  updateCustomer as RequestHandler
);

// Delete customer
router.delete(
  '/:id',
  [
    // Add validation for ID if needed
    validateRequest
  ],
  canManageCustomers,
  deleteCustomer as RequestHandler
);

export default router;
