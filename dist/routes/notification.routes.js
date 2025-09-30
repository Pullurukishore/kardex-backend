"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const notification_controller_1 = require("../controllers/notification.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_request_1 = require("../middleware/validate-request");
const router = (0, express_1.Router)();
// Apply auth middleware to all routes
router.use(auth_middleware_1.authenticate);
// Get all notifications for current user
router.get('/', [
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    (0, express_validator_1.query)('status').optional().isIn(['UNREAD', 'READ', 'ARCHIVED']).withMessage('Invalid status'),
    validate_request_1.validateRequest
], notification_controller_1.getNotifications);
// Get unread notification count
router.get('/unread-count', notification_controller_1.getUnreadCount);
// Mark single notification as read
router.post('/:id/read', [
    (0, express_validator_1.param)('id').isInt().withMessage('Invalid notification ID'),
    validate_request_1.validateRequest
], notification_controller_1.markSingleAsRead);
// Mark multiple notifications as read
router.post('/read', [
    (0, express_validator_1.body)('notificationIds').isArray().withMessage('Notification IDs must be an array'),
    (0, express_validator_1.body)('notificationIds.*').isInt().withMessage('Each notification ID must be an integer'),
    validate_request_1.validateRequest
], notification_controller_1.markAsRead);
exports.default = router;
