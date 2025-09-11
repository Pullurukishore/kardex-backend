import { Router } from 'express';
import { query, param, body } from 'express-validator';
import { 
  listAssets,
  getAsset,
  createAsset,
  updateAsset,
  deleteAsset,
  getAssetStats
} from '../controllers/asset.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate-request';

const router = Router();

// Apply auth middleware to all routes
router.use(authenticate);

// Get all assets with pagination and search
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
    query('customerId').optional().isInt().toInt(),
    query('status').optional().trim(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  listAssets
);

// Get asset by ID
router.get(
  '/:id',
  [
    param('id').isInt().toInt().withMessage('Invalid asset ID'),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  getAsset
);

// Create a new asset
router.post(
  '/',
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
    body('customerId').isInt().toInt().withMessage('Valid customer ID is required'),
    validateRequest
  ],
  requireRole(['ADMIN', 'ZONE_USER']),
  createAsset
);

// Update asset
router.put(
  '/:id',
  [
    param('id').isInt().toInt().withMessage('Invalid asset ID'),
    body('machineId').optional().trim().notEmpty().withMessage('Machine ID cannot be empty'),
    body('model').optional().trim(),
    body('serialNo').optional().trim(),
    body('purchaseDate').optional().isISO8601().withMessage('Invalid purchase date format'),
    body('warrantyStart').optional().isISO8601().withMessage('Invalid warranty start date format'),
    body('warrantyEnd').optional().isISO8601().withMessage('Invalid warranty end date format'),
    body('amcStart').optional().isISO8601().withMessage('Invalid AMC start date format'),
    body('amcEnd').optional().isISO8601().withMessage('Invalid AMC end date format'),
    body('location').optional().trim(),
    body('status').optional().isIn(['ACTIVE', 'MAINTENANCE', 'INACTIVE']).withMessage('Invalid status'),
    body('customerId').optional().isInt().toInt().withMessage('Valid customer ID is required'),
    validateRequest
  ],
  requireRole(['ADMIN', 'ZONE_USER']),
  updateAsset
);

// Delete asset
router.delete(
  '/:id',
  [
    param('id').isInt().toInt().withMessage('Invalid asset ID'),
    validateRequest
  ],
  requireRole(['ADMIN', 'ZONE_USER']),
  deleteAsset
);

// Get asset statistics
router.get(
  '/stats/overview',
  [
    query('customerId').optional().isInt().toInt(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  getAssetStats
);

export default router;
