"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const zone_report_controller_1 = require("../controllers/zone-report.controller");
const router = (0, express_1.Router)();
// Apply authentication middleware to all routes - allow ZONE_USER, ADMIN, and SERVICE_PERSON roles
router.use((0, auth_1.authMiddleware)(['ZONE_USER', 'ADMIN', 'SERVICE_PERSON']));
// Zone dashboard overview
router.get('/:zoneId/dashboard', zone_report_controller_1.getZoneDashboard);
// Ticket analytics
router.get('/:zoneId/status-distribution', zone_report_controller_1.getTicketStatusDistribution);
router.get('/:zoneId/priority-distribution', zone_report_controller_1.getPriorityDistribution);
router.get('/:zoneId/trends', zone_report_controller_1.getTicketTrends);
// Performance metrics
router.get('/:zoneId/customer-performance', zone_report_controller_1.getCustomerPerformance);
router.get('/:zoneId/service-person-performance', zone_report_controller_1.getServicePersonPerformance);
router.get('/:zoneId/asset-performance', zone_report_controller_1.getAssetPerformance);
// SLA and compliance
router.get('/:zoneId/sla-metrics', zone_report_controller_1.getSLAMetrics);
// Activity tracking
router.get('/:zoneId/recent-activities', zone_report_controller_1.getRecentActivities);
// Export functionality
router.get('/:zoneId/export', zone_report_controller_1.exportZoneReport);
exports.default = router;
