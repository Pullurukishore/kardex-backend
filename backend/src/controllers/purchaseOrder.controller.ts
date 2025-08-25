import { Request, Response } from 'express';
import { Prisma, UserRole, TicketStatus } from '@prisma/client';
import prisma from '../config/db';

type PurchaseOrderStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'ORDERED' | 'RECEIVED' | 'CANCELLED' | 'REJECTED';

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: UserRole;
    customerId?: number;
  };
}

interface POItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
}

// Extend the Prisma namespace to include our custom types
declare global {
  namespace Prisma {
    interface PurchaseOrderWhereInput {
      status?: PurchaseOrderStatus | { in: PurchaseOrderStatus[] };
      ticketId?: number | { equals: number };
      ticket?: {
        customerId?: number | { equals: number };
      };
      OR?: any[];
    }
  }
}

// Helper to check PO access
async function checkPOAccess(user: NonNullable<AuthenticatedRequest['user']>, poId: number) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: { 
      ticket: {
        include: {
          customer: true,
          assignedTo: true
        }
      }
    }
  });
  
  if (!po || !po.ticket) return { allowed: false, error: 'Purchase order not found' };
  
  // Admin can access any PO
  if (user.role === UserRole.ADMIN) return { allowed: true };
  
  // Customer can access their own POs
  if (user.role === UserRole.CUSTOMER_ACCOUNT_OWNER && 
      po.ticket.customerId === user.customerId) {
    return { allowed: true };
  }
  
  // Service person can access POs for their assigned tickets
  if (user.role === UserRole.SERVICE_PERSON && 
      po.ticket.assignedToId === user.id) {
    return { allowed: true };
  }
  
  return { allowed: false, error: 'Access denied' };
}

// Create a new purchase order
export const createPO = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ticketId, items, notes } = req.body as {
      ticketId: number;
      items: POItemInput[];
      notes?: string;
    };
    
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!ticketId || !items?.length) {
      return res.status(400).json({ 
        error: 'Ticket ID and at least one item are required' 
      });
    }

    // Check if ticket exists and user has access
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { 
        customer: true,
        assignedTo: true
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Only service persons can create POs
    if (user.role !== UserRole.SERVICE_PERSON) {
      return res.status(403).json({ error: 'Only service persons can create POs' });
    }

    // Only allow POs for tickets assigned to the service person
    if (ticket.assignedToId !== user.id) {
      return res.status(403).json({ 
        error: 'You can only create POs for your assigned tickets' 
      });
    }

    // Calculate total amount
    const totalAmount = items.reduce((sum: number, item: any) => {
      return sum + (item.quantity * item.unitPrice);
    }, 0);

    // Generate PO number (format: PO-YYYYMMDD-XXXX)
    const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Create the PO
    const po = await prisma.purchaseOrder.create({
      data: {
        poNumber,
        status: 'PENDING_APPROVAL',
        totalAmount,
        notes,
        ticket: { connect: { id: ticketId } },
        createdBy: { connect: { id: user.id } },
        items: {
          create: items.map((item: any) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice
          }))
        },
        statusHistory: {
          create: [{
            status: 'PENDING_APPROVAL',
            changedBy: { connect: { id: user.id } },
            comments: 'PO created and pending approval'
          }]
        }
      },
      include: {
        ticket: {
          include: {
            customer: true
          }
        },
        createdBy: true,
        items: true
      }
    });

    // Update ticket status if needed
    if (ticket.status !== TicketStatus.WAITING_FOR_PO) {
      await prisma.$transaction([
        // Update the ticket status
        prisma.ticket.update({
          where: { id: ticketId },
          data: { 
            status: TicketStatus.WAITING_FOR_PO,
          }
        }),
        // Add a note about the status change
        prisma.ticketNote.create({
          data: {
            content: `Status changed to WAITING_FOR_PO (Purchase order created)`,
            ticketId: ticketId,
            authorId: user.id
          }
        })
      ]);
    }

    return res.status(201).json(po);
  } catch (error) {
    console.error('Error creating PO:', error);
    return res.status(500).json({ error: 'Failed to create purchase order' });
  }
};

// Get POs with filters
export const getPOs = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, ticketId, page = '1', limit = '10' } = req.query as {
      status?: string;
      ticketId?: string;
      page?: string;
      limit?: string;
    };
    
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const skip = (pageNum - 1) * limitNum;
    
    // Build where clause based on user role and filters
    const where: Prisma.PurchaseOrderWhereInput = {};
    
    if (status) {
      where.status = status as PurchaseOrderStatus;
    }
    
    if (ticketId) {
      where.ticketId = parseInt(ticketId, 10);
    }
    
    // Apply role-based filtering
    if (user.role === UserRole.CUSTOMER_ACCOUNT_OWNER && user.customerId) {
      where.ticket = { customerId: user.customerId };
    } else if (user.role === UserRole.SERVICE_PERSON) {
      where.OR = [
        { createdById: user.id },
        { ticket: { assignedToId: user.id } }
      ];
    }
    
    const [items, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: {
          ticket: {
            select: {
              id: true,
              title: true,
              status: true,
              customer: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          },
          items: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum
      }),
      prisma.purchaseOrder.count({ where })
    ]);
    
    res.json({
      items,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum)
    });
    
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
};

