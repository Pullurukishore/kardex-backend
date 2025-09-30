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

// Activity Stage Management Routes
router.post('/:activityId/stages', requireRole(['SERVICE_PERSON']), activityController.createActivityStage);
router.put('/:activityId/stages/:stageId', requireRole(['SERVICE_PERSON']), activityController.updateActivityStage);
router.get('/:activityId/stages', requireRole(['SERVICE_PERSON']), activityController.getActivityStages);

// Get stage templates for activity types
router.get('/templates/:activityType', requireRole(['SERVICE_PERSON']), activityController.getActivityStageTemplates);

export default router;
