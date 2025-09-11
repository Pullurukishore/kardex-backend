import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { UserRole } from '../config/auth';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Get zone dashboard data
router.get(
  '/dashboard',
  requireRole([UserRole.ZONE_USER, UserRole.ADMIN, UserRole.SERVICE_PERSON]),
  (req, res) => {
    // This route is now handled by zone-dashboard.routes.ts
    // Keeping this for backward compatibility
    res.redirect('/api/zone-dashboard');
  }
);

export default router;
