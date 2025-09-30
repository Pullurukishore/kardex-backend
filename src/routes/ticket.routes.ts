import { Router } from 'express';
import { query, param, body } from 'express-validator';
import { upload } from '../config/multer';
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
  getTicketActivity,
  getTicketComments,
  addTicketComment,
  uploadTicketReports,
  getTicketReports,
  downloadTicketReport,
  deleteTicketReport,
  startOnsiteVisit,
  reachOnsiteLocation,
  startOnsiteWork,
  resolveOnsiteWork,
  markOnsiteVisitPending,
  completeOnsiteVisitAndReturn,
  updatePOReached,
  getOnsiteVisitTracking,
  updateStatusWithLifecycle
} from '../controllers/ticket.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate-request';
// Custom type definitions to replace problematic Prisma imports
type TicketStatus = 
  | 'OPEN' | 'ASSIGNED' | 'IN_PROCESS' | 'WAITING_CUSTOMER' | 'ONSITE_VISIT' 
  | 'ONSITE_VISIT_PLANNED' | 'ONSITE_VISIT_STARTED' | 'ONSITE_VISIT_REACHED' 
  | 'ONSITE_VISIT_IN_PROGRESS' | 'ONSITE_VISIT_RESOLVED' | 'ONSITE_VISIT_PENDING' 
  | 'ONSITE_VISIT_COMPLETED' | 'PO_NEEDED' | 'PO_REACHED' | 'PO_RECEIVED' 
  | 'SPARE_PARTS_NEEDED' | 'SPARE_PARTS_BOOKED' | 'SPARE_PARTS_DELIVERED' 
  | 'CLOSED_PENDING' | 'CLOSED' | 'CANCELLED' | 'REOPENED' | 'IN_PROGRESS' 
  | 'ON_HOLD' | 'ESCALATED' | 'RESOLVED' | 'PENDING';

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

const router = Router();

// Apply auth middleware to all routes
router.use(authenticate);

// Get all valid status values
const statusValues = [
  'OPEN', 'ASSIGNED', 'IN_PROCESS', 'WAITING_CUSTOMER', 'ONSITE_VISIT',
  'ONSITE_VISIT_PLANNED', 'ONSITE_VISIT_STARTED', 'ONSITE_VISIT_REACHED',
  'ONSITE_VISIT_IN_PROGRESS', 'ONSITE_VISIT_RESOLVED', 'ONSITE_VISIT_PENDING',
  'ONSITE_VISIT_COMPLETED', 'PO_NEEDED', 'PO_REACHED', 'PO_RECEIVED', 
  'SPARE_PARTS_NEEDED', 'SPARE_PARTS_BOOKED', 'SPARE_PARTS_DELIVERED', 
  'CLOSED_PENDING', 'CLOSED', 'CANCELLED', 'REOPENED', 'IN_PROGRESS', 
  'ON_HOLD', 'ESCALATED', 'RESOLVED', 'PENDING'
];
const priorityValues = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

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
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
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
    body('note').optional().trim(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
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
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
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

// Get ticket comments
router.get(
  '/:id/comments',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  getTicketComments
);

// Add ticket comment
router.post(
  '/:id/comments',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    body('content').trim().notEmpty().withMessage('Comment content is required'),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  addTicketComment
);

// Upload reports for a ticket
router.post(
  '/:id/reports',
  upload.array('files', 10), // Allow up to 10 files
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  uploadTicketReports
);

// Get all reports for a ticket
router.get(
  '/:id/reports',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  getTicketReports
);

// Download a specific report
router.get(
  '/:id/reports/:reportId/download',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    param('reportId').isInt().toInt().withMessage('Invalid report ID'),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  downloadTicketReport
);

// Delete a specific report
router.delete(
  '/:id/reports/:reportId',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    param('reportId').isInt().toInt().withMessage('Invalid report ID'),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  deleteTicketReport
);

// Enhanced Onsite Visit Lifecycle Routes

// Start onsite visit
router.patch(
  '/:id/onsite-visit/start',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    body('latitude').isFloat().withMessage('Latitude is required'),
    body('longitude').isFloat().withMessage('Longitude is required'),
    body('address').optional().trim(),
    body('plannedDate').optional().isISO8601().withMessage('Planned date must be valid'),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON']),
  startOnsiteVisit
);

// Mark onsite location as reached
router.patch(
  '/:id/onsite-visit/reached',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    body('latitude').isFloat().withMessage('Latitude is required'),
    body('longitude').isFloat().withMessage('Longitude is required'),
    body('address').optional().trim(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON']),
  reachOnsiteLocation
);

// Start work at onsite location
router.patch(
  '/:id/onsite-visit/work-start',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    body('latitude').optional().isFloat(),
    body('longitude').optional().isFloat(),
    body('address').optional().trim(),
    body('workDescription').optional().trim(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON']),
  startOnsiteWork
);

// Resolve onsite work
router.patch(
  '/:id/onsite-visit/resolve',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    body('latitude').optional().isFloat(),
    body('longitude').optional().isFloat(),
    body('address').optional().trim(),
    body('resolutionSummary').optional().trim(),
    body('isFullyResolved').optional().isBoolean(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON']),
  resolveOnsiteWork
);

// Mark onsite visit as pending
router.patch(
  '/:id/onsite-visit/pending',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    body('reason').optional().trim(),
    body('expectedResolutionDate').optional().isISO8601(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON']),
  markOnsiteVisitPending
);

// Complete onsite visit and return
router.patch(
  '/:id/onsite-visit/complete',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    body('latitude').optional().isFloat(),
    body('longitude').optional().isFloat(),
    body('address').optional().trim(),
    body('completionNotes').optional().trim(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON']),
  completeOnsiteVisitAndReturn
);

// Update PO status to reached
router.patch(
  '/:id/po/reached',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    body('notes').optional().trim(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON']),
  updatePOReached
);

// Get onsite visit tracking history
router.get(
  '/:id/onsite-visit/tracking',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  getOnsiteVisitTracking
);

// Enhanced update status with lifecycle validation
router.patch(
  '/:id/status-lifecycle',
  [
    param('id').isInt().toInt().withMessage('Invalid ticket ID'),
    body('status')
      .isIn(statusValues)
      .withMessage(`Invalid status. Must be one of: ${statusValues.join(', ')}`),
    body('comments').optional().trim(),
    body('latitude').optional().isFloat(),
    body('longitude').optional().isFloat(),
    body('address').optional().trim(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  updateStatusWithLifecycle
);

export default router;
