"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const auth_1 = require("../config/auth");
const router = (0, express_1.Router)();
// Apply authentication middleware to all routes
router.use(auth_middleware_1.authenticate);
// Get zone dashboard data
router.get('/dashboard', (0, auth_middleware_1.requireRole)([auth_1.UserRole.ZONE_USER, auth_1.UserRole.ADMIN, auth_1.UserRole.SERVICE_PERSON]), (req, res) => {
    // This route is now handled by zone-dashboard.routes.ts
    // Keeping this for backward compatibility
    res.redirect('/api/zone-dashboard');
});
exports.default = router;
