"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const client_1 = require("@prisma/client");
const db_1 = __importDefault(require("../config/db"));
class NotificationService {
    // Create notification for ticket status changes
    static async createTicketStatusNotification(ticketId, oldStatus, newStatus, changedById) {
        try {
            // Get ticket details with related users
            const ticket = await db_1.default.ticket.findUnique({
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
            if (!ticket)
                return;
            const recipients = new Set();
            // Add relevant users based on status change
            if (ticket.assignedTo)
                recipients.add(ticket.assignedTo.id);
            if (ticket.owner)
                recipients.add(ticket.owner.id);
            if (ticket.subOwner)
                recipients.add(ticket.subOwner.id);
            if (ticket.createdBy)
                recipients.add(ticket.createdBy.id);
            // Add customer users for certain status changes
            const customerNotificationStatuses = [
                client_1.TicketStatus.ASSIGNED,
                client_1.TicketStatus.ONSITE_VISIT_PLANNED,
                client_1.TicketStatus.RESOLVED,
                client_1.TicketStatus.CLOSED
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
                type: client_1.NotificationType.TICKET_UPDATED,
                data: {
                    ticketId,
                    oldStatus,
                    newStatus,
                    changedById
                }
            }));
            if (notifications.length > 0) {
                await db_1.default.notification.createMany({
                    data: notifications
                });
            }
        }
        catch (error) {
            console.error('Error creating ticket status notification:', error);
        }
    }
    // Create notification for ticket assignment
    static async createTicketAssignmentNotification(ticketId, assignedToId, assignedById) {
        try {
            const ticket = await db_1.default.ticket.findUnique({
                where: { id: ticketId },
                select: { title: true }
            });
            if (!ticket)
                return;
            await db_1.default.notification.create({
                data: {
                    userId: assignedToId,
                    title: 'New Ticket Assigned',
                    message: `You have been assigned to ticket #${ticketId}: ${ticket.title}`,
                    type: client_1.NotificationType.TICKET_ASSIGNED,
                    data: {
                        ticketId,
                        assignedById
                    }
                }
            });
        }
        catch (error) {
            console.error('Error creating ticket assignment notification:', error);
        }
    }
    // Create notification for PO requests
    static async createPONotification(ticketId, poId, type, userId) {
        try {
            // Get all admins for PO notifications
            const admins = await db_1.default.user.findMany({
                where: { role: client_1.UserRole.ADMIN, isActive: true },
                select: { id: true }
            });
            const ticket = await db_1.default.ticket.findUnique({
                where: { id: ticketId },
                select: { title: true }
            });
            if (!ticket)
                return;
            let title = '';
            let message = '';
            let notificationType;
            switch (type) {
                case 'CREATED':
                    title = 'New PO Request';
                    message = `PO request created for ticket #${ticketId}: ${ticket.title}`;
                    notificationType = client_1.NotificationType.PO_CREATED;
                    break;
                case 'APPROVED':
                    title = 'PO Request Approved';
                    message = `PO request approved for ticket #${ticketId}: ${ticket.title}`;
                    notificationType = client_1.NotificationType.PO_APPROVAL;
                    break;
                case 'REJECTED':
                    title = 'PO Request Rejected';
                    message = `PO request rejected for ticket #${ticketId}: ${ticket.title}`;
                    notificationType = client_1.NotificationType.PO_UPDATED;
                    break;
                default:
                    notificationType = client_1.NotificationType.PO_CREATED;
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
                    await db_1.default.notification.createMany({
                        data: notifications
                    });
                }
            }
            else {
                // Notify the requester for approval/rejection
                const poRequest = await db_1.default.pORequest.findUnique({
                    where: { id: poId },
                    select: { requestedById: true }
                });
                if (poRequest && poRequest.requestedById !== userId) {
                    await db_1.default.notification.create({
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
        }
        catch (error) {
            console.error('Error creating PO notification:', error);
        }
    }
    // Create notification for onsite visit planning
    static async createOnsiteVisitNotification(ticketId, servicePersonId, visitDate, plannedById) {
        try {
            const ticket = await db_1.default.ticket.findUnique({
                where: { id: ticketId },
                select: { title: true }
            });
            if (!ticket)
                return;
            await db_1.default.notification.create({
                data: {
                    userId: servicePersonId,
                    title: 'Onsite Visit Scheduled',
                    message: `Onsite visit scheduled for ${visitDate.toLocaleDateString()} - Ticket #${ticketId}: ${ticket.title}`,
                    type: client_1.NotificationType.TICKET_UPDATED,
                    data: {
                        ticketId,
                        visitDate: visitDate.toISOString(),
                        plannedById
                    }
                }
            });
        }
        catch (error) {
            console.error('Error creating onsite visit notification:', error);
        }
    }
    // Create notification for spare parts updates
    static async createSparePartsNotification(ticketId, status, updatedById) {
        try {
            const ticket = await db_1.default.ticket.findUnique({
                where: { id: ticketId },
                include: {
                    assignedTo: { select: { id: true } },
                    owner: { select: { id: true } },
                    subOwner: { select: { id: true } }
                }
            });
            if (!ticket)
                return;
            const recipients = new Set();
            if (ticket.assignedTo)
                recipients.add(ticket.assignedTo.id);
            if (ticket.owner)
                recipients.add(ticket.owner.id);
            if (ticket.subOwner)
                recipients.add(ticket.subOwner.id);
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
                type: client_1.NotificationType.TICKET_UPDATED,
                data: {
                    ticketId,
                    sparePartsStatus: status,
                    updatedById
                }
            }));
            if (notifications.length > 0) {
                await db_1.default.notification.createMany({
                    data: notifications
                });
            }
        }
        catch (error) {
            console.error('Error creating spare parts notification:', error);
        }
    }
    // Create system alert notifications
    static async createSystemAlert(title, message, userRoles = [client_1.UserRole.ADMIN], data) {
        try {
            const users = await db_1.default.user.findMany({
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
                type: client_1.NotificationType.SYSTEM_ALERT,
                data: data || {}
            }));
            if (notifications.length > 0) {
                await db_1.default.notification.createMany({
                    data: notifications
                });
            }
        }
        catch (error) {
            console.error('Error creating system alert:', error);
        }
    }
    // Mark notifications as read
    static async markAsRead(notificationIds, userId) {
        try {
            await db_1.default.notification.updateMany({
                where: {
                    id: { in: notificationIds },
                    userId: userId
                },
                data: {
                    status: 'READ',
                    readAt: new Date()
                }
            });
        }
        catch (error) {
            console.error('Error marking notifications as read:', error);
        }
    }
    // Get unread notifications count
    static async getUnreadCount(userId) {
        try {
            return await db_1.default.notification.count({
                where: {
                    userId: userId,
                    status: 'UNREAD'
                }
            });
        }
        catch (error) {
            console.error('Error getting unread notifications count:', error);
            return 0;
        }
    }
    // Get user notifications with pagination
    static async getUserNotifications(userId, page = 1, limit = 20, status) {
        try {
            const skip = (page - 1) * limit;
            const where = { userId };
            if (status) {
                where.status = status.toUpperCase();
            }
            const [notifications, total] = await Promise.all([
                db_1.default.notification.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: { createdAt: 'desc' }
                }),
                db_1.default.notification.count({ where })
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
        }
        catch (error) {
            console.error('Error getting user notifications:', error);
            return {
                data: [],
                pagination: { total: 0, page: 1, limit: 20, totalPages: 0 }
            };
        }
    }
}
exports.NotificationService = NotificationService;
