import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';
import prisma from '../config/db';
import { Prisma, NotificationType as PrismaNotificationType } from '@prisma/client';
import { logger } from '../utils/logger';
import { CustomWebSocket } from '../types/custom';

declare module 'ws' {
  interface WebSocket {
    isAlive: boolean;
    userId?: string | number;
  }
}

export type WebSocketWithUserId = CustomWebSocket;

// Use Prisma's enum as base type
export type NotificationType = PrismaNotificationType;

export type NotificationStatus = 'UNREAD' | 'READ' | 'ARCHIVED';

export interface Notification {
  id: number;
  userId: string | number;
  title: string;
  message: string;
  type: NotificationType;
  status: NotificationStatus;
  data?: Prisma.InputJsonValue | null;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PONotificationData {
  poRequestId: number;
  ticketId: number;
  status: string;
  amount?: number;
  description?: string;
  requestedBy: {
    id: number;
    name: string;
    email: string;
  };
  approvedBy?: {
    id: number;
    name: string;
    email: string;
  };
  notes?: string;
}

class WebSocketService {
  private clients: Map<string | number, WebSocketWithUserId> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  
  private ensureNumberUserId(userId: string | number): number {
    if (typeof userId === 'string') {
      const parsed = parseInt(userId, 10);
      if (isNaN(parsed)) {
        throw new Error(`Invalid user ID: ${userId}`);
      }
      return parsed;
    }
    return userId;
  }
  
