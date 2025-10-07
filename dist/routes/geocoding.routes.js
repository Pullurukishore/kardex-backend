"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const geocoding_controller_1 = require("../controllers/geocoding.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_request_1 = require("../middleware/validate-request");
const router = (0, express_1.Router)();
// Reverse geocode coordinates to address with validation
router.get('/reverse', auth_middleware_1.authenticate, [
    (0, express_validator_1.query)('latitude')
        .isFloat({ min: -90, max: 90 })
        .withMessage('Latitude must be a valid number between -90 and 90'),
    (0, express_validator_1.query)('longitude')
        .isFloat({ min: -180, max: 180 })
        .withMessage('Longitude must be a valid number between -180 and 180'),
    (0, express_validator_1.query)('accuracy')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Accuracy must be a positive number'),
    (0, express_validator_1.query)('source')
        .optional()
        .isIn(['gps', 'manual', 'network'])
        .withMessage('Source must be one of: gps, manual, network'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), geocoding_controller_1.reverseGeocode);
// Validate location jump detection
router.post('/validate-jump', auth_middleware_1.authenticate, [
    (0, express_validator_1.body)('previousLocation.latitude')
        .isFloat({ min: -90, max: 90 })
        .withMessage('Previous latitude must be a valid number between -90 and 90'),
    (0, express_validator_1.body)('previousLocation.longitude')
        .isFloat({ min: -180, max: 180 })
        .withMessage('Previous longitude must be a valid number between -180 and 180'),
    (0, express_validator_1.body)('newLocation.latitude')
        .isFloat({ min: -90, max: 90 })
        .withMessage('New latitude must be a valid number between -90 and 90'),
    (0, express_validator_1.body)('newLocation.longitude')
        .isFloat({ min: -180, max: 180 })
        .withMessage('New longitude must be a valid number between -180 and 180'),
    (0, express_validator_1.body)('maxSpeed')
        .optional()
        .isFloat({ min: 0, max: 1000 })
        .withMessage('Max speed must be between 0 and 1000 km/h'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), geocoding_controller_1.validateLocationJump);
exports.default = router;
