"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markSingleAsRead = exports.markAsRead = exports.getUnreadCount = exports.getNotifications = void 0;
const notification_service_1 = require("../services/notification.service");
// Get user notifications with pagination
const getNotifications = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '20');
        const status = req.query.status;
        const result = await notification_service_1.NotificationService.getUserNotifications(user.id, page, limit, status);
        res.json(result);
    }
    catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Error fetching notifications' });
    }
};
exports.getNotifications = getNotifications;
// Get unread notifications count
const getUnreadCount = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const count = await notification_service_1.NotificationService.getUnreadCount(user.id);
        res.json({ count });
    }
    catch (error) {
        console.error('Error fetching unread count:', error);
        res.status(500).json({ error: 'Error fetching unread count' });
    }
};
exports.getUnreadCount = getUnreadCount;
// Mark notifications as read
const markAsRead = async (req, res) => {
    try {
        const user = req.user;
        const { notificationIds } = req.body;
        if (!user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
            return res.status(400).json({ error: 'Invalid notification IDs' });
        }
        await notification_service_1.NotificationService.markAsRead(notificationIds, user.id);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error marking notifications as read:', error);
        res.status(500).json({ error: 'Error marking notifications as read' });
    }
};
exports.markAsRead = markAsRead;
// Mark single notification as read
const markSingleAsRead = async (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        if (!user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!id) {
            return res.status(400).json({ error: 'Notification ID required' });
        }
        await notification_service_1.NotificationService.markAsRead([parseInt(id)], user.id);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: 'Error marking notification as read' });
    }
};
exports.markSingleAsRead = markSingleAsRead;
