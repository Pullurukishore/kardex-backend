"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribeToNotifications = exports.getUnreadCount = exports.deleteNotification = exports.markAllAsRead = exports.markAsRead = exports.getNotifications = exports.createNotification = exports.setWebSocketServer = void 0;
const db_1 = __importDefault(require("../config/db"));
const email_service_1 = require("../services/email.service");
// WebSocket server for real-time notifications
let wss = null;
const setWebSocketServer = (server) => {
    wss = server;
};
exports.setWebSocketServer = setWebSocketServer;
// Helper to broadcast notifications to connected clients
const broadcastNotification = (userId, notification) => {
    if (!wss)
        return;
    // Use Array.from() to properly type the clients
    const clients = Array.from(wss.clients);
    clients.forEach((client) => {
        if (client.userId === userId && client.readyState === 1) {
            client.send(JSON.stringify({
                type: 'NOTIFICATION',
                data: notification
            }));
        }
    });
};
// Create a new notification
const createNotification = async ({ userId, type, title, message, data = {}, sendEmailNotification = true }) => {
    try {
        // Create notification in database
        const notification = await db_1.default.notification.create({
            data: {
                userId,
                type,
                title,
                message,
                data,
                status: 'UNREAD'
            }
        });
        // Broadcast to WebSocket clients
        broadcastNotification(userId, notification);
        // Send email notification if enabled
        if (sendEmailNotification) {
            try {
                // Get user email and use a default name since firstName/lastName aren't in the schema
                const user = await db_1.default.user.findUnique({
                    where: { id: userId },
                    select: {
                        email: true
                    }
                });
                if (user?.email) {
                    // Use the part before @ in email as the name, or fallback to 'there'
                    const nameFromEmail = user.email.split('@')[0] || 'there';
                    await (0, email_service_1.sendEmail)({
                        to: user.email,
                        subject: title,
                        template: 'notification',
                        context: {
                            name: nameFromEmail,
                            title,
                            message,
                            ...data
                        }
                    });
                }
            }
            catch (error) {
                console.error('Error sending notification email:', error);
                // Continue without failing the entire notification
            }
        }
        return notification;
    }
    catch (error) {
        console.error('Error creating notification:', error);
        return null;
    }
};
exports.createNotification = createNotification;
// Get all notifications for current user
const getNotifications = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { limit = '10', offset = '0', unreadOnly } = req.query;
        const where = {
            userId: Number(userId),
            ...(unreadOnly === 'true' ? { status: 'UNREAD' } : {})
        };
        const notifications = await db_1.default.notification.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit, 10) || 10,
            skip: parseInt(offset, 10) || 0
        });
        const total = await db_1.default.notification.count({ where });
        return res.json({
            data: notifications,
            pagination: {
                total,
                limit: parseInt(limit, 10) || 10,
                offset: parseInt(offset, 10) || 0,
                hasMore: (parseInt(offset, 10) || 0) + notifications.length < total
            }
        });
    }
    catch (error) {
        console.error('Error getting notifications:', error);
        return res.status(500).json({ error: 'Failed to get notifications' });
    }
};
exports.getNotifications = getNotifications;
// Mark notification as read
const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        // Check if notification exists and belongs to user
        const notification = await db_1.default.notification.findFirst({
            where: {
                id: Number(id),
                userId: Number(userId)
            }
        });
        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        // Update notification
        const updatedNotification = await db_1.default.notification.update({
            where: { id: Number(id) },
            data: {
                readAt: new Date(),
                status: 'READ' // Also update status to READ
            }
        });
        return res.json(updatedNotification);
    }
    catch (error) {
        console.error('Error marking notification as read:', error);
        return res.status(500).json({ error: 'Failed to update notification' });
    }
};
exports.markAsRead = markAsRead;
// Mark all notifications as read
const markAllAsRead = async (req, res) => {
    try {
        const userId = req.user?.id;
        await db_1.default.notification.updateMany({
            where: { userId, readAt: null }, // Using readAt instead of isRead
            data: { readAt: new Date() } // Only set readAt, remove isRead
        });
        return res.json({ success: true });
    }
    catch (error) {
        console.error('Error marking all notifications as read:', error);
        return res.status(500).json({ error: 'Failed to update notifications' });
    }
};
exports.markAllAsRead = markAllAsRead;
// Delete notification
const deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        // Check if notification exists and belongs to user
        const notification = await db_1.default.notification.findFirst({
            where: {
                id: Number(id),
                userId: Number(userId)
            }
        });
        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        // Delete notification
        await db_1.default.notification.delete({
            where: { id: Number(id) }
        });
        return res.status(204).send();
    }
    catch (error) {
        console.error('Error deleting notification:', error);
        return res.status(500).json({ error: 'Failed to delete notification' });
    }
};
exports.deleteNotification = deleteNotification;
// Get unread notification count
const getUnreadCount = async (req, res) => {
    try {
        const userId = req.user?.id;
        const count = await db_1.default.notification.count({
            where: {
                userId: Number(userId), // Convert userId to number
                readAt: null // Use readAt instead of isRead
            }
        });
        return res.json({ count });
    }
    catch (error) {
        console.error('Error getting unread count:', error);
        return res.status(500).json({ error: 'Failed to get unread count' });
    }
};
exports.getUnreadCount = getUnreadCount;
// Subscribe to real-time notifications
const subscribeToNotifications = (ws, req) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return ws.close(1008, 'Unauthorized');
        }
        // Store user ID with WebSocket connection
        ws.userId = Number(userId); // Convert userId to number
        // Send initial unread count
        const mockResponse = {
            json: (data) => {
                ws.send(JSON.stringify({
                    type: 'UNREAD_COUNT',
                    data: data.count
                }));
            },
            status: () => ({
                json: () => { }
            })
        };
        void (0, exports.getUnreadCount)(req, mockResponse);
        ws.on('close', () => {
            console.log(`Client ${userId} disconnected`);
        });
    }
    catch (error) {
        console.error('Error in WebSocket connection:', error);
        ws.close(1011, 'Internal Server Error');
    }
};
exports.subscribeToNotifications = subscribeToNotifications;
