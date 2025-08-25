"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const contact_controller_1 = require("../controllers/contact.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_request_1 = require("../middleware/validate-request");
const router = (0, express_1.Router)();
// Apply auth middleware to all routes
router.use(auth_middleware_1.authenticate);
// Get all contacts with pagination and search (Admin only)
router.get('/', [
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    (0, express_validator_1.query)('search').optional().trim(),
    (0, express_validator_1.query)('customerId').optional().isInt().toInt(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN']), (async (req, res) => {
    await (0, contact_controller_1.listAllContacts)(req, res);
}));
// Get contact by ID
router.get('/:id', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid contact ID'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN']), (async (req, res) => {
    await (0, contact_controller_1.getContactById)(req, res);
}));
// Create a new contact
router.post('/', [
    (0, express_validator_1.body)('name').trim().notEmpty().withMessage('Name is required'),
    (0, express_validator_1.body)('email').isEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('customerId').isInt().toInt().withMessage('Valid customer ID is required'),
    (0, express_validator_1.body)('phone').optional().trim(),
    (0, express_validator_1.body)('role').optional().isIn(['ACCOUNT_OWNER', 'CONTACT']).withMessage('Invalid role'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN']), (async (req, res) => {
    await (0, contact_controller_1.createContactAdmin)(req, res);
}));
// Update contact
router.put('/:id', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid contact ID'),
    (0, express_validator_1.body)('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    (0, express_validator_1.body)('email').optional().isEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('customerId').optional().isInt().toInt().withMessage('Valid customer ID is required'),
    (0, express_validator_1.body)('phone').optional().trim(),
    (0, express_validator_1.body)('role').optional().isIn(['ACCOUNT_OWNER', 'CONTACT']).withMessage('Invalid role'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN']), (async (req, res) => {
    await (0, contact_controller_1.updateContactAdmin)(req, res);
}));
// Delete contact
router.delete('/:id', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid contact ID'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN']), (async (req, res) => {
    await (0, contact_controller_1.deleteContactAdmin)(req, res);
}));
exports.default = router;
