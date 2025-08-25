import { Request as ExpressRequest, Response } from 'express';
import prisma from '../config/db';
import { TicketStatus, UserRole, Prisma } from '@prisma/client';

// Define PO status type since it's not an enum in Prisma
type POStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

// Helper function to get user's full name
const getUserName = (user: { firstName?: string | null; lastName?: string | null; email: string }) => {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  return user.email.split('@')[0];
};

// Extend Express Request type to include our user
export interface AuthenticatedRequest extends ExpressRequest {
  user?: {
    id: number;
    role: UserRole;
    customerId?: number;
  };
  params: {
    [key: string]: string;
  };
  body: any;
}



// Type for PO request with related data
type PORequestWithRelations = Prisma.PORequestGetPayload<{
  include: {
    requestedBy: true;
    approvedBy: boolean;
    ticket: true;
  };
}>;

// Interface for PO item
interface POItem {
  name: string;
  quantity: number | string;
  unitPrice: number | string;
  description?: string;
}

// Interface for PO request body
interface PORequestInput {
  items: POItem[];
  amount: number | string;
  reason: string;
}

import { sendPOStatusNotification, getPONotificationRecipients } from '../services/po-notification.service';

export const requestPO = async (req: AuthenticatedRequest & { params: { id: string }, body: PORequestInput }, res: Response) => {
  try {
    const { id } = req.params;
    const { items, amount: amountStr, reason } = req.body;
    const userId = req.user!.id;

    // Validate input
    if (!Array.isArray(items) || items.length === 0 || !amountStr || !reason) {
      return res.status(400).json({ error: 'Items, amount and reason are required' });
    }

    // Get the ticket
    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(id) },
      include: { customer: true }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Check permissions - only service person assigned to ticket or admin can request PO
    const isAdmin = req.user?.role === 'ADMIN';
    const isAssignedServicePerson = ticket.assignedToId === userId;
    
    if (!isAdmin && !isAssignedServicePerson) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Create PO request
    const poRequest = await prisma.$transaction(async (tx) => {
      // Create PO request with proper types
      const po = await tx.pORequest.create({
        data: {
          ticket: { connect: { id: ticket.id } },
          requestedBy: { connect: { id: userId } },
          amount: typeof amountStr === 'string' ? parseFloat(amountStr) : amountStr,
          description: reason.trim(),
          // Items are not directly in the schema, using notes field
          notes: `PO Request Items:\n${items.map(item => {
            const quantity = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
            const unitPrice = typeof item.unitPrice === 'string' ? parseFloat(item.unitPrice) : item.unitPrice;
            return `- ${item.name}: ${quantity} x $${unitPrice.toFixed(2)} = $${(quantity * unitPrice).toFixed(2)}`;
          }).join('\n')}`
        },
        include: {
          requestedBy: {
            select: {
              id: true,
              email: true,
              role: true
            }
          },
          approvedBy: {
            select: {
              id: true,
              email: true,
              role: true
            }
          },
          ticket: {
            select: {
              id: true,
              title: true,
              status: true
            }
          }
        }
      });

      // Update ticket status
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { 
          status: TicketStatus.WAITING_FOR_PO
        }
      });

      // Log the PO request
      await prisma.auditLog.create({
        data: {
          entityType: 'PO_REQUEST',
          entityId: po.id,
          action: 'CREATE',
          newValue: {
            amount: po.amount,
            status: po.status,
            ticketId: po.ticketId
          } as Prisma.InputJsonValue,
          performedById: userId,
          ticketId: po.ticketId
        }
      });

      return po;
    });

    // Send notifications
    const recipientIds = await getPONotificationRecipients(poRequest.id, userId);
    const requesterName = req.user ? getUserName(req.user as any) : 'System';
    await sendPOStatusNotification(
      {
        poId: poRequest.id,
        poNumber: poRequest.id.toString(), // In a real app, use a proper PO number
        status: poRequest.status as POStatus,
        updatedBy: requesterName,
        ticketId: poRequest.ticketId,
        ticketTitle: 'Unknown Ticket', // Ticket title not available in the current query
        amount: poRequest.amount ?? undefined,
        notes: poRequest.notes || undefined
      },
      recipientIds
    );

    return res.status(201).json(poRequest);
  } catch (error) {
    console.error('Error creating PO request:', error);
    return res.status(500).json({ error: 'Failed to create PO request' });
  }
};

export const approvePO = async (req: AuthenticatedRequest & { params: { requestId: string }, body: { status: POStatus; approvalNotes?: string } }, res: Response) => {
  try {
    const { requestId } = req.params;
    const { status, approvalNotes } = req.body;
    const userId = req.user!.id;

    // Only admins can approve POs
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate input
    const validStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
    if (!status || !validStatuses.includes(status as any)) {
      return res.status(400).json({ error: 'Valid status is required' });
    }

    const poRequest = await prisma.$transaction(async (tx) => {
      // Get and lock the PO request
      const po = await tx.pORequest.findUnique({
        where: { id: parseInt(requestId) },
        include: {
          ticket: {
            select: {
              id: true,
              status: true,
              title: true,
              customerId: true
            }
          },
          requestedBy: {
            select: {
              id: true,
              email: true,
              role: true
            }
          },
        },
      });

      if (!po) {
        throw new Error('PO request not found');
      }

      if (po.status !== 'PENDING_APPROVAL') {
        throw new Error(`PO request is already ${po.status.toLowerCase()}`);
      }

      // Update PO status
      const updatedPO = await tx.pORequest.update({
        where: { id: po.id },
        data: {
          status,
          approvedBy: { connect: { id: userId } },
          approvedAt: new Date(),
          notes: approvalNotes?.trim()
        },
        include: {
          requestedBy: {
            select: {
              id: true,
              email: true,
              role: true
            }
          },
          approvedBy: {
            select: {
              id: true,
              email: true,
              role: true
            }
          },
          ticket: {
            select: {
              id: true,
              title: true,
              status: true
            }
          }
        }
      });

      // Update ticket status if needed
      if (status === 'APPROVED') {
        await tx.ticket.update({
          where: { id: po.ticketId },
          data: { status: TicketStatus.IN_PROGRESS },
        });
      } else if (status === 'REJECTED') {
        await tx.ticket.update({
          where: { id: po.ticketId },
          data: { status: TicketStatus.SPARE_NEEDED },
        });
      }

      return updatedPO;
    });

    // Send notifications
    const recipientIds = await getPONotificationRecipients(poRequest.id, userId);
    const requesterName = req.user ? getUserName(req.user as any) : 'System';
    await sendPOStatusNotification(
      {
        poId: poRequest.id,
        poNumber: poRequest.id.toString(), // In a real app, use a proper PO number
        status: status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED',
        updatedBy: requesterName,
        ticketId: poRequest.ticketId,
        ticketTitle: 'Unknown Ticket', // Ticket title not available in the current query
        amount: poRequest.amount ?? 0, // Convert null to 0
        notes: approvalNotes
      },
      recipientIds
    );

    return res.json(poRequest);
  } catch (error: any) {
    console.error('Error approving PO request:', error);
    const status = error.message.includes('not found') ? 404 : 400;
    return res.status(status).json({ error: error.message });
  }
};
