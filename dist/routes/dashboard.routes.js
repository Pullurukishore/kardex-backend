"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const dashboard_controller_1 = require("../controllers/dashboard.controller");
const export_controller_1 = require("../controllers/export.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_request_1 = require("../middleware/validate-request");
const router = (0, express_1.Router)();
// Apply auth middleware to all routes
router.use(auth_middleware_1.authenticate);
// Get dashboard data based on user role
router.get('/', validate_request_1.validateRequest, (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), dashboard_controller_1.getDashboardData);
// Get status distribution data
router.get('/status-distribution', validate_request_1.validateRequest, (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), dashboard_controller_1.getStatusDistribution);
// Get ticket trends data
router.get('/ticket-trends', [
    (0, express_validator_1.query)('days').optional().isInt({ min: 1, max: 365 }).toInt(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), dashboard_controller_1.getTicketTrendsData);
// Export dashboard data as Excel (kept for admin functionality)
router.get('/export', [
    (0, express_validator_1.query)('startDate').optional().isISO8601().toDate(),
    (0, express_validator_1.query)('endDate').optional().isISO8601().toDate(),
    (0, express_validator_1.query)('status').optional().isString(),
    (0, express_validator_1.query)('priority').optional().isString(),
    (0, express_validator_1.query)('serviceZone').optional().isString(),
    (0, express_validator_1.query)('servicePerson').optional().isString(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN']), export_controller_1.exportDashboardReport);
exports.default = router;
