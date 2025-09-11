import { NotificationType, TicketStatus, UserRole } from '@prisma/client';
import prisma from '../config/db';

interface NotificationData {
  ticketId?: number;
  assignedToId?: number;
  customerId?: number;
  poId?: number;
  [key: string]: any;
}

export class NotificationService {
  // Create notification for ticket status changes
  static async createTicketStatusNotification(
    ticketId: number,
    oldStatus: TicketStatus,
    newStatus: TicketStatus,
    changedById: number
  ) {
    try {
      // Get ticket details with related users
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
          customer: {
            include: {
              users: {
                where: { role: 'ZONE_USER' },
                select: { id: true }
              }
            }
          },
          assignedTo: { select: { id: true } },
          owner: { select: { id: true } },
          subOwner: { select: { id: true } },
          createdBy: { select: { id: true } }
        }
      });

      if (!ticket) return;

      const recipients = new Set<number>();
      
      // Add relevant users based on status change
      if (ticket.assignedTo) recipients.add(ticket.assignedTo.id);
      if (ticket.owner) recipients.add(ticket.owner.id);
      if (ticket.subOwner) recipients.add(ticket.subOwner.id);
      if (ticket.createdBy) recipients.add(ticket.createdBy.id);
      
      // Add customer users for certain status changes
      const customerNotificationStatuses: TicketStatus[] = [
        TicketStatus.ASSIGNED,
        TicketStatus.ONSITE_VISIT_PLANNED,
        TicketStatus.RESOLVED,
        TicketStatus.CLOSED
      ];
      
      if (customerNotificationStatuses.includes(newStatus)) {
        ticket.customer.users.forEach(user => recipients.add(user.id));
      }

      // Remove the user who made the change
      recipients.delete(changedById);

      // Create notifications
      const notifications = Array.from(recipients).map(userId => ({
        userId,
        title: `Ticket #${ticketId} Status Updated`,
        message: `Ticket status changed from ${oldStatus} to ${newStatus}`,
        type: NotificationType.TICKET_UPDATED,
        data: {
          ticketId,
          oldStatus,
          newStatus,
          changedById
        }
      }));

      if (notifications.length > 0) {
        await prisma.notification.createMany({
          data: notifications
        });
      }
    } catch (error) {
      console.error('Error creating ticket status notification:', error);
    }
  }

  // Create notification for ticket assignment
  static async createTicketAssignmentNotification(
    ticketId: number,
    assignedToId: number,
    assignedById: number
  ) {
    try {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { title: true }
      });

      if (!ticket) return;

      await prisma.notification.create({
        data: {
          userId: assignedToId,
          title: 'New Ticket Assigned',
          message: `You have been assigned to ticket #${ticketId}: ${ticket.title}`,
          type: NotificationType.TICKET_ASSIGNED,
          data: {
            ticketId,
            assignedById
          }
        }
      });
    } catch (error) {
      console.error('Error creating ticket assignment notification:', error);
    }
  }

  // Create notification for PO requests
  static async createPONotification(
    ticketId: number,
    poId: number,
    type: 'CREATED' | 'APPROVED' | 'REJECTED',
    userId: number
  ) {
    try {
      // Get all admins for PO notifications
      const admins = await prisma.user.findMany({
        where: { role: UserRole.ADMIN, isActive: true },
        select: { id: true }
      });

      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { title: true }
      });

      if (!ticket) return;

      let title = '';
      let message = '';
      let notificationType: NotificationType;

      switch (type) {
        case 'CREATED':
          title = 'New PO Request';
          message = `PO request created for ticket #${ticketId}: ${ticket.title}`;
          notificationType = NotificationType.PO_CREATED;
          break;
        case 'APPROVED':
          title = 'PO Request Approved';
          message = `PO request approved for ticket #${ticketId}: ${ticket.title}`;
          notificationType = NotificationType.PO_APPROVAL;
          break;
        case 'REJECTED':
          title = 'PO Request Rejected';
          message = `PO request rejected for ticket #${ticketId}: ${ticket.title}`;
          notificationType = NotificationType.PO_UPDATED;
          break;
        default:
          notificationType = NotificationType.PO_CREATED;
      }

      // Notify admins for new PO requests
      if (type === 'CREATED') {
        const notifications = admins
          .filter(admin => admin.id !== userId)
          .map(admin => ({
            userId: admin.id,
            title,
            message,
            type: notificationType,
            data: { ticketId, poId }
          }));

        if (notifications.length > 0) {
          await prisma.notification.createMany({
            data: notifications
          });
        }
      } else {
        // Notify the requester for approval/rejection
        const poRequest = await prisma.pORequest.findUnique({
          where: { id: poId },
          select: { requestedById: true }
        });

        if (poRequest && poRequest.requestedById !== userId) {
          await prisma.notification.create({
            data: {
              userId: poRequest.requestedById,
              title,
              message,
              type: notificationType,
              data: { ticketId, poId }
            }
          });
        }
      }
    } catch (error) {
      console.error('Error creating PO notification:', error);
    }
  }

  // Create notification for onsite visit planning
  static async createOnsiteVisitNotification(
    ticketId: number,
    servicePersonId: number,
    visitDate: Date,
    plannedById: number
  ) {
    try {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { title: true }
      });

      if (!ticket) return;

      await prisma.notification.create({
        data: {
          userId: servicePersonId,
          title: 'Onsite Visit Scheduled',
          message: `Onsite visit scheduled for ${visitDate.toLocaleDateString()} - Ticket #${ticketId}: ${ticket.title}`,
          type: NotificationType.TICKET_UPDATED,
          data: {
            ticketId,
            visitDate: visitDate.toISOString(),
            plannedById
          }
        }
      });
    } catch (error) {
      console.error('Error creating onsite visit notification:', error);
    }
  }

  // Create notification for spare parts updates
  static async createSparePartsNotification(
    ticketId: number,
    status: 'NEEDED' | 'BOOKED' | 'DELIVERED',
    updatedById: number
  ) {
    try {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
          assignedTo: { select: { id: true } },
          owner: { select: { id: true } },
          subOwner: { select: { id: true } }
        }
      });

      if (!ticket) return;

      const recipients = new Set<number>();
      if (ticket.assignedTo) recipients.add(ticket.assignedTo.id);
      if (ticket.owner) recipients.add(ticket.owner.id);
      if (ticket.subOwner) recipients.add(ticket.subOwner.id);
      recipients.delete(updatedById);

      let title = '';
      let message = '';

      switch (status) {
        case 'NEEDED':
          title = 'Spare Parts Required';
          message = `Spare parts needed for ticket #${ticketId}: ${ticket.title}`;
          break;
        case 'BOOKED':
          title = 'Spare Parts Ordered';
          message = `Spare parts ordered for ticket #${ticketId}: ${ticket.title}`;
          break;
        case 'DELIVERED':
          title = 'Spare Parts Delivered';
          message = `Spare parts delivered for ticket #${ticketId}: ${ticket.title}`;
          break;
      }

      const notifications = Array.from(recipients).map(userId => ({
        userId,
        title,
        message,
        type: NotificationType.TICKET_UPDATED,
        data: {
          ticketId,
          sparePartsStatus: status,
          updatedById
        }
      }));

      if (notifications.length > 0) {
        await prisma.notification.createMany({
          data: notifications
        });
      }
    } catch (error) {
      console.error('Error creating spare parts notification:', error);
    }
  }

  // Create system alert notifications
  static async createSystemAlert(
    title: string,
    message: string,
    userRoles: UserRole[] = [UserRole.ADMIN],
    data?: any
  ) {
    try {
      const users = await prisma.user.findMany({
        where: {
          role: { in: userRoles },
          isActive: true
        },
        select: { id: true }
      });

      const notifications = users.map(user => ({
        userId: user.id,
        title,
        message,
        type: NotificationType.SYSTEM_ALERT,
        data: data || {}
      }));

      if (notifications.length > 0) {
        await prisma.notification.createMany({
          data: notifications
        });
      }
    } catch (error) {
      console.error('Error creating system alert:', error);
    }
  }

  // Mark notifications as read
  static async markAsRead(notificationIds: number[], userId: number) {
    try {
      await prisma.notification.updateMany({
        where: {
          id: { in: notificationIds },
          userId: userId
        },
        data: {
          status: 'READ',
          readAt: new Date()
        }
      });
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    }
  }

  // Get unread notifications count
  static async getUnreadCount(userId: number): Promise<number> {
    try {
      return await prisma.notification.count({
        where: {
          userId: userId,
          status: 'UNREAD'
        }
      });
    } catch (error) {
      console.error('Error getting unread notifications count:', error);
      return 0;
    }
  }

  // Get user notifications with pagination
  static async getUserNotifications(
    userId: number,
    page: number = 1,
    limit: number = 20,
    status?: 'UNREAD' | 'READ' | 'ARCHIVED'
  ) {
    try {
      const skip = (page - 1) * limit;
      const where: any = { userId };
      
      if (status) {
        where.status = status.toUpperCase();
      }

      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.notification.count({ where })
      ]);

      return {
        data: notifications,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error getting user notifications:', error);
      return {
        data: [],
        pagination: { total: 0, page: 1, limit: 20, totalPages: 0 }
      };
    }
  }
}
