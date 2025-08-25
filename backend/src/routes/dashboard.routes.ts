import { Router } from 'express';
import { query } from 'express-validator';
import { 
  getDashboardData,
  getTicketStatusDistribution,
  getTicketTrends,
  getAdminStats,
  getRecentTickets
} from '../controllers/dashboard.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate-request';

const router = Router();

// Apply auth middleware to all routes
router.use(authenticate);

// Get dashboard data based on user role
router.get(
  '/',
  validateRequest,
  requireRole(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_OWNER']),
  getDashboardData
);

// Get admin-specific stats (ADMIN only)
router.get(
  '/admin-stats',
  validateRequest,
  requireRole(['ADMIN']),
  getAdminStats
);

// Get recent tickets
router.get(
  '/recent-tickets',
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50')
      .toInt(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_OWNER']),
  getRecentTickets
);

// Get ticket status distribution
router.get(
  '/tickets/status-distribution',
  validateRequest,
  requireRole(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_OWNER']),
  getTicketStatusDistribution
);

// Get ticket trends over time
router.get(
  '/tickets/trends',
  [
    query('days')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Days must be between 1 and 365')
      .toInt(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_OWNER']),
  getTicketTrends
);

export default router;
