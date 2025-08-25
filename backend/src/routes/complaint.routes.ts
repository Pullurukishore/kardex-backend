import { Router } from 'express';
import { createComplaint, updateTicketStatus } from '../controllers/complaint.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { body } from 'express-validator';
import { validateRequest } from '../middleware/validate-request';

const router = Router();

// Create a new complaint/ticket
router.post(
  '/complaints',
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('priority').isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).withMessage('Invalid priority'),
    body('assetId').optional().isInt().toInt(),
    body('customerId').optional().isInt().toInt(),
    validateRequest
  ],
  authenticate,
  requireRole(['CUSTOMER_ACCOUNT_OWNER', 'CUSTOMER_CONTACT', 'SERVICE_PERSON', 'ADMIN']),
  createComplaint
);

// Update ticket status
router.patch(
  '/tickets/:id/status',
  [
    body('status').isIn([
      'WAITING_FOR_RESPONSE',
      'OPEN',
      'IN_PROGRESS',
      'SPARE_NEEDED',
      'WAITING_FOR_PO',
      'FIXED_PENDING_CLOSURE',
      'CLOSED'
    ]).withMessage('Invalid status'),
    body('note').optional().isString(),
    validateRequest
  ],
  authenticate,
  requireRole(['CUSTOMER_ACCOUNT_OWNER', 'CUSTOMER_CONTACT', 'SERVICE_PERSON', 'ADMIN']),
  updateTicketStatus
);

export default router;
