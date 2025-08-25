import { Router } from 'express';
import { query, param } from 'express-validator';
import { authMiddleware } from '../middleware/auth';
import { validateRequest } from '../middleware/validate-request';
import { webSocketService } from '../services/websocket.service';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount
} from '../controllers/notification.controller';

export const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_OWNER']));

// Initialize WebSocket server for real-time notifications
export function setupNotificationWebSocket(wss: any) {
  // WebSocket endpoint for real-time notifications
  wss.on('connection', (ws: any) => {
    // Set up ping-pong to keep connection alive
    ws.isAlive = true;
    
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    
    // Handle authentication when client sends their token
    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message);
        if (data.type === 'AUTH' && data.token) {
          // Here you would verify the JWT token and get the user ID
          // For now, we'll just use a placeholder
          const userId = 1; // Replace with actual user ID from token
          webSocketService.addClient(userId, ws);
          ws.userId = userId;
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    });
    
    // Handle client disconnection
    ws.on('close', () => {
      if (ws.userId) {
        webSocketService.cleanup();
      }
    });
  });
  
  // Set up interval to check for dead connections
  const interval = setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);
  
  // Clean up interval on server shutdown
  wss.on('close', () => {
    clearInterval(interval);
    webSocketService.cleanup();
  });
  
  return router;
};

// Get all notifications for current user
router.get(
  '/',
  [
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a positive integer'),
    query('unreadOnly').optional().isBoolean().withMessage('unreadOnly must be a boolean'),
    validateRequest
  ],
  getNotifications
);

// Get unread notification count
router.get('/unread-count', getUnreadCount);

// Mark notification as read
router.post(
  '/:id/read',
  [
    param('id').isUUID().withMessage('Invalid notification ID'),
    validateRequest
  ],
  markAsRead
);

// Mark all notifications as read
router.post('/read-all', markAllAsRead);

// Delete notification
router.delete(
  '/:id',
  [
    param('id').isUUID().withMessage('Invalid notification ID'),
    validateRequest
  ],
  deleteNotification
);

// Export the router as notificationRoutes for backward compatibility
export const notificationRoutes = router;

export default router;
