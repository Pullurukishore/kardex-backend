import { Router } from 'express';
import { query, param, body } from 'express-validator';
import { 
  getNotifications, 
  getUnreadCount, 
  markAsRead, 
  markSingleAsRead 
} from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate-request';

const router = Router();

// Apply auth middleware to all routes
router.use(authenticate);

// Get all notifications for current user
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('status').optional().isIn(['UNREAD', 'READ', 'ARCHIVED']).withMessage('Invalid status'),
    validateRequest
  ],
  getNotifications
);

// Get unread notification count
router.get('/unread-count', getUnreadCount);

// Mark single notification as read
router.post(
  '/:id/read',
  [
    param('id').isInt().withMessage('Invalid notification ID'),
    validateRequest
  ],
  markSingleAsRead
);

// Mark multiple notifications as read
router.post(
  '/read',
  [
    body('notificationIds').isArray().withMessage('Notification IDs must be an array'),
    body('notificationIds.*').isInt().withMessage('Each notification ID must be an integer'),
    validateRequest
  ],
  markAsRead
);

export default router;
