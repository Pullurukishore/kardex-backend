import { Router } from 'express';
import { activityController } from '../controllers/activityController';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router = Router();

// All activity routes require authentication
router.use(authenticate);

// Create activity
router.post('/', requireRole(['SERVICE_PERSON']), activityController.createActivity);

// Update activity
router.put('/:id', requireRole(['SERVICE_PERSON']), activityController.updateActivity);

// Get activities
router.get('/', requireRole(['SERVICE_PERSON']), activityController.getActivities);

// Get activity statistics
router.get('/stats', requireRole(['SERVICE_PERSON']), activityController.getActivityStats);

export default router;