  public addClient(userId: string | number, ws: WebSocketWithUserId): void {
    const existingClient = this.clients.get(userId);
    if (existingClient) {
      try {
        existingClient.close(1000, 'New connection opened');
      } catch (error) {
        logger.error(`Error closing existing connection for user ${userId}:`, error as Error);
      }
    }
    
    ws.userId = userId;
    this.clients.set(userId, ws);
    logger.info(`Client connected. Total clients: ${this.clients.size}`);
    
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
  
  public removeClient(userId: string | number): void {
    this.clients.delete(userId);
    logger.info(`Client disconnected. Total clients: ${this.clients.size}`);
    
    if (this.clients.size === 0 && this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  
  private startPingInterval(): void {
    if (this.pingInterval) {
      return;
    }

    const PING_INTERVAL = 30000;
    
    this.pingInterval = setInterval(() => {
      this.clients.forEach((ws, userId) => {
        if (ws.isAlive === false) {
          logger.warn(`Terminating dead connection for user ${userId}`);
          ws.terminate();
          this.clients.delete(userId);
          return;
        }
        
        ws.isAlive = false;
        ws.ping(undefined, undefined, (err) => {
          if (err) {
            logger.error(`Ping error for user ${userId}:`, err);
            ws.terminate();
            this.clients.delete(userId);
          }
        });
      });
    }, PING_INTERVAL);
    
    logger.info('Started WebSocket ping interval');
  }

  constructor() {
    this.pingInterval = null;
  }

  public async sendNotification(
    userId: string | number,
    notification: Omit<Notification, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'readAt' | 'status'>
  ): Promise<void> {
    try {
      const userIdNum = this.ensureNumberUserId(userId);
      
      const prismaData = notification.data ? 
        JSON.parse(JSON.stringify(notification.data)) as Prisma.InputJsonValue : 
        Prisma.JsonNull;
      
      const savedNotification = await prisma.notification.create({
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
      if (client && client.readyState === WebSocket.OPEN) {
        try {
          const message = JSON.stringify({
            type: 'NOTIFICATION',
            data: savedNotification,
            timestamp: new Date().toISOString()
          });
          client.send(message);
          logger.debug(`Sent notification to user ${userId}`);
        } catch (error) {
          logger.error(`Error sending WebSocket notification to user ${userId}:`, error);
          this.removeClient(userId);
        }
      } else {
        logger.debug(`User ${userId} is not connected to WebSocket`);
      }
    } catch (error) {
      logger.error('Error creating/sending notification:', error);
      throw error;
    }
  }

  public async broadcastNotification(
    userIds: (string | number)[],
    notification: Omit<Notification, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'readAt' | 'status'>
  ): Promise<void> {
    if (!userIds.length) return;
    
    try {
      await Promise.all(
        userIds.map(async (userId) => {
          try {
            const userIdNum = this.ensureNumberUserId(userId);
            
            const prismaData = notification.data ? 
              JSON.parse(JSON.stringify(notification.data)) as Prisma.InputJsonValue : 
              Prisma.JsonNull;
            
            const savedNotification = await prisma.notification.create({
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
            if (client && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'NOTIFICATION',
                data: {
                  ...savedNotification,
                  userId,
                },
              }));
            }
          } catch (error) {
            logger.error(`Error processing notification for user ${userId}:`, error);
          }
        })
      );
    } catch (error) {
      logger.error('Error in broadcastNotification:', error);
      throw error;
    }
  }

  async sendPOStatusNotification(
    userId: number,
    poNumber: string,
    status: string,
    message: string,
    data?: Record<string, any>
  ): Promise<void> {
    await this.sendNotification(userId, {
      title: `PO #${poNumber} ${status}`,
      message,
      type: 'PO_UPDATED',
      data: data ? (JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue) : undefined,
    });
  }

  private getPONotificationType(status: string): NotificationType {
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

  private getPONotificationTitle(type: NotificationType, status: string): string {
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

  private getPONotificationMessage(type: NotificationType, data: PONotificationData): string {
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

  private getPOAction(type: NotificationType): string {
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

  public async markAsRead(notificationId: number, userId: string | number): Promise<void> {
    try {
      const userIdNum = this.ensureNumberUserId(userId);
      await prisma.notification.update({
        where: { 
          id: notificationId,
          userId: userIdNum,
        },
        data: { 
          status: 'READ',
          readAt: new Date(),
        },
      });
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      throw error;
    }
  }

  public async getUnreadNotifications(userId: string | number): Promise<Notification[]> {
    try {
      const userIdNum = this.ensureNumberUserId(userId);
      const notifications = await prisma.notification.findMany({
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
        status: notification.status as 'UNREAD' | 'READ',
      }));
    } catch (error) {
      logger.error('Error fetching unread notifications:', error);
      throw error;
    }
  }

  public cleanup(): void {
    this.clients.forEach((ws: WebSocketWithUserId, userId: string | number) => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1001, 'Server shutting down');
        } else {
          ws.terminate();
        }
      } catch (error) {
        logger.error(`Error terminating connection for user ${userId}:`, error);
      }
    });

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    this.clients.clear();
    logger.info('WebSocket service cleaned up');
  }
}

export const webSocketService = new WebSocketService();

export const setupWebSocketServer = (server: Server) => {
  const wss = new WebSocketServer({ server });
  
  wss.on('connection', (ws: WebSocket) => {
    const customWs = ws as CustomWebSocket;
    customWs.isAlive = true;
    
    customWs.on('pong', () => {
      customWs.isAlive = true;
    });
    
    customWs.on('message', (message: string) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'AUTH' && data.token) {
          const userId = data.token;
          customWs.userId = userId;
          webSocketService.addClient(userId, customWs);
        }
      } catch (error) {
        logger.error('Error processing WebSocket message:', error);
      }
    });
    
    customWs.on('close', () => {
      if (customWs.userId) {
        webSocketService.removeClient(customWs.userId);
      }
    });
  });
  
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const customWs = ws as unknown as CustomWebSocket;
      if (customWs.isAlive === false) {
        return ws.terminate();
      }
      customWs.isAlive = false;
      ws.ping();
    });
  }, 30000);
  
  wss.on('close', () => {
    clearInterval(interval);
    webSocketService.cleanup();
  });
  
  return wss;
};