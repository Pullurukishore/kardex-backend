import { Router } from 'express';
import { query, param, body } from 'express-validator';
import { 
  getTickets, 
  getTicket, 
  createTicket, 
  updateStatus,
  addComment,
  assignTicket
} from '../controllers/ticket.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate-request';

const router = Router();

// Apply auth middleware to all routes
router.use(authenticate);

// Get tickets with filters
router.get(
  '/',
  [
    query('status').optional().isIn(['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED', 'CANCELLED']),
    query('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_OWNER']),
  getTickets
);

// Get ticket by ID
router.get(
  '/:id',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_OWNER']),
  getTicket
);

// Create a new ticket
router.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']), // Matches your Priority enum
    body('customerId').optional().isInt().toInt(),
    body('assetId').optional().isInt().toInt(), // Changed from machineId to assetId
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_OWNER']),
  createTicket
);

// Update ticket status
router.patch(
  '/:id/status',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    body('status')
      .isIn(['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED', 'CANCELLED'])
      .withMessage('Invalid status'),
    body('comments').optional().trim(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON']),
  updateStatus
);

// Assign ticket to service person
router.patch(
  '/:id/assign',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    body('assignedToId')
      .exists().withMessage('assignedToId is required')
      .bail()
      .customSanitizer((value: any) => String(value))
      .notEmpty().withMessage('assignedToId cannot be empty'),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON']),
  assignTicket
);

// Add comment to ticket
router.post(
  '/:id/comments',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    body('content').trim().notEmpty().withMessage('Comment content is required'),
    body('isInternal').optional().isBoolean().withMessage('isInternal must be a boolean'),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_OWNER']),
  addComment
);

export default router;
