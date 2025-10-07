"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const multer_1 = require("../config/multer");
const ticket_controller_1 = require("../controllers/ticket.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_request_1 = require("../middleware/validate-request");
const router = (0, express_1.Router)();
// Apply auth middleware to all routes
router.use(auth_middleware_1.authenticate);
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
router.get('/', [
    (0, express_validator_1.query)('status').optional().isIn(statusValues),
    (0, express_validator_1.query)('priority').optional().isIn(priorityValues),
    (0, express_validator_1.query)('assignedToId').optional().isInt().toInt(),
    (0, express_validator_1.query)('customerId').optional().isInt().toInt(),
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), ticket_controller_1.getTickets);
// Get ticket by ID
router.get('/:id', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), ticket_controller_1.getTicket);
// Get ticket activity history
router.get('/:id/activity', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), ticket_controller_1.getTicketActivity);
// Create a new ticket
router.post('/', [
    (0, express_validator_1.body)('title').trim().notEmpty().withMessage('Title is required'),
    (0, express_validator_1.body)('description').trim().notEmpty().withMessage('Description is required'),
    (0, express_validator_1.body)('priority').optional().isIn(priorityValues).withMessage(`Priority must be one of: ${priorityValues.join(', ')}`),
    (0, express_validator_1.body)('customerId').optional().isInt().toInt(),
    (0, express_validator_1.body)('assetId').optional().isInt().toInt(),
    (0, express_validator_1.body)('zoneId').optional().isInt().toInt(),
    (0, express_validator_1.body)('assignedToId').optional().isInt().toInt(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), ticket_controller_1.createTicket);
// Update ticket status
router.patch('/:id/status', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.body)('status')
        .isIn(statusValues)
        .withMessage(`Invalid status. Must be one of: ${statusValues.join(', ')}`),
    (0, express_validator_1.body)('comments').optional().trim(),
    (0, express_validator_1.body)('internalNotes').optional().trim(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), ticket_controller_1.updateStatus);
// Assign ticket to service person
router.patch('/:id/assign', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.body)('assignedToId')
        .exists().withMessage('assignedToId is required')
        .isInt().withMessage('assignedToId must be an integer')
        .toInt(),
    (0, express_validator_1.body)('comments').optional().trim(),
    (0, express_validator_1.body)('note').optional().trim(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), ticket_controller_1.assignTicket);
// Assign ticket to zone user for onsite visit
router.patch('/:id/assign-zone-user', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.body)('zoneUserId')
        .exists().withMessage('zoneUserId is required')
        .isInt().withMessage('zoneUserId must be an integer')
        .toInt(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), ticket_controller_1.assignToZoneUser);
// Plan onsite visit
router.patch('/:id/plan-onsite-visit', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.body)('servicePersonId')
        .exists().withMessage('servicePersonId is required')
        .isInt().withMessage('servicePersonId must be an integer')
        .toInt(),
    (0, express_validator_1.body)('visitPlannedDate')
        .exists().withMessage('visitPlannedDate is required')
        .isISO8601().withMessage('visitPlannedDate must be a valid date'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'ZONE_USER']), ticket_controller_1.planOnsiteVisit);
