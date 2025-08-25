"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupWebSocketServer = exports.webSocketService = void 0;
const ws_1 = require("ws");
const db_1 = __importDefault(require("../config/db"));
const client_1 = require("@prisma/client");
const logger_1 = require("../utils/logger");
class WebSocketService {
    ensureNumberUserId(userId) {
        if (typeof userId === 'string') {
            const parsed = parseInt(userId, 10);
            if (isNaN(parsed)) {
                throw new Error(`Invalid user ID: ${userId}`);
            }
            return parsed;
        }
        return userId;
    }
    addClient(userId, ws) {
        const existingClient = this.clients.get(userId);
        if (existingClient) {
            try {
                existingClient.close(1000, 'New connection opened');
            }
            catch (error) {
                logger_1.logger.error(`Error closing existing connection for user ${userId}:`, error);
            }
        }
        ws.userId = userId;
        this.clients.set(userId, ws);
        logger_1.logger.info(`Client connected. Total clients: ${this.clients.size}`);
        ws.isAlive = true;
        ws.on('pong', () => {
            ws.isAlive = true;
        });
        ws.on('close', () => {
            this.removeClient(userId);
        });
        if (this.pingInterval === null) {
            this.startPingInterval();
        }
    }
    removeClient(userId) {
        this.clients.delete(userId);
        logger_1.logger.info(`Client disconnected. Total clients: ${this.clients.size}`);
        if (this.clients.size === 0 && this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }
    startPingInterval() {
        if (this.pingInterval) {
            return;
        }
        const PING_INTERVAL = 30000;
        this.pingInterval = setInterval(() => {
            this.clients.forEach((ws, userId) => {
                if (ws.isAlive === false) {
                    logger_1.logger.warn(`Terminating dead connection for user ${userId}`);
                    ws.terminate();
                    this.clients.delete(userId);
                    return;
                }
                ws.isAlive = false;
                ws.ping(undefined, undefined, (err) => {
                    if (err) {
                        logger_1.logger.error(`Ping error for user ${userId}:`, err);
                        ws.terminate();
                        this.clients.delete(userId);
                    }
                });
            });
        }, PING_INTERVAL);
        logger_1.logger.info('Started WebSocket ping interval');
    }
    constructor() {
        this.clients = new Map();
        this.pingInterval = null;
        this.pingInterval = null;
    }
    async sendNotification(userId, notification) {
        try {
            const userIdNum = this.ensureNumberUserId(userId);
            const prismaData = notification.data ?
                JSON.parse(JSON.stringify(notification.data)) :
                client_1.Prisma.JsonNull;
            const savedNotification = await db_1.default.notification.create({
                data: {
                    userId: userIdNum,
                    status: 'UNREAD',
                    readAt: null,
                    title: notification.title,
                    message: notification.message,
                    type: notification.type,
                    data: prismaData,
                }
            });
            const client = this.clients.get(userId);
            if (client && client.readyState === ws_1.WebSocket.OPEN) {
                try {
                    const message = JSON.stringify({
                        type: 'NOTIFICATION',
                        data: savedNotification,
                        timestamp: new Date().toISOString()
                    });
                    client.send(message);
                    logger_1.logger.debug(`Sent notification to user ${userId}`);
                }
                catch (error) {
                    logger_1.logger.error(`Error sending WebSocket notification to user ${userId}:`, error);
                    this.removeClient(userId);
                }
            }
            else {
                logger_1.logger.debug(`User ${userId} is not connected to WebSocket`);
            }
        }
        catch (error) {
            logger_1.logger.error('Error creating/sending notification:', error);
            throw error;
        }
    }
    async broadcastNotification(userIds, notification) {
        if (!userIds.length)
            return;
        try {
            await Promise.all(userIds.map(async (userId) => {
                try {
                    const userIdNum = this.ensureNumberUserId(userId);
                    const prismaData = notification.data ?
                        JSON.parse(JSON.stringify(notification.data)) :
                        client_1.Prisma.JsonNull;
                    const savedNotification = await db_1.default.notification.create({
                        data: {
                            userId: userIdNum,
                            status: 'UNREAD',
                            readAt: null,
                            title: notification.title,
                            message: notification.message,
                            type: notification.type,
                            data: prismaData,
                        },
                    });
                    const client = this.clients.get(userId);
                    if (client && client.readyState === ws_1.WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'NOTIFICATION',
                            data: {
                                ...savedNotification,
                                userId,
                            },
                        }));
                    }
                }
                catch (error) {
                    logger_1.logger.error(`Error processing notification for user ${userId}:`, error);
                }
            }));
        }
        catch (error) {
            logger_1.logger.error('Error in broadcastNotification:', error);
            throw error;
        }
    }
    async sendPOStatusNotification(userId, poNumber, status, message, data) {
        await this.sendNotification(userId, {
            title: `PO #${poNumber} ${status}`,
            message,
            type: 'PO_UPDATED',
            data: data ? JSON.parse(JSON.stringify(data)) : undefined,
        });
    }
    getPONotificationType(status) {
        switch (status) {
            case 'PENDING':
                return 'PO_CREATED';
            case 'APPROVED':
                return 'PO_APPROVAL';
            case 'REJECTED':
                return 'PO_UPDATED';
            case 'ORDERED':
            case 'RECEIVED':
            case 'CANCELLED':
                return 'PO_UPDATED';
            default:
                return 'OTHER';
        }
    }
    getPONotificationTitle(type, status) {
        switch (type) {
            case 'PO_CREATED':
                return 'New Purchase Order Request';
            case 'PO_APPROVAL':
                return 'Purchase Order Approved';
            case 'PO_UPDATED':
                return `Purchase Order ${status.charAt(0) + status.slice(1).toLowerCase()}`;
            default:
                return 'Purchase Order Update';
        }
    }
    getPONotificationMessage(type, data) {
        const poId = `PO-${data.poRequestId}`.padStart(6, '0');
        const ticketId = `TKT-${data.ticketId}`.padStart(6, '0');
        switch (type) {
            case 'PO_CREATED':
                return `New PO request ${poId} created for ticket ${ticketId} by ${data.requestedBy.name}`;
            case 'PO_APPROVAL':
                return `PO ${poId} for ticket ${ticketId} has been approved by ${data.approvedBy?.name || 'an admin'}`;
            case 'PO_UPDATED':
                return `PO ${poId} status updated to ${data.status} for ticket ${ticketId}`;
            default:
                return `PO ${poId} for ticket ${ticketId} has been updated`;
        }
    }
    getPOAction(type) {
        switch (type) {
            case 'PO_CREATED':
                return 'review';
            case 'PO_APPROVAL':
                return 'view';
            case 'PO_UPDATED':
                return 'view';
            default:
                return 'view';
        }
    }
    async markAsRead(notificationId, userId) {
        try {
            const userIdNum = this.ensureNumberUserId(userId);
            await db_1.default.notification.update({
                where: {
                    id: notificationId,
                    userId: userIdNum,
                },
                data: {
                    status: 'READ',
                    readAt: new Date(),
                },
            });
        }
        catch (error) {
            logger_1.logger.error('Error marking notification as read:', error);
            throw error;
        }
    }
    async getUnreadNotifications(userId) {
        try {
            const userIdNum = this.ensureNumberUserId(userId);
            const notifications = await db_1.default.notification.findMany({
                where: {
                    userId: userIdNum,
                    status: 'UNREAD',
                },
                orderBy: { createdAt: 'desc' },
            });
            return notifications.map(notification => ({
                ...notification,
                userId,
                data: notification.data,
                createdAt: notification.createdAt,
                updatedAt: notification.updatedAt,
                readAt: notification.readAt,
                status: notification.status,
            }));
        }
        catch (error) {
            logger_1.logger.error('Error fetching unread notifications:', error);
            throw error;
        }
    }
    cleanup() {
        this.clients.forEach((ws, userId) => {
            try {
                if (ws.readyState === ws_1.WebSocket.OPEN) {
                    ws.close(1001, 'Server shutting down');
                }
                else {
                    ws.terminate();
                }
            }
            catch (error) {
                logger_1.logger.error(`Error terminating connection for user ${userId}:`, error);
            }
        });
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        this.clients.clear();
        logger_1.logger.info('WebSocket service cleaned up');
    }
}
exports.webSocketService = new WebSocketService();
const setupWebSocketServer = (server) => {
    const wss = new ws_1.WebSocketServer({ server });
    wss.on('connection', (ws) => {
        const customWs = ws;
        customWs.isAlive = true;
        customWs.on('pong', () => {
            customWs.isAlive = true;
        });
        customWs.on('message', (message) => {
            try {
                const data = JSON.parse(message.toString());
                if (data.type === 'AUTH' && data.token) {
                    const userId = data.token;
                    customWs.userId = userId;
                    exports.webSocketService.addClient(userId, customWs);
                }
            }
            catch (error) {
                logger_1.logger.error('Error processing WebSocket message:', error);
            }
        });
        customWs.on('close', () => {
            if (customWs.userId) {
                exports.webSocketService.removeClient(customWs.userId);
            }
        });
    });
    const interval = setInterval(() => {
        wss.clients.forEach((ws) => {
            const customWs = ws;
            if (customWs.isAlive === false) {
                return ws.terminate();
            }
            customWs.isAlive = false;
            ws.ping();
        });
    }, 30000);
    wss.on('close', () => {
        clearInterval(interval);
        exports.webSocketService.cleanup();
    });
    return wss;
};
exports.setupWebSocketServer = setupWebSocketServer;
