import { Router } from 'express';
import { getZoneDashboardData, getFSAData } from '../controllers/zone-dashboard.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router = Router();

// Apply auth middleware to all routes
router.use(authenticate);

// Get zone dashboard data
router.get(
  '/',
  requireRole(['ZONE_USER', 'ADMIN', 'SERVICE_PERSON']), // Allow zone users, admins, and service persons
  getZoneDashboardData
);

// Get FSA (Field Service Analytics) data for a specific zone
router.get(
  '/fsa/:zoneId',
  requireRole(['ZONE_USER', 'ADMIN', 'SERVICE_PERSON']),
  getFSAData
);

export default router;