// Get PO by ID
export const getPO = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const poId = parseInt(id, 10);
    if (isNaN(poId)) {
      return res.status(400).json({ error: 'Invalid purchase order ID' });
    }
    
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: {
        ticket: {
          select: {
            id: true,
            title: true,
            status: true,
            customer: {
              select: {
                id: true,
                name: true
              }
            },
            assignedTo: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        approvedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        items: true,
        attachments: true
      }
    });
    
    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    
    // Check access
    const access = await checkPOAccess(user, po.id);
    if (!access.allowed) {
      return res.status(403).json({ error: access.error });
    }
    
    res.json(po);
    
  } catch (error) {
    console.error('Error fetching purchase order:', error);
    res.status(500).json({ error: 'Failed to fetch purchase order' });
  }
};

// Update PO status
export const updatePOStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body as {
      status: PurchaseOrderStatus;
      notes?: string;
    };
    
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const poId = parseInt(id, 10);
    if (isNaN(poId)) {
      return res.status(400).json({ error: 'Invalid purchase order ID' });
    }
    
    // Validate status
    const validStatuses: PurchaseOrderStatus[] = ['PENDING_APPROVAL', 'APPROVED', 'ORDERED', 'RECEIVED', 'CANCELLED', 'REJECTED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    // Get current PO
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: { 
        ticket: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true }
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true, email: true }
        },
        items: true
      }
    });
    
    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    
    // Check access
    const access = await checkPOAccess(user, po.id);
    if (!access.allowed) {
      return res.status(403).json({ error: access.error });
    }
    
    // Check status transition rules
    const validTransitions: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
      'DRAFT': ['PENDING_APPROVAL'],
      'PENDING_APPROVAL': ['APPROVED', 'REJECTED'],
      'APPROVED': ['ORDERED', 'CANCELLED'],
      'ORDERED': ['RECEIVED', 'CANCELLED'],
      'RECEIVED': [],
      'CANCELLED': [],
      'REJECTED': []
    };
    
    if (!validTransitions[po.status as keyof typeof validTransitions].includes(status)) {
      return res.status(400).json({ 
        error: `Cannot change status from ${po.status} to ${status}` 
      });
    }
    
    // Prepare update data
    const updateData: any = {
      status,
      updatedAt: new Date()
    };
    
    if (status === 'APPROVED') {
      updateData.approvedById = user.id;
      updateData.approvedAt = new Date();
    } else if (status === 'CANCELLED') {
      updateData.cancelledById = user.id;
      updateData.cancelledAt = new Date();
      updateData.cancellationReason = notes;
    }
    
    // Update PO status
    const updatedPO = await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: updateData,
      include: {
        ticket: true,
        createdBy: true,
        approvedBy: true,
        items: true
      }
    });
    
    // Update ticket status if needed
    if (status === 'APPROVED') {
      // Update ticket status to SPARE_NEEDED
      await prisma.ticket.update({
        where: { id: po.ticketId },
        data: { 
          status: 'SPARE_NEEDED' as TicketStatus,
          updatedAt: new Date()
        }
      });
      
      // Add a note about the status change
      await prisma.ticketNote.create({
        data: {
          content: 'PO approved, waiting for parts to be ordered',
          ticketId: po.ticketId,
          authorId: user.id
        }
      });
    } else if (status === 'ORDERED' && po.ticket.status === 'SPARE_NEEDED') {
      // Update ticket status to PARTS_ORDERED
      await prisma.ticket.update({
        where: { id: po.ticketId },
        data: { 
          status: 'IN_PROGRESS' as TicketStatus, // Using IN_PROGRESS since PARTS_ORDERED doesn't exist in TicketStatus enum
          updatedAt: new Date()
        }
      });
      
      // Add a note about the status change
      await prisma.ticketNote.create({
        data: {
          content: 'Parts have been ordered, waiting for delivery',
          ticketId: po.ticketId,
          authorId: user.id
        }
      });
    } else if (status === 'RECEIVED' && po.ticket.status === 'IN_PROGRESS') {
      // Update ticket status to IN_PROGRESS (already in progress, just add a note)
      await prisma.ticketNote.create({
        data: {
          content: 'Parts received, work in progress',
          ticketId: po.ticketId,
          authorId: user.id
        }
      });
    }

    return res.json(updatedPO);
  } catch (error) {
    console.error('Error updating PO status:', error);
    return res.status(500).json({ error: 'Failed to update PO status' });
  }
};

// Add item to PO
export const addPOItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { description, quantity, unitPrice } = req.body;
    const user = req.user;

    // Only allow adding items to POs in draft or pending approval
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: Number(id) },
      select: { 
        status: true,
        ticket: {
          select: { assignedToId: true }
        }
      }
    });

    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    if (!['DRAFT', 'PENDING_APPROVAL'].includes(po.status)) {
      return res.status(400).json({ 
        error: 'Cannot add items to a PO that is not in draft or pending approval' 
      });
    }

    // Only the creator or admin can add items
    if (user.role !== UserRole.ADMIN && 
        po.ticket.assignedToId !== user.id) {
      return res.status(403).json({ 
        error: 'You can only add items to your own POs' 
      });
    }

    const item = await prisma.purchaseOrderItem.create({
      data: {
        description,
        quantity,
        unitPrice,
        total: quantity * unitPrice,
        purchaseOrder: { connect: { id: Number(id) } }
      }
    });

    // Update PO total amount
    await prisma.purchaseOrder.update({
      where: { id: Number(id) },
      data: {
        totalAmount: {
          increment: item.total
        }
      }
    });

    return res.status(201).json(item);
  } catch (error) {
    console.error('Error adding PO item:', error);
    return res.status(500).json({ error: 'Failed to add item to PO' });
  }
};
