"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const complaint_controller_1 = require("../controllers/complaint.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const express_validator_1 = require("express-validator");
const validate_request_1 = require("../middleware/validate-request");
const router = (0, express_1.Router)();
// Create a new complaint/ticket
router.post('/complaints', [
    (0, express_validator_1.body)('title').trim().notEmpty().withMessage('Title is required'),
    (0, express_validator_1.body)('description').trim().notEmpty().withMessage('Description is required'),
    (0, express_validator_1.body)('priority').isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).withMessage('Invalid priority'),
    (0, express_validator_1.body)('assetId').optional().isInt().toInt(),
    (0, express_validator_1.body)('customerId').optional().isInt().toInt(),
    validate_request_1.validateRequest
], auth_middleware_1.authenticate, (0, auth_middleware_1.requireRole)(['CUSTOMER_ACCOUNT_OWNER', 'CUSTOMER_CONTACT', 'SERVICE_PERSON', 'ADMIN']), complaint_controller_1.createComplaint);
// Update ticket status
router.patch('/tickets/:id/status', [
    (0, express_validator_1.body)('status').isIn([
        'WAITING_FOR_RESPONSE',
        'OPEN',
        'IN_PROGRESS',
        'SPARE_NEEDED',
        'WAITING_FOR_PO',
        'FIXED_PENDING_CLOSURE',
        'CLOSED'
    ]).withMessage('Invalid status'),
    (0, express_validator_1.body)('note').optional().isString(),
    validate_request_1.validateRequest
], auth_middleware_1.authenticate, (0, auth_middleware_1.requireRole)(['CUSTOMER_ACCOUNT_OWNER', 'CUSTOMER_CONTACT', 'SERVICE_PERSON', 'ADMIN']), complaint_controller_1.updateTicketStatus);
exports.default = router;
