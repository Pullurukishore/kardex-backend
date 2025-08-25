import { Router } from 'express';
import { 
  createPO, 
  getPOs, 
  getPO, 
  updatePOStatus, 
  addPOItem 
} from '../controllers/purchaseOrder.controller';
import { authMiddleware } from '../middleware/auth';
import { body, param, query } from 'express-validator';
import { validateRequest } from '../middleware/validate-request';

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_ACCOUNT_OWNER']));

// Create a new purchase order
router.post(
  '/',
  [
    body('ticketId').isInt().withMessage('Valid ticket ID is required'),
    body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
    body('items.*.description').trim().notEmpty().withMessage('Item description is required'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('items.*.unitPrice').isFloat({ min: 0 }).withMessage('Unit price must be a positive number'),
    body('notes').optional().trim(),
    validateRequest
  ],
  createPO
);

// Get all purchase orders with filters
router.get(
  '/',
  [
    query('status').optional().isIn([
      'DRAFT', 
      'PENDING_APPROVAL', 
      'APPROVED', 
      'REJECTED', 
      'ORDERED', 
      'RECEIVED', 
      'CANCELLED'
    ]),
    query('ticketId').optional().isInt(),
    query('customerId').optional().isInt(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    validateRequest
  ],
  getPOs
);

// Get purchase order by ID
router.get(
  '/:id',
  [
    param('id').isInt().withMessage('Valid PO ID is required'),
    validateRequest
  ],
  getPO
);

// Update PO status
router.patch(
  '/:id/status',
  [
    param('id').isInt().withMessage('Valid PO ID is required'),
    body('status').isIn([
      'PENDING_APPROVAL', 
      'APPROVED', 
      'REJECTED', 
      'ORDERED', 
      'RECEIVED', 
      'CANCELLED'
    ]).withMessage('Invalid status'),
    body('comments').optional().trim(),
    validateRequest
  ],
  updatePOStatus
);

// Add item to PO
router.post(
  '/:id/items',
  [
    param('id').isInt().withMessage('Valid PO ID is required'),
    body('description').trim().notEmpty().withMessage('Item description is required'),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('unitPrice').isFloat({ min: 0 }).withMessage('Unit price must be a positive number'),
    validateRequest
  ],
  addPOItem
);

export default router;
