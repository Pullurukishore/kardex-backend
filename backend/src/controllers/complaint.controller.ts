import { Request, Response } from 'express';
import { TicketStatus, Priority, Prisma, NotificationType, User, Asset, UserRole } from '@prisma/client';
import prisma from '../config/db';
import { createNotification } from './notification.controller';
import { sendEmail } from '../services/email.service';
import { sendTicketUpdateNotification } from '../services/notification.service';

// Extend the base User type to include required fields
type UserWithName = User & {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null; // Some Prisma User models use 'name' instead of firstName/lastName
};

export const createComplaint = async (req: Request, res: Response) => {
  try {
    const { title, description, priority, assetId } = req.body;
    const user = req.user!;
    const userId = user.id;
    let customerId = user.customerId;

    // For admins, allow specifying customerId
    if (req.user?.role === 'ADMIN' && req.body.customerId) {
      customerId = Number(req.body.customerId);
    }

    // Validate input
    if (!title || !description || !priority || !customerId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate priority
    if (!Object.values(Priority).includes(priority)) {
      return res.status(400).json({ 
        error: 'Invalid priority',
        validPriorities: Object.values(Priority)
      });
    }

    // If asset is provided, verify it belongs to the customer
    if (assetId) {
      const asset = await prisma.asset.findUnique({
        where: { id: typeof assetId === 'string' ? parseInt(assetId) : assetId },
        select: { customerId: true }
      });

      if (!asset) {
        return res.status(404).json({ error: 'Asset not found' });
      }

      if (asset.customerId !== customerId && req.user?.role !== UserRole.ADMIN) {
        return res.status(403).json({ error: 'Asset does not belong to customer' });
      }
    }

    // Determine ticket status based on asset presence
    const status = assetId ? 'OPEN' : 'WAITING_FOR_RESPONSE';

    // Create the ticket
    const ticket = await prisma.ticket.create({
      data: {
        title,
        description,
        status,
        priority,
        customer: { connect: { id: customerId } },
        ...(assetId && { asset: { connect: { id: parseInt(assetId) } } }),
        createdBy: { connect: { id: userId } },
        ...(req.user?.role === 'CUSTOMER_ACCOUNT_OWNER' && { 
          contact: { connect: { id: userId } } 
        })
      },
      include: {
        customer: {
          select: {
            id: true,
            companyName: true
          }
        },
        asset: {
          select: {
            id: true,
            machineId: true,
            model: true
          }
        },
        createdBy: {
          select: {
            id: true,
            email: true
          }
        }
      }
    });

    return res.status(201).json(ticket);
  } catch (error) {
    console.error('Error creating complaint:', error);
    return res.status(500).json({ error: 'Failed to create complaint' });
  }
};

const getUserDetails = async (userId: number): Promise<UserWithName | null> => {
  // First get the full user with all required fields
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      customer: {
        include: {
          contacts: true
        }
      }
    }
  });
  
  if (!user) return null;
  
  // Find the user's contact information
  let contactName = null;
  
  // Try to find a contact with matching email first
  if (user.email) {
    const contact = user.customer?.contacts.find(c => c.email === user.email);
    contactName = contact?.name || null;
  }
  
  // If no contact found by email, try to get any contact from the customer
  if (!contactName && user.customer?.contacts?.length) {
    contactName = user.customer.contacts[0].name || null;
  }
  
  // Split the name into first and last name
  const nameParts = contactName ? contactName.split(' ') : [];
  const firstName = nameParts[0] || null;
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;
  
  // Create a UserWithName object with all required User fields
  const result: UserWithName = {
    ...user,
    name: contactName,
    firstName,
    lastName
  };
  
  return result;
};

