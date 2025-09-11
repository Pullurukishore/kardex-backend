import { Router } from 'express';
import { query, param, body } from 'express-validator';
import { 
  getTickets, 
  getTicket, 
  createTicket, 
  updateStatus,
  assignTicket,
  assignToZoneUser,
  planOnsiteVisit,
  completeOnsiteVisit,
  requestPO,
  approvePO,
  updateSparePartsStatus,
  closeTicket,
  addNote,
  getTicketActivity
} from '../controllers/ticket.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate-request';
import { TicketStatus, Priority } from '@prisma/client';

const router = Router();

// Apply auth middleware to all routes
router.use(authenticate);

// Get all valid status values
const statusValues = Object.values(TicketStatus);
const priorityValues = Object.values(Priority);

// Get tickets with filters
router.get(
  '/',
  [
    query('status').optional().isIn(statusValues),
    query('priority').optional().isIn(priorityValues),
    query('assignedToId').optional().isInt().toInt(),
    query('customerId').optional().isInt().toInt(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  getTickets
);

// Get ticket by ID
router.get(
  '/:id',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  getTicket
);

// Get ticket activity history
router.get(
  '/:id/activity',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  getTicketActivity
);

// Create a new ticket
router.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('priority').optional().isIn(priorityValues).withMessage(`Priority must be one of: ${priorityValues.join(', ')}`),
    body('customerId').optional().isInt().toInt(),
    body('assetId').optional().isInt().toInt(),
    body('zoneId').optional().isInt().toInt(),
    body('assignedToId').optional().isInt().toInt(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  createTicket
);

// Update ticket status
router.patch(
  '/:id/status',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    body('status')
      .isIn(statusValues)
      .withMessage(`Invalid status. Must be one of: ${statusValues.join(', ')}`),
    body('comments').optional().trim(),
    body('internalNotes').optional().trim(),
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
      .isInt().withMessage('assignedToId must be an integer')
      .toInt(),
    body('comments').optional().trim(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON']),
  assignTicket
);



// Assign ticket to zone user for onsite visit
router.patch(
  '/:id/assign-zone-user',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    body('zoneUserId')
      .exists().withMessage('zoneUserId is required')
      .isInt().withMessage('zoneUserId must be an integer')
      .toInt(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON']),
  assignToZoneUser
);

// Plan onsite visit
router.patch(
  '/:id/plan-onsite-visit',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    body('servicePersonId')
      .exists().withMessage('servicePersonId is required')
      .isInt().withMessage('servicePersonId must be an integer')
      .toInt(),
    body('visitPlannedDate')
      .exists().withMessage('visitPlannedDate is required')
      .isISO8601().withMessage('visitPlannedDate must be a valid date'),
    validateRequest
  ],
  requireRole(['ADMIN', 'ZONE_USER']),
  planOnsiteVisit
);

// Complete onsite visit
router.patch(
  '/:id/complete-onsite-visit',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    body('resolutionSummary').optional().trim(),
    body('isResolved').optional().isBoolean(),
    body('sparePartsNeeded').optional().isBoolean(),
    body('sparePartsDetails').optional().isArray(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON']),
  completeOnsiteVisit
);

// Request PO for spare parts
router.post(
  '/:id/request-po',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    body('amount').optional().isFloat({ min: 0 }),
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('notes').optional().trim(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON']),
  requestPO
);

// Approve PO
router.patch(
  '/:id/approve-po',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    body('poNumber').trim().notEmpty().withMessage('PO number is required'),
    body('notes').optional().trim(),
    validateRequest
  ],
  requireRole(['ADMIN']),
  approvePO
);

// Update spare parts status
router.patch(
  '/:id/spare-parts-status',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    body('status')
      .exists().withMessage('Status is required')
      .isIn(['BOOKED', 'DELIVERED']).withMessage('Status must be BOOKED or DELIVERED'),
    body('details').optional().isArray(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON']),
  updateSparePartsStatus
);

// Close ticket
router.patch(
  '/:id/close',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    body('feedback').optional().trim(),
    body('rating').optional().isInt({ min: 1, max: 5 }),
    validateRequest
  ],
  requireRole(['ADMIN', 'ZONE_USER']),
  closeTicket
);

// Add note to ticket
router.post(
  '/:id/notes',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    body('content').trim().notEmpty().withMessage('Note content is required'),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  addNote
);

export default router;
