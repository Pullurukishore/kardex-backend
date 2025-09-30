"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const customer_controller_1 = require("../controllers/customer.controller");
const asset_controller_1 = require("../controllers/asset.controller");
const contact_routes_1 = __importDefault(require("./contact.routes"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const customer_middleware_1 = require("../middleware/customer.middleware");
const validate_request_1 = require("../middleware/validate-request");
const router = (0, express_1.Router)();
// Apply auth middleware to all routes
router.use(auth_middleware_1.authenticate);
// Nested contact routes
router.use('/:id/contacts', contact_routes_1.default);
// Get all customers with pagination and search
router.get('/', [
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    (0, express_validator_1.query)('search').optional().trim(),
    validate_request_1.validateRequest
], customer_middleware_1.canViewCustomers, customer_controller_1.listCustomers);
// Get customer by ID
router.get('/:id', [
    // Add validation for ID if needed
    validate_request_1.validateRequest
], customer_middleware_1.canViewCustomers, customer_controller_1.getCustomer);
// Create a new customer
router.post('/', [
    (0, express_validator_1.body)('companyName').trim().notEmpty().withMessage('Company name is required'),
    (0, express_validator_1.body)('address').optional().trim(),
    (0, express_validator_1.body)('industry').optional().trim(),
    (0, express_validator_1.body)('timezone').optional().trim(),
    (0, express_validator_1.body)('serviceZoneId').optional().isInt().toInt(),
    (0, express_validator_1.body)('isActive').optional().isBoolean(),
    validate_request_1.validateRequest
], customer_middleware_1.canManageCustomers, customer_controller_1.createCustomer);
// Create asset for a specific customer
router.post('/:id/assets', [
    (0, express_validator_1.body)('machineId').trim().notEmpty().withMessage('Machine ID is required'),
    (0, express_validator_1.body)('model').optional().trim(),
    (0, express_validator_1.body)('serialNo').optional().trim(),
    (0, express_validator_1.body)('purchaseDate').optional().isISO8601().withMessage('Invalid purchase date format'),
    (0, express_validator_1.body)('warrantyStart').optional().isISO8601().withMessage('Invalid warranty start date format'),
    (0, express_validator_1.body)('warrantyEnd').optional().isISO8601().withMessage('Invalid warranty end date format'),
    (0, express_validator_1.body)('amcStart').optional().isISO8601().withMessage('Invalid AMC start date format'),
    (0, express_validator_1.body)('amcEnd').optional().isISO8601().withMessage('Invalid AMC end date format'),
    (0, express_validator_1.body)('location').optional().trim(),
    (0, express_validator_1.body)('status').optional().isIn(['ACTIVE', 'MAINTENANCE', 'INACTIVE']).withMessage('Invalid status'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'ZONE_USER']), (req, res, next) => {
    // Set the customerId from the URL parameter
    req.body.customerId = parseInt(req.params.id);
    next();
}, asset_controller_1.createAsset);
// Update customer
router.put('/:id', [
    (0, express_validator_1.body)('companyName').optional().trim().notEmpty().withMessage('Company name cannot be empty'),
    (0, express_validator_1.body)('address').optional().trim(),
    (0, express_validator_1.body)('industry').optional().trim(),
    (0, express_validator_1.body)('timezone').optional().trim(),
    (0, express_validator_1.body)('serviceZoneId').optional().isInt().toInt(),
    (0, express_validator_1.body)('isActive').optional().isBoolean(),
    validate_request_1.validateRequest
], customer_middleware_1.canManageCustomers, customer_controller_1.updateCustomer);
// Delete customer
router.delete('/:id', [
    // Add validation for ID if needed
    validate_request_1.validateRequest
], customer_middleware_1.canManageCustomers, customer_controller_1.deleteCustomer);
exports.default = router;