// Complete onsite visit
router.patch('/:id/complete-onsite-visit', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.body)('resolutionSummary').optional().trim(),
    (0, express_validator_1.body)('isResolved').optional().isBoolean(),
    (0, express_validator_1.body)('sparePartsNeeded').optional().isBoolean(),
    (0, express_validator_1.body)('sparePartsDetails').optional().isArray(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON']), ticket_controller_1.completeOnsiteVisit);
// Request PO for spare parts
router.post('/:id/request-po', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.body)('amount').optional().isFloat({ min: 0 }),
    (0, express_validator_1.body)('description').trim().notEmpty().withMessage('Description is required'),
    (0, express_validator_1.body)('notes').optional().trim(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON']), ticket_controller_1.requestPO);
// Approve PO
router.patch('/:id/approve-po', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.body)('poNumber').trim().notEmpty().withMessage('PO number is required'),
    (0, express_validator_1.body)('notes').optional().trim(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN']), ticket_controller_1.approvePO);
// Update spare parts status
router.patch('/:id/spare-parts-status', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.body)('status')
        .exists().withMessage('Status is required')
        .isIn(['BOOKED', 'DELIVERED']).withMessage('Status must be BOOKED or DELIVERED'),
    (0, express_validator_1.body)('details').optional().isArray(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON']), ticket_controller_1.updateSparePartsStatus);
// Close ticket
router.patch('/:id/close', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.body)('feedback').optional().trim(),
    (0, express_validator_1.body)('rating').optional().isInt({ min: 1, max: 5 }),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'ZONE_USER']), ticket_controller_1.closeTicket);
// Add note to ticket
router.post('/:id/notes', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.body)('content').trim().notEmpty().withMessage('Note content is required'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), ticket_controller_1.addNote);
// Get ticket comments
router.get('/:id/comments', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), ticket_controller_1.getTicketComments);
// Add ticket comment
router.post('/:id/comments', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.body)('content').trim().notEmpty().withMessage('Comment content is required'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), ticket_controller_1.addTicketComment);
// Upload reports for a ticket
router.post('/:id/reports', multer_1.upload.array('files', 10), // Allow up to 10 files
[
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), ticket_controller_1.uploadTicketReports);
// Get all reports for a ticket
router.get('/:id/reports', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), ticket_controller_1.getTicketReports);
// Download a specific report
router.get('/:id/reports/:reportId/download', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.param)('reportId').isInt().toInt().withMessage('Invalid report ID'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), ticket_controller_1.downloadTicketReport);
// Delete a specific report
router.delete('/:id/reports/:reportId', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.param)('reportId').isInt().toInt().withMessage('Invalid report ID'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), ticket_controller_1.deleteTicketReport);
// Enhanced Onsite Visit Lifecycle Routes
// Start onsite visit
router.patch('/:id/onsite-visit/start', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.body)('latitude').isFloat().withMessage('Latitude is required'),
    (0, express_validator_1.body)('longitude').isFloat().withMessage('Longitude is required'),
    (0, express_validator_1.body)('address').optional().trim(),
    (0, express_validator_1.body)('plannedDate').optional().isISO8601().withMessage('Planned date must be valid'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON']), ticket_controller_1.startOnsiteVisit);
// Mark onsite location as reached
router.patch('/:id/onsite-visit/reached', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.body)('latitude').isFloat().withMessage('Latitude is required'),
    (0, express_validator_1.body)('longitude').isFloat().withMessage('Longitude is required'),
    (0, express_validator_1.body)('address').optional().trim(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON']), ticket_controller_1.reachOnsiteLocation);
// Start work at onsite location
router.patch('/:id/onsite-visit/work-start', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.body)('latitude').optional().isFloat(),
    (0, express_validator_1.body)('longitude').optional().isFloat(),
    (0, express_validator_1.body)('address').optional().trim(),
    (0, express_validator_1.body)('workDescription').optional().trim(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON']), ticket_controller_1.startOnsiteWork);
// Resolve onsite work
router.patch('/:id/onsite-visit/resolve', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.body)('latitude').optional().isFloat(),
    (0, express_validator_1.body)('longitude').optional().isFloat(),
    (0, express_validator_1.body)('address').optional().trim(),
    (0, express_validator_1.body)('resolutionSummary').optional().trim(),
    (0, express_validator_1.body)('isFullyResolved').optional().isBoolean(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON']), ticket_controller_1.resolveOnsiteWork);
// Mark onsite visit as pending
router.patch('/:id/onsite-visit/pending', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.body)('reason').optional().trim(),
    (0, express_validator_1.body)('expectedResolutionDate').optional().isISO8601(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON']), ticket_controller_1.markOnsiteVisitPending);
// Complete onsite visit and return
router.patch('/:id/onsite-visit/complete', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.body)('latitude').optional().isFloat(),
    (0, express_validator_1.body)('longitude').optional().isFloat(),
    (0, express_validator_1.body)('address').optional().trim(),
    (0, express_validator_1.body)('completionNotes').optional().trim(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON']), ticket_controller_1.completeOnsiteVisitAndReturn);
// Update PO status to reached
router.patch('/:id/po/reached', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.body)('notes').optional().trim(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON']), ticket_controller_1.updatePOReached);
// Get onsite visit tracking history
router.get('/:id/onsite-visit/tracking', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), ticket_controller_1.getOnsiteVisitTracking);
// Enhanced update status with lifecycle validation
router.patch('/:id/status-lifecycle', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.body)('status')
        .isIn(statusValues)
        .withMessage(`Invalid status. Must be one of: ${statusValues.join(', ')}`),
    (0, express_validator_1.body)('comments').optional().trim(),
    (0, express_validator_1.body)('latitude').optional().isFloat(),
    (0, express_validator_1.body)('longitude').optional().isFloat(),
    (0, express_validator_1.body)('address').optional().trim(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), ticket_controller_1.updateStatusWithLifecycle);
exports.default = router;
