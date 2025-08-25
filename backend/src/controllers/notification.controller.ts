import { Request, Response } from 'express';
import { Prisma, NotificationType, NotificationStatus } from '@prisma/client';

// Create an augmented WebSocket interface
export interface CustomWebSocket extends WebSocket {
  userId?: number | string;
  isAlive: boolean;
}

// Interface for notification data
interface NotificationData extends Record<string, any> {}

// Interface for notification creation params
interface CreateNotificationParams {
  userId: number; // Changed from string to number to match Prisma schema
  type: NotificationType;
  title: string;
  message: string;
  data?: NotificationData;
  sendEmailNotification?: boolean;
}
import prisma from '../config/db';
import { sendEmail } from '../services/email.service';
import { WebSocket, WebSocketServer } from 'ws';

// WebSocket server for real-time notifications
let wss: WebSocketServer | null = null;

export const setWebSocketServer = (server: WebSocketServer) => {
  wss = server;
};

// Helper to broadcast notifications to connected clients
const broadcastNotification = (userId: number, notification: any) => {
  if (!wss) return;
  
  // Use Array.from() to properly type the clients
  const clients = Array.from(wss.clients) as CustomWebSocket[];
  clients.forEach((client: CustomWebSocket) => {
    if (client.userId === userId && client.readyState === 1) {
      client.send(JSON.stringify({
        type: 'NOTIFICATION',
        data: notification
      }) as string);
    }
  });
};

// Create a new notification
export const createNotification = async ({
  userId,
  type,
  title,
  message,
  data = {},
  sendEmailNotification = true
}: CreateNotificationParams) => {
  try {
    // Create notification in database
    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        data,
        status: 'UNREAD' as NotificationStatus
      }
    });

    // Broadcast to WebSocket clients
    broadcastNotification(userId, notification);

    // Send email notification if enabled
    if (sendEmailNotification) {
      try {
        // Get user email and use a default name since firstName/lastName aren't in the schema
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            email: true
          }
        });

        if (user?.email) {
          // Use the part before @ in email as the name, or fallback to 'there'
          const nameFromEmail = user.email.split('@')[0] || 'there';
          await sendEmail({
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
      } catch (error) {
        console.error('Error sending notification email:', error);
        // Continue without failing the entire notification
      }
    }

    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

// Get all notifications for current user
export const getNotifications = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { limit = '10', offset = '0', unreadOnly } = req.query;
    
    const where: Prisma.NotificationWhereInput = { 
      userId: Number(userId),
      ...(unreadOnly === 'true' ? { status: 'UNREAD' } : {})
    };
    
    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string, 10) || 10,
      skip: parseInt(offset as string, 10) || 0
    });
    
    const total = await prisma.notification.count({ where });
    
    return res.json({
      data: notifications,
      pagination: {
        total,
        limit: parseInt(limit as string, 10) || 10,
        offset: parseInt(offset as string, 10) || 0,
        hasMore: (parseInt(offset as string, 10) || 0) + notifications.length < total
      }
    });
  } catch (error) {
    console.error('Error getting notifications:', error);
    return res.status(500).json({ error: 'Failed to get notifications' });
  }
};

// Mark notification as read
export const markAsRead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    // Check if notification exists and belongs to user
    const notification = await prisma.notification.findFirst({
      where: { 
        id: Number(id), 
        userId: Number(userId) 
      }
    });
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    // Update notification
    const updatedNotification = await prisma.notification.update({
      where: { id: Number(id) },
      data: { 
        readAt: new Date(),
        status: 'READ' as NotificationStatus // Also update status to READ
      }
    });
    
    return res.json(updatedNotification);
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return res.status(500).json({ error: 'Failed to update notification' });
  }
};

// Mark all notifications as read
export const markAllAsRead = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    await prisma.notification.updateMany({
      where: { userId, readAt: null }, // Using readAt instead of isRead
      data: { readAt: new Date() } // Only set readAt, remove isRead
    });
    
    return res.json({ success: true });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return res.status(500).json({ error: 'Failed to update notifications' });
  }
};

// Delete notification
export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    // Check if notification exists and belongs to user
    const notification = await prisma.notification.findFirst({
      where: { 
        id: Number(id), 
        userId: Number(userId) 
      }
    });
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    // Delete notification
    await prisma.notification.delete({
      where: { id: Number(id) }
    });
    
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting notification:', error);
    return res.status(500).json({ error: 'Failed to delete notification' });
  }
};

// Get unread notification count
export const getUnreadCount = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    const count = await prisma.notification.count({
      where: { 
        userId: Number(userId), // Convert userId to number
        readAt: null // Use readAt instead of isRead
      }
    });
    
    return res.json({ count });
  } catch (error) {
    console.error('Error getting unread count:', error);
    return res.status(500).json({ error: 'Failed to get unread count' });
  }
};

// Subscribe to real-time notifications
export const subscribeToNotifications = (ws: CustomWebSocket, req: any) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return ws.close(1008, 'Unauthorized');
    }
    
    // Store user ID with WebSocket connection
    ws.userId = Number(userId); // Convert userId to number
    
    // Send initial unread count
    const mockResponse = {
      json: (data: { count: number }) => {
        ws.send(JSON.stringify({
          type: 'UNREAD_COUNT',
          data: data.count
        }) as string);
      },
      status: () => ({
        json: () => {}
      })
    } as unknown as Response;
    
    void getUnreadCount(req, mockResponse);
    
    ws.on('close', () => {
      console.log(`Client ${userId} disconnected`);
    });
    
  } catch (error) {
    console.error('Error in WebSocket connection:', error);
    ws.close(1011, 'Internal Server Error');
  }
};
