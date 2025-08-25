"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const dashboard_controller_1 = require("../controllers/dashboard.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_request_1 = require("../middleware/validate-request");
const router = (0, express_1.Router)();
// Apply auth middleware to all routes
router.use(auth_middleware_1.authenticate);
// Get dashboard data based on user role
router.get('/', validate_request_1.validateRequest, (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_ACCOUNT_OWNER']), dashboard_controller_1.getDashboardData);
// Get admin-specific stats (ADMIN only)
router.get('/admin-stats', validate_request_1.validateRequest, (0, auth_middleware_1.requireRole)(['ADMIN']), dashboard_controller_1.getAdminStats);
// Get recent tickets
router.get('/recent-tickets', [
    (0, express_validator_1.query)('limit')
        .optional()
        .isInt({ min: 1, max: 50 })
        .withMessage('Limit must be between 1 and 50')
        .toInt(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_ACCOUNT_OWNER']), dashboard_controller_1.getRecentTickets);
// Get ticket status distribution
router.get('/tickets/status-distribution', validate_request_1.validateRequest, (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_ACCOUNT_OWNER']), dashboard_controller_1.getTicketStatusDistribution);
// Get ticket trends over time
router.get('/tickets/trends', [
    (0, express_validator_1.query)('days')
        .optional()
        .isInt({ min: 1, max: 365 })
        .withMessage('Days must be between 1 and 365')
        .toInt(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_ACCOUNT_OWNER']), dashboard_controller_1.getTicketTrends);
exports.default = router;
