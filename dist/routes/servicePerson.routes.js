"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const servicePerson_controller_1 = require("../controllers/servicePerson.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_request_1 = require("../middleware/validate-request");
const express_validator_1 = require("express-validator");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
// Get all service persons
router.get('/', (0, auth_middleware_1.requireRole)(['ADMIN', 'ZONE_USER', 'SERVICE_PERSON']), servicePerson_controller_1.listServicePersons);
// Get a specific service person
router.get('/:id', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid service person ID'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'ZONE_USER']), servicePerson_controller_1.getServicePerson);
// Create a new service person
router.post('/', [
    (0, express_validator_1.body)('name').optional().trim().notEmpty().withMessage('Name cannot be empty if provided'),
    (0, express_validator_1.body)('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('phone').optional().isMobilePhone('any').withMessage('Please provide a valid phone number'),
    (0, express_validator_1.body)('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    (0, express_validator_1.body)('serviceZoneIds').optional().isArray().withMessage('serviceZoneIds must be an array'),
    (0, express_validator_1.body)('serviceZoneIds.*').optional().isInt().withMessage('Each service zone ID must be an integer'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'ZONE_USER']), servicePerson_controller_1.createServicePerson);
// Update a service person
router.put('/:id', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid service person ID'),
    (0, express_validator_1.body)('email').optional().isEmail().normalizeEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    (0, express_validator_1.body)('serviceZoneIds').optional().isArray().withMessage('serviceZoneIds must be an array'),
    (0, express_validator_1.body)('serviceZoneIds.*').optional().isInt().withMessage('Each service zone ID must be an integer'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'ZONE_USER']), servicePerson_controller_1.updateServicePerson);
// Delete a service person
router.delete('/:id', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid service person ID'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'ZONE_USER']), servicePerson_controller_1.deleteServicePerson);
exports.default = router;
