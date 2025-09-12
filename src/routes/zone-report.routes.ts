import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  getZoneDashboard,
  getTicketStatusDistribution,
  getPriorityDistribution,
  getCustomerPerformance,
  getServicePersonPerformance,
  getAssetPerformance,
  getTicketTrends,
  getSLAMetrics,
  getRecentActivities,
  exportZoneReport
} from '../controllers/zone-report.controller';

const router = Router();

// Apply authentication middleware to all routes - allow ZONE_USER, ADMIN, and SERVICE_PERSON roles
router.use(authMiddleware(['ZONE_USER', 'ADMIN', 'SERVICE_PERSON']));

// Zone dashboard overview
router.get('/:zoneId/dashboard', getZoneDashboard);

// Ticket analytics
router.get('/:zoneId/status-distribution', getTicketStatusDistribution);
router.get('/:zoneId/priority-distribution', getPriorityDistribution);
router.get('/:zoneId/trends', getTicketTrends);

// Performance metrics
router.get('/:zoneId/customer-performance', getCustomerPerformance);
router.get('/:zoneId/service-person-performance', getServicePersonPerformance);
router.get('/:zoneId/asset-performance', getAssetPerformance);

// SLA and compliance
router.get('/:zoneId/sla-metrics', getSLAMetrics);

// Activity tracking
router.get('/:zoneId/recent-activities', getRecentActivities);

// Export functionality
router.get('/:zoneId/export', exportZoneReport);

export default router;