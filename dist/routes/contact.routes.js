"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const contact_controller_1 = require("../controllers/contact.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const customer_middleware_1 = require("../middleware/customer.middleware");
const validate_request_1 = require("../middleware/validate-request");
const router = (0, express_1.Router)({ mergeParams: true });
// Apply auth middleware to all routes
router.use(auth_middleware_1.authenticate);
// Get all contacts for a customer with pagination and search
router.get('/', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid customer ID'),
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    (0, express_validator_1.query)('search').optional().trim(),
    validate_request_1.validateRequest
], contact_controller_1.listContacts);
// Get contact by ID
router.get('/:contactId', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid customer ID'),
    (0, express_validator_1.param)('contactId').isInt().toInt().withMessage('Invalid contact ID'),
    validate_request_1.validateRequest
], contact_controller_1.getContact);
// Create a new contact for a customer
router.post('/', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid customer ID'),
    (0, express_validator_1.body)('name').trim().notEmpty().withMessage('Name is required'),
    (0, express_validator_1.body)('email').optional().isEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('phone').trim().notEmpty().withMessage('Phone is required'),
    (0, express_validator_1.body)('role').optional().isIn(['ACCOUNT_OWNER', 'CONTACT']).withMessage('Invalid role'),
    (0, express_validator_1.body)('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    validate_request_1.validateRequest
], customer_middleware_1.canManageContacts, contact_controller_1.createContact);
// Update a contact
router.put('/:contactId', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid customer ID'),
    (0, express_validator_1.param)('contactId').isInt().toInt().withMessage('Invalid contact ID'),
    (0, express_validator_1.body)('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    (0, express_validator_1.body)('email').optional().isEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('phone').optional().trim(),
    (0, express_validator_1.body)('role').optional().isIn(['ACCOUNT_OWNER', 'CONTACT']).withMessage('Invalid role'),
    validate_request_1.validateRequest
], customer_middleware_1.canManageContacts, contact_controller_1.updateContact);
// Delete a contact
router.delete('/:contactId', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid customer ID'),
    (0, express_validator_1.param)('contactId').isInt().toInt().withMessage('Invalid contact ID'),
    validate_request_1.validateRequest
], customer_middleware_1.canManageContacts, contact_controller_1.deleteContact);
exports.default = router;
