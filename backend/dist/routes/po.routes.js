"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const purchaseOrder_controller_1 = require("../controllers/purchaseOrder.controller");
const auth_1 = require("../middleware/auth");
const express_validator_1 = require("express-validator");
const validate_request_1 = require("../middleware/validate-request");
const router = (0, express_1.Router)();
// Apply auth middleware to all routes
router.use((0, auth_1.authMiddleware)(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_ACCOUNT_OWNER']));
// Create a new purchase order
router.post('/', [
    (0, express_validator_1.body)('ticketId').isInt().withMessage('Valid ticket ID is required'),
    (0, express_validator_1.body)('items').isArray({ min: 1 }).withMessage('At least one item is required'),
    (0, express_validator_1.body)('items.*.description').trim().notEmpty().withMessage('Item description is required'),
    (0, express_validator_1.body)('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    (0, express_validator_1.body)('items.*.unitPrice').isFloat({ min: 0 }).withMessage('Unit price must be a positive number'),
    (0, express_validator_1.body)('notes').optional().trim(),
    validate_request_1.validateRequest
], purchaseOrder_controller_1.createPO);
// Get all purchase orders with filters
router.get('/', [
    (0, express_validator_1.query)('status').optional().isIn([
        'DRAFT',
        'PENDING_APPROVAL',
        'APPROVED',
        'REJECTED',
        'ORDERED',
        'RECEIVED',
        'CANCELLED'
    ]),
    (0, express_validator_1.query)('ticketId').optional().isInt(),
    (0, express_validator_1.query)('customerId').optional().isInt(),
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    validate_request_1.validateRequest
], purchaseOrder_controller_1.getPOs);
// Get purchase order by ID
router.get('/:id', [
    (0, express_validator_1.param)('id').isInt().withMessage('Valid PO ID is required'),
    validate_request_1.validateRequest
], purchaseOrder_controller_1.getPO);
// Update PO status
router.patch('/:id/status', [
    (0, express_validator_1.param)('id').isInt().withMessage('Valid PO ID is required'),
    (0, express_validator_1.body)('status').isIn([
        'PENDING_APPROVAL',
        'APPROVED',
        'REJECTED',
        'ORDERED',
        'RECEIVED',
        'CANCELLED'
    ]).withMessage('Invalid status'),
    (0, express_validator_1.body)('comments').optional().trim(),
    validate_request_1.validateRequest
], purchaseOrder_controller_1.updatePOStatus);
// Add item to PO
router.post('/:id/items', [
    (0, express_validator_1.param)('id').isInt().withMessage('Valid PO ID is required'),
    (0, express_validator_1.body)('description').trim().notEmpty().withMessage('Item description is required'),
    (0, express_validator_1.body)('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    (0, express_validator_1.body)('unitPrice').isFloat({ min: 0 }).withMessage('Unit price must be a positive number'),
    validate_request_1.validateRequest
], purchaseOrder_controller_1.addPOItem);
exports.default = router;
