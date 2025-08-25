"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const analytics_controller_1 = require("../controllers/analytics.controller");
const auth_1 = require("../middleware/auth");
const express_validator_1 = require("express-validator");
const validate_request_1 = require("../middleware/validate-request");
const router = (0, express_1.Router)();
// Apply auth middleware to all routes
router.use((0, auth_1.authMiddleware)(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_ACCOUNT_OWNER']));
// Type guard to ensure user is defined
function ensureAuthenticated(req) {
    return !!req.user;
}
// Middleware to ensure user is authenticated and has correct type
const ensureAuth = (req, res, next) => {
    if (!ensureAuthenticated(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};
// Get ticket statistics
router.get('/tickets/stats', [
    (0, express_validator_1.query)('period')
        .optional()
        .isIn(['today', 'yesterday', 'this_week', 'this_month', 'last_month', '30d', '90d'])
        .withMessage('Invalid period'),
    validate_request_1.validateRequest
], ensureAuth, (req, res) => {
    const analyticsReq = req;
    return (0, analytics_controller_1.getTicketStats)(analyticsReq, res);
});
// Get SLA metrics
router.get('/sla-metrics', [
    (0, express_validator_1.query)('period')
        .optional()
        .isIn(['today', 'yesterday', 'this_week', 'this_month', 'last_month', '30d', '90d'])
        .withMessage('Invalid period'),
    validate_request_1.validateRequest
], ensureAuth, (req, res) => {
    const analyticsReq = req;
    return (0, analytics_controller_1.getSlaMetrics)(analyticsReq, res);
});
// Get customer satisfaction metrics
router.get('/customer-satisfaction', [
    (0, express_validator_1.query)('period')
        .optional()
        .isIn(['today', 'yesterday', 'this_week', 'this_month', 'last_month', '30d', '90d'])
        .withMessage('Invalid period'),
    validate_request_1.validateRequest
], ensureAuth, (req, res) => {
    const analyticsReq = req;
    return (0, analytics_controller_1.getCustomerSatisfaction)(analyticsReq, res);
});
exports.default = router;
