"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const serviceZone_controller_1 = require("../controllers/serviceZone.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_request_1 = require("../middleware/validate-request");
const router = (0, express_1.Router)();
// Apply auth middleware to all routes
router.use(auth_middleware_1.authenticate);
// Get all service zones with pagination and search
router.get('/', [
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    (0, express_validator_1.query)('search').optional().trim(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), (req, res) => (0, serviceZone_controller_1.listServiceZones)(req, res));
// Get service zone by ID
router.get('/:id', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid service zone ID'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), (req, res) => (0, serviceZone_controller_1.getServiceZone)(req, res));
// Get service zone statistics
router.get('/:id/stats', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid service zone ID'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), (req, res) => (0, serviceZone_controller_1.getServiceZoneStats)(req, res));
// Create a new service zone (Admin only)
router.post('/', [
    (0, express_validator_1.body)('name').trim().notEmpty().withMessage('Name is required'),
    (0, express_validator_1.body)('description').optional().trim(),
    (0, express_validator_1.body)('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN']), (req, res) => (0, serviceZone_controller_1.createServiceZone)(req, res));
// Update a service zone (Admin only)
router.put('/:id', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid service zone ID'),
    (0, express_validator_1.body)('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    (0, express_validator_1.body)('description').optional().trim(),
    (0, express_validator_1.body)('city').optional().trim().notEmpty().withMessage('City cannot be empty'),
    (0, express_validator_1.body)('state').optional().trim().notEmpty().withMessage('State cannot be empty'),
    (0, express_validator_1.body)('country').optional().trim().notEmpty().withMessage('Country cannot be empty'),
    (0, express_validator_1.body)('status').optional().isIn(['ACTIVE', 'INACTIVE']).withMessage('Invalid status'),
    (0, express_validator_1.body)('servicePersonIds').optional().isArray().withMessage('servicePersonIds must be an array'),
    (0, express_validator_1.body)('servicePersonIds.*').optional().isInt().withMessage('Each service person ID must be an integer'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN']), (req, res) => (0, serviceZone_controller_1.updateServiceZone)(req, res));
// Delete a service zone (Admin only)
router.delete('/:id', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid service zone ID'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN']), (req, res) => (0, serviceZone_controller_1.deleteServiceZone)(req, res));
exports.default = router;
