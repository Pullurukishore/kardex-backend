"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const customer_controller_1 = require("../controllers/customer.controller");
const contact_routes_1 = __importDefault(require("./contact.routes"));
const auth_middleware_1 = require("../middleware/auth.middleware");
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
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON']), (async (req, res) => {
    await (0, customer_controller_1.listCustomers)(req, res);
}));
// Get customer by ID
router.get('/:id', [
    // Add validation for ID if needed
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON']), (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    const authReq = req;
    return (0, customer_controller_1.getCustomer)(authReq, res).catch(next);
});
// Create a new customer
router.post('/', [
    (0, express_validator_1.body)('companyName').trim().notEmpty().withMessage('Company name is required'),
    (0, express_validator_1.body)('contactPerson').trim().notEmpty().withMessage('Contact person is required'),
    (0, express_validator_1.body)('email').isEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('phone').trim().notEmpty().withMessage('Phone number is required'),
    (0, express_validator_1.body)('address').optional().trim(),
    (0, express_validator_1.body)('city').optional().trim(),
    (0, express_validator_1.body)('state').optional().trim(),
    (0, express_validator_1.body)('country').optional().trim(),
    (0, express_validator_1.body)('postalCode').optional().trim(),
    (0, express_validator_1.body)('taxId').optional().trim(),
    (0, express_validator_1.body)('notes').optional().trim(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN']), (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    const authReq = req;
    return (0, customer_controller_1.createCustomer)(authReq, res).catch(next);
});
// Update customer
router.put('/:id', [
    (0, express_validator_1.body)('companyName').optional().trim().notEmpty().withMessage('Company name cannot be empty'),
    (0, express_validator_1.body)('contactPerson').optional().trim().notEmpty().withMessage('Contact person cannot be empty'),
    (0, express_validator_1.body)('email').optional().isEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('phone').optional().trim().notEmpty().withMessage('Phone number cannot be empty'),
    (0, express_validator_1.body)('address').optional().trim(),
    (0, express_validator_1.body)('city').optional().trim(),
    (0, express_validator_1.body)('state').optional().trim(),
    (0, express_validator_1.body)('country').optional().trim(),
    (0, express_validator_1.body)('postalCode').optional().trim(),
    (0, express_validator_1.body)('taxId').optional().trim(),
    (0, express_validator_1.body)('notes').optional().trim(),
    (0, express_validator_1.body)('status').optional().isIn(['ACTIVE', 'INACTIVE']).withMessage('Invalid status'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN']), (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    return (0, customer_controller_1.updateCustomer)(req, res).catch(next);
});
// Delete customer
router.delete('/:id', [
    // Add validation for ID if needed
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN']), (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    return (0, customer_controller_1.deleteCustomer)(req, res).catch(next);
});
exports.default = router;