const notifyTicketUpdate = async (
  ticket: any,
  status: TicketStatus,
  updatedBy: UserWithName,
  note?: string
) => {
  try {
    const { id: ticketId, customer, assignedTo } = ticket;
    const ticketTitle = `Ticket #${ticketId}`;
    const updatedByName = updatedBy.firstName ? 
      `${updatedBy.firstName} ${updatedBy.lastName || ''}`.trim() : 
      updatedBy.email.split('@')[0];
    
    // Notification data
    const notificationData = {
      title: `Ticket ${status}`,
      message: `Ticket #${ticketId} has been updated to ${status}`,
      type: 'TICKET_UPDATE' as NotificationType,
      data: {
        ticketId,
        status,
        updatedBy: updatedBy.id,
        note
      },
      userIds: [] as number[]
    };

    // Add customer to notification list if not the one making the update
    if (customer && customer.id !== updatedBy.id) {
      notificationData.userIds.push(customer.id);
    }

    // Add assigned service person to notification list if exists and not the one making the update
    if (assignedTo && assignedTo.id !== updatedBy.id) {
      notificationData.userIds.push(assignedTo.id);
    }

    // Create notifications for all relevant users
    await Promise.all(
      notificationData.userIds.map(userId =>
        createNotification({
          ...notificationData,
          userId: userId,
          data: {
            ...notificationData.data,
            userId: userId.toString()
          }
        })
      )
    );

    // Send email notifications
    if (customer && 'email' in customer && customer.email) {
      await sendTicketUpdateNotification(
        customer.email,
        ticketId.toString(),
        ticketTitle,
        status,
        updatedByName,
        note
      );
    }

    if (assignedTo && assignedTo.email && assignedTo.id !== customer?.id) {
      await sendTicketUpdateNotification(
        assignedTo.email,
        ticketId.toString(),
        ticketTitle,
        status,
        updatedByName,
        note
      );
    }
  } catch (error) {
    console.error('Error sending notifications:', error);
  }
};

export const updateTicketStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;
    const userId = req.user!.id;
    
    // Validate status
    if (!status) {
      return res.status(400).json({ 
        error: 'Status is required'
      });
    }
    
    // Get the ticket with necessary relations
    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        status: true,
        customerId: true,
        assignedToId: true,
        customer: {
          select: {
            id: true,
            companyName: true
          }
        },
        assignedTo: {
          select: {
            id: true,
            email: true
          }
        },
        callLogs: {
          orderBy: { id: 'desc' },
          take: 1
        }
      }
    });
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Check permissions
    const user = req.user!;
    const isAdmin = user.role === UserRole.ADMIN;
    const isAssignedServicePerson = ticket.assignedToId === userId;
    const isCustomerOwner = 'customerId' in user && user.customerId === ticket.customerId;
    
    // Validate status is a valid TicketStatus enum value
    if (!Object.values(TicketStatus).includes(status as any)) {
      return res.status(400).json({ 
        error: 'Invalid status',
        validStatuses: Object.values(TicketStatus)
      });
    }
    
    if (!isAdmin && !isAssignedServicePerson && !isCustomerOwner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get user details for notification
    const currentUser = await getUserDetails(userId);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update the ticket
    const updatedTicket = await prisma.$transaction(async (tx) => {
      // Prepare update data
      const updateData: Prisma.TicketUpdateInput = {
        status: status as any,
      };
      
      // Auto-assign to current user if status is IN_PROGRESS and not already assigned
      if (status === 'IN_PROGRESS' && !ticket.assignedToId) {
        updateData.assignedTo = {
          connect: { id: userId }
        };
      }
      
      // Add audit note if provided
      if (note) {
        await tx.ticketNote.create({
          data: {
            content: note,
            ticket: { connect: { id: ticket.id } },
            author: { connect: { id: userId } }
          }
        });
      }
      
      // Update the ticket
      const updated = await tx.ticket.update({
        where: { id: parseInt(id) },
        data: updateData,
        include: {
          customer: {
            select: { 
              id: true, 
              companyName: true
            }
          },
          assignedTo: {
            select: { 
              id: true, 
              email: true,
              role: true
            }
          }
        }
      });

      // Create a ticket history record
      const historyNote = note || `Status changed to ${status}`;
      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          status: status as TicketStatus,
          changedBy: { connect: { id: userId } },
          note: historyNote
        }
      });

      // Log the status change
      await tx.auditLog.create({
        data: {
          entityType: 'TICKET',
          entityId: updated.id,
          action: 'STATUS_CHANGE',
          userId: userId,
          oldValue: { status: ticket.status },
          newValue: { status }
        }
      });

      return updated;
    });

    // Prepare notification data
    const notificationData = {
      ...updatedTicket,
      customer: updatedTicket.customerId ? {
        id: updatedTicket.customerId,
        companyName: updatedTicket.customer?.companyName || 'Customer'
      } : { id: 0, companyName: 'Unknown Customer' },
      assignedTo: updatedTicket.assignedToId ? {
        id: updatedTicket.assignedToId,
        email: updatedTicket.assignedTo?.email || '',
        role: updatedTicket.assignedTo?.role || 'SERVICE_PERSON'
      } : null
    };
    
    // Send notifications in the background
    notifyTicketUpdate(
      notificationData,
      status,
      currentUser,
      note
    ).catch(console.error);

    return res.json(updatedTicket);
  } catch (error) {
    console.error('Error updating ticket status:', error);
    return res.status(500).json({ error: 'Failed to update ticket status' });
  }
};