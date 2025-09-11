import { Router } from 'express';
import { query } from 'express-validator';
import { getDashboardData, getStatusDistribution, getTicketTrendsData } from '../controllers/dashboard.controller';
import { exportDashboardReport } from '../controllers/export.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate-request';

const router = Router();

// Apply auth middleware to all routes
router.use(authenticate);

// Get dashboard data based on user role
router.get(
  '/',
  validateRequest,
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  getDashboardData
);

// Get status distribution data
router.get(
  '/status-distribution',
  validateRequest,
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  getStatusDistribution
);

// Get ticket trends data
router.get(
  '/ticket-trends',
  [
    query('days').optional().isInt({ min: 1, max: 365 }).toInt(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  getTicketTrendsData
);

// Export dashboard data as Excel (kept for admin functionality)
router.get(
  '/export',
  [
    query('startDate').optional().isISO8601().toDate(),
    query('endDate').optional().isISO8601().toDate(),
    query('status').optional().isString(),
    query('priority').optional().isString(),
    query('serviceZone').optional().isString(),
    query('servicePerson').optional().isString(),
    validateRequest
  ],
  requireRole(['ADMIN']),
  exportDashboardReport
);

export default router;