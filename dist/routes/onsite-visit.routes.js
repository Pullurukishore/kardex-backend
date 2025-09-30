"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const onsite_visit_controller_1 = require("../controllers/onsite-visit.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_request_1 = require("../middleware/validate-request");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
const coordinateValidators = [
    (0, express_validator_1.body)('ticketId').exists().withMessage('ticketId is required').isInt().toInt(),
    (0, express_validator_1.body)('latitude').exists().withMessage('latitude is required').isFloat({ min: -90, max: 90 }).toFloat(),
    (0, express_validator_1.body)('longitude').exists().withMessage('longitude is required').isFloat({ min: -180, max: 180 }).toFloat(),
    validate_request_1.validateRequest
];
router.post('/start', coordinateValidators, (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), onsite_visit_controller_1.startOnsiteVisit);
router.post('/reach', coordinateValidators, (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), onsite_visit_controller_1.reachOnsiteVisit);
router.post('/end', coordinateValidators, (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), onsite_visit_controller_1.endOnsiteVisit);
router.post('/back', coordinateValidators, (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), onsite_visit_controller_1.backOnsiteVisit);
exports.default = router;
