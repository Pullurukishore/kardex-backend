"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const ticket_controller_1 = require("../controllers/ticket.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_request_1 = require("../middleware/validate-request");
const router = (0, express_1.Router)();
// Apply auth middleware to all routes
router.use(auth_middleware_1.authenticate);
// Create a new ticket
router.post('/', [
    (0, express_validator_1.body)('title').trim().notEmpty().withMessage('Title is required'),
    (0, express_validator_1.body)('description').trim().notEmpty().withMessage('Description is required'),
    (0, express_validator_1.body)('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).withMessage('Invalid priority'),
    (0, express_validator_1.body)('customerId').optional().isInt().toInt(),
    (0, express_validator_1.body)('machineId').optional().isInt().toInt(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_ACCOUNT_OWNER']), ticket_controller_1.createTicket);
// Get tickets with filters
router.get('/', [
    (0, express_validator_1.query)('status').optional().isIn(['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED', 'CANCELLED']),
    (0, express_validator_1.query)('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_ACCOUNT_OWNER']), ticket_controller_1.getTickets);
// Get ticket by ID
router.get('/:id', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_ACCOUNT_OWNER']), ticket_controller_1.getTicket);
// Update ticket status
router.patch('/:id/status', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.body)('status')
        .isIn(['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED', 'CANCELLED'])
        .withMessage('Invalid status'),
    (0, express_validator_1.body)('comments').optional().trim(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON']), ticket_controller_1.updateStatus);
// Add comment to ticket
router.post('/:id/comments', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid ticket ID'),
    (0, express_validator_1.body)('content').trim().notEmpty().withMessage('Comment content is required'),
    (0, express_validator_1.body)('isInternal').optional().isBoolean().withMessage('isInternal must be a boolean'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_ACCOUNT_OWNER']), ticket_controller_1.addComment);
exports.default = router;
