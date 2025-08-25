import { Request, Response } from 'express';
import { TicketStatus, Priority, UserRole } from '@prisma/client';
import prisma from '../config/db';

// Helper to check ticket access
async function checkTicketAccess(user: any, ticketId: number) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { customerId: true, assignedToId: true }
  });
  
  if (!ticket) return { allowed: false, error: 'Ticket not found' };
  
  // Admin can access any ticket
  if (user.role === UserRole.ADMIN) return { allowed: true };
  
  // Customer can access their own tickets
  if (user.role === UserRole.CUSTOMER_OWNER && ticket.customerId === user.customerId) {
    return { allowed: true };
  }
  
  // Service person can access assigned tickets
  if (user.role === UserRole.SERVICE_PERSON && ticket.assignedToId === user.id) {
    return { allowed: true };
  }
  
  return { allowed: false, error: 'Access denied' };
}

// Create a new ticket
export const createTicket = async (req: Request, res: Response) => {
  try {
    const { title, description, priority = 'MEDIUM', customerId, assetId } = req.body;
    const user = req.user as any;

    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    const ticket = await prisma.ticket.create({
      data: {
        title,
        description,
        priority: priority as Priority,
        status: 'WAITING_FOR_RESPONSE',
        customer: { connect: { id: customerId || user.customerId } },
        createdBy: { connect: { id: user.id } },
        ...(assetId && { asset: { connect: { id: assetId } } }),
      },
      include: {
        customer: { select: { id: true, companyName: true } },
        asset: { select: { id: true, model: true } },
        createdBy: { select: { id: true } }
      }
    });

    return res.status(201).json(ticket);
  } catch (error: any) {
    console.error('Error creating ticket:', error);
    return res.status(500).json({ 
      error: 'Failed to create ticket', 
      details: error?.message || 'Unknown error occurred' 
    });
  }
};

// Get tickets with filters
export const getTickets = async (req: Request, res: Response) => {
  try {
    const { status, priority, page = 1, limit = 20 } = req.query;
    const user = req.user as any; // Type assertion as we know the user will be defined due to auth middleware
    const skip = (Number(page) - 1) * Number(limit);
    
    const where: any = {};
    
    // Role-based filtering
    if (user.role === UserRole.CUSTOMER_OWNER) {
      where.customerId = user.customerId;
    } else if (user.role === UserRole.SERVICE_PERSON) {
      where.assignedToId = user.id;
    }
    
    if (status) where.status = { in: (status as string).split(',') };
    if (priority) where.priority = priority;

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { companyName: true } },
          assignedTo: { 
            select: { 
              id: true,
              email: true  
            } 
          }
        }
      }),
      prisma.ticket.count({ where })
    ]);

    return res.json({
      data: tickets,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    return res.status(500).json({ error: 'Failed to fetch tickets' });
  }
};

// Get ticket by ID
export const getTicket = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user as any; // Type assertion as we know the user will be defined due to auth middleware

    const permission = await checkTicketAccess(user, Number(id));
    if (!permission.allowed) {
      return res.status(403).json({ error: permission.error });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: Number(id) },
      include: {
        customer: { select: { companyName: true } },
        asset: true,
        assignedTo: { select: { id: true } },
        // Comments temporarily removed as it's not in the schema
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    return res.json(ticket);
  } catch (error) {
    console.error('Error fetching ticket:', error);
    return res.status(500).json({ error: 'Failed to fetch ticket' });
  }
};

// Update ticket status
export const updateStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, comments } = req.body;
    const user = req.user as any; // Type assertion as we know the user will be defined due to auth middleware

    const permission = await checkTicketAccess(user, Number(id));
    if (!permission.allowed) {
      return res.status(403).json({ error: permission.error });
    }

    if (!Object.values(TicketStatus).includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const ticket = await prisma.ticket.update({
      where: { id: Number(id) },
      data: {
        status,
        ...(status === 'RESOLVED' && { resolvedAt: new Date() }),
        ...(status === 'CLOSED' && { closedAt: new Date() }),
        // Status history is handled by a separate table in the schema
        // Consider implementing a separate endpoint for status history if needed
      },
      include: {
        customer: { select: { id: true } },
        assignedTo: { select: { id: true } }
      }
    });

    return res.json(ticket);
  } catch (error) {
    console.error('Error updating status:', error);
    return res.status(500).json({ error: 'Failed to update status' });
  }
};

// Add comment to ticket
export const addComment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content, isInternal = false } = req.body;
    const user = req.user as any; // Type assertion as we know the user will be defined due to auth middleware

    const permission = await checkTicketAccess(user, Number(id));
    if (!permission.allowed) {
      return res.status(403).json({ error: permission.error });
    }

    if (user.role === UserRole.CUSTOMER_OWNER && isInternal) {
      return res.status(403).json({ error: 'Cannot add internal comments' });
    }

    // Comment functionality temporarily disabled as it's not in the schema
    return res.status(201).json({ 
      message: 'Comment functionality will be implemented soon',
      content,
      isInternal,
      ticketId: Number(id),
      userId: user.id
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    return res.status(500).json({ error: 'Failed to add comment' });
  }
};

// Assign ticket to service person
export const assignTicket = async (req: Request, res: Response) => {
  try {
    const { id: ticketId } = req.params;
    const { assignedToId } = req.body;
    const userId = req.user?.id;

    if (!assignedToId) {
      return res.status(400).json({ message: 'assignedToId is required' });
    }

    // Check if the ticket exists
    const ticket = await prisma.ticket.findUnique({
      where: { id: Number(ticketId) },
    });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Check if the assigned user exists and is a service person
    const assignedUser = await prisma.user.findUnique({
      where: { 
        id: Number(assignedToId),
        role: 'SERVICE_PERSON'
      },
    });

    if (!assignedUser) {
      return res.status(404).json({ message: 'Service person not found' });
    }

    // Update the ticket with the new assignee
    const updatedTicket = await prisma.ticket.update({
      where: { id: Number(ticketId) },
      data: {
        assignedToId: Number(assignedToId),
        status: 'IN_PROGRESS', // Update status when assigned
      },
      include: {
        assignedTo: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    res.json(updatedTicket);
  } catch (error) {
    console.error('Error assigning ticket:', error);
    res.status(500).json({ message: 'Error assigning ticket' });
  }
};
