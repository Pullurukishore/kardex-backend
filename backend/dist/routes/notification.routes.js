"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationRoutes = exports.router = void 0;
exports.setupNotificationWebSocket = setupNotificationWebSocket;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const validate_request_1 = require("../middleware/validate-request");
const websocket_service_1 = require("../services/websocket.service");
const notification_controller_1 = require("../controllers/notification.controller");
exports.router = (0, express_1.Router)();
// Apply auth middleware to all routes
exports.router.use((0, auth_1.authMiddleware)(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_ACCOUNT_OWNER']));
// Initialize WebSocket server for real-time notifications
function setupNotificationWebSocket(wss) {
    // WebSocket endpoint for real-time notifications
    wss.on('connection', (ws) => {
        // Set up ping-pong to keep connection alive
        ws.isAlive = true;
        ws.on('pong', () => {
            ws.isAlive = true;
        });
        // Handle authentication when client sends their token
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'AUTH' && data.token) {
                    // Here you would verify the JWT token and get the user ID
                    // For now, we'll just use a placeholder
                    const userId = 1; // Replace with actual user ID from token
                    websocket_service_1.webSocketService.addClient(userId, ws);
                    ws.userId = userId;
                }
            }
            catch (error) {
                console.error('Error handling WebSocket message:', error);
            }
        });
        // Handle client disconnection
        ws.on('close', () => {
            if (ws.userId) {
                websocket_service_1.webSocketService.cleanup();
            }
        });
    });
    // Set up interval to check for dead connections
    const interval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false)
                return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);
    // Clean up interval on server shutdown
    wss.on('close', () => {
        clearInterval(interval);
        websocket_service_1.webSocketService.cleanup();
    });
    return exports.router;
}
;
// Get all notifications for current user
exports.router.get('/', [
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    (0, express_validator_1.query)('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a positive integer'),
    (0, express_validator_1.query)('unreadOnly').optional().isBoolean().withMessage('unreadOnly must be a boolean'),
    validate_request_1.validateRequest
], notification_controller_1.getNotifications);
// Get unread notification count
exports.router.get('/unread-count', notification_controller_1.getUnreadCount);
// Mark notification as read
exports.router.post('/:id/read', [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid notification ID'),
    validate_request_1.validateRequest
], notification_controller_1.markAsRead);
// Mark all notifications as read
exports.router.post('/read-all', notification_controller_1.markAllAsRead);
// Delete notification
exports.router.delete('/:id', [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid notification ID'),
    validate_request_1.validateRequest
], notification_controller_1.deleteNotification);
// Export the router as notificationRoutes for backward compatibility
exports.notificationRoutes = exports.router;
exports.default = exports.router;
