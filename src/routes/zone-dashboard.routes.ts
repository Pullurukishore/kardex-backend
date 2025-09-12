import { Router } from 'express';
import { getZoneDashboardData, getFSAData, getZoneInfo, getZoneCustomersAssets, getZoneServicePersons } from '../controllers/zone-dashboard.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router = Router();

// Apply auth middleware to all routes
router.use(authenticate);

// Get lightweight zone info for ticket creation
router.get(
  '/zone-info',
  requireRole(['ZONE_USER', 'ADMIN', 'SERVICE_PERSON']),
  getZoneInfo
);

// Get zone customers and assets for ticket creation
router.get(
  '/customers-assets',
  requireRole(['ZONE_USER', 'ADMIN', 'SERVICE_PERSON']),
  getZoneCustomersAssets
);

// Get zone dashboard data
router.get(
  '/',
  requireRole(['ZONE_USER', 'ADMIN', 'SERVICE_PERSON']), // Allow zone users, admins, and service persons
  getZoneDashboardData
);

// Get FSA (Field Service Analytics) data for a specific zone
router.get(
  '/fsa',
  requireRole(['ZONE_USER', 'ADMIN', 'SERVICE_PERSON']),
  getFSAData
);

// Get service persons for the zone
router.get(
  '/service-persons',
  requireRole(['ZONE_USER', 'ADMIN', 'SERVICE_PERSON']),
  getZoneServicePersons
);

export default router;
