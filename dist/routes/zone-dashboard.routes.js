"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zone_dashboard_controller_1 = require("../controllers/zone-dashboard.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Apply auth middleware to all routes
router.use(auth_middleware_1.authenticate);
// Get lightweight zone info for ticket creation
router.get('/zone-info', (0, auth_middleware_1.requireRole)(['ZONE_USER', 'ADMIN', 'SERVICE_PERSON']), zone_dashboard_controller_1.getZoneInfo);
// Get zone customers and assets for ticket creation
router.get('/customers-assets', (0, auth_middleware_1.requireRole)(['ZONE_USER', 'ADMIN', 'SERVICE_PERSON']), zone_dashboard_controller_1.getZoneCustomersAssets);
// Get zone dashboard data
router.get('/', (0, auth_middleware_1.requireRole)(['ZONE_USER', 'ADMIN', 'SERVICE_PERSON']), // Allow zone users, admins, and service persons
zone_dashboard_controller_1.getZoneDashboardData);
// Get FSA (Field Service Analytics) data for a specific zone
router.get('/fsa', (0, auth_middleware_1.requireRole)(['ZONE_USER', 'ADMIN', 'SERVICE_PERSON']), zone_dashboard_controller_1.getFSAData);
// Get service persons for the zone
router.get('/service-persons', (0, auth_middleware_1.requireRole)(['ZONE_USER', 'ADMIN', 'SERVICE_PERSON']), zone_dashboard_controller_1.getZoneServicePersons);
exports.default = router;
