import { Request, Response } from 'express';
import { NotificationService } from '../services/notification.service';
import { AuthUser } from '../types/express';

// Extended Request type
type NotificationRequest = Request & {
  user?: AuthUser;
  params: {
    id?: string;
  };
  query: {
    page?: string;
    limit?: string;
    status?: 'UNREAD' | 'READ' | 'ARCHIVED';
  };
};

// Get user notifications with pagination
export const getNotifications = async (req: NotificationRequest, res: Response) => {
  try {
    const user = req.user as AuthUser;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '20');
    const status = req.query.status;

    const result = await NotificationService.getUserNotifications(
      user.id,
      page,
      limit,
      status
    );

    res.json(result);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Error fetching notifications' });
  }
};

// Get unread notifications count
export const getUnreadCount = async (req: NotificationRequest, res: Response) => {
  try {
    const user = req.user as AuthUser;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const count = await NotificationService.getUnreadCount(user.id);
    res.json({ count });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Error fetching unread count' });
  }
};

// Mark notifications as read
export const markAsRead = async (req: NotificationRequest, res: Response) => {
  try {
    const user = req.user as AuthUser;
    const { notificationIds } = req.body;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({ error: 'Invalid notification IDs' });
    }

    await NotificationService.markAsRead(notificationIds, user.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    res.status(500).json({ error: 'Error marking notifications as read' });
  }
};

// Mark single notification as read
export const markSingleAsRead = async (req: NotificationRequest, res: Response) => {
  try {
    const user = req.user as AuthUser;
    const { id } = req.params;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!id) {
      return res.status(400).json({ error: 'Notification ID required' });
    }

    await NotificationService.markAsRead([parseInt(id)], user.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Error marking notification as read' });
  }
};
