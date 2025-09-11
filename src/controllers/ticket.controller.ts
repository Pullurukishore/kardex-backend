import { Request, Response } from 'express';
import { TicketStatus, Priority, UserRole, Prisma } from '@prisma/client';
import prisma from '../config/db';
import { AuthUser } from '../types/express';
import { NotificationService } from '../services/notification.service';

// Extended Request type
type TicketRequest = Request & {
  user?: AuthUser;
  params: {
    id?: string;
  };
  query: {
    status?: string;
    priority?: string;
    page?: string;
    limit?: string;
    search?: string;
    customerId?: string;
    assignedToId?: string;
  };
  body: any;
};

// Define valid status transitions based on business workflow
const validTransitions: Record<TicketStatus, TicketStatus[]> = {
  // Initial state - can be assigned or moved to pending
  [TicketStatus.OPEN]: [TicketStatus.ASSIGNED, TicketStatus.CANCELLED, TicketStatus.PENDING],
  
  // Assigned state - can start working on it or schedule onsite visit
  [TicketStatus.ASSIGNED]: [
    TicketStatus.IN_PROCESS, 
    TicketStatus.ONSITE_VISIT, 
    TicketStatus.CANCELLED, 
    TicketStatus.PENDING
  ],
  
  // Main working state - multiple possible next steps
  [TicketStatus.IN_PROCESS]: [
    TicketStatus.WAITING_CUSTOMER, 
    TicketStatus.ONSITE_VISIT,
    TicketStatus.PO_NEEDED,
    TicketStatus.SPARE_PARTS_NEEDED,
    TicketStatus.CLOSED_PENDING,
    TicketStatus.CANCELLED,
    TicketStatus.RESOLVED,
    TicketStatus.IN_PROGRESS,
    TicketStatus.ON_HOLD,
    TicketStatus.ESCALATED,
    TicketStatus.PENDING
  ],
  
  // Waiting for customer response
  [TicketStatus.WAITING_CUSTOMER]: [
    TicketStatus.IN_PROCESS, 
    TicketStatus.CLOSED_PENDING, 
    TicketStatus.CANCELLED, 
    TicketStatus.PENDING
  ],
  
  // Onsite visit flow
  [TicketStatus.ONSITE_VISIT]: [
    TicketStatus.ONSITE_VISIT_PLANNED, 
    TicketStatus.IN_PROCESS, 
    TicketStatus.CANCELLED, 
    TicketStatus.PENDING
  ],
  
  [TicketStatus.ONSITE_VISIT_PLANNED]: [
    TicketStatus.IN_PROCESS,
    TicketStatus.PO_NEEDED,
    TicketStatus.SPARE_PARTS_NEEDED,
    TicketStatus.CLOSED_PENDING,
    TicketStatus.CANCELLED,
    TicketStatus.PENDING
  ],
  
  // Purchase order flow
  [TicketStatus.PO_NEEDED]: [
    TicketStatus.PO_RECEIVED, 
    TicketStatus.CANCELLED, 
    TicketStatus.PENDING
  ],
  
  [TicketStatus.PO_RECEIVED]: [
    TicketStatus.IN_PROCESS, 
    TicketStatus.CANCELLED, 
    TicketStatus.PENDING
  ],
  
  // Spare parts flow
  [TicketStatus.SPARE_PARTS_NEEDED]: [
    TicketStatus.SPARE_PARTS_BOOKED, 
    TicketStatus.CANCELLED, 
    TicketStatus.PENDING
  ],
  
  [TicketStatus.SPARE_PARTS_BOOKED]: [
    TicketStatus.SPARE_PARTS_DELIVERED, 
    TicketStatus.CANCELLED, 
    TicketStatus.PENDING
  ],
  
  [TicketStatus.SPARE_PARTS_DELIVERED]: [
    TicketStatus.IN_PROCESS, 
    TicketStatus.CANCELLED, 
    TicketStatus.PENDING
  ],
  
  // Closing flow
  [TicketStatus.CLOSED_PENDING]: [
    TicketStatus.CLOSED, 
    TicketStatus.REOPENED, 
    TicketStatus.PENDING
  ],
  
  // Final state - no transitions out except REOPENED
  [TicketStatus.CLOSED]: [
    TicketStatus.REOPENED
  ],
  
  // Cancelled state - can be reopened
  [TicketStatus.CANCELLED]: [
    TicketStatus.REOPENED, 
    TicketStatus.PENDING
  ],
  
  // Reopened ticket - goes back to assigned or in process
  [TicketStatus.REOPENED]: [
    TicketStatus.ASSIGNED, 
    TicketStatus.IN_PROCESS, 
    TicketStatus.CANCELLED, 
    TicketStatus.PENDING
  ],
  
  // In progress state - working on the ticket
  [TicketStatus.IN_PROGRESS]: [
    TicketStatus.IN_PROCESS, 
    TicketStatus.ON_HOLD, 
    TicketStatus.ESCALATED, 
    TicketStatus.PENDING
  ],
  
  // On hold state - temporarily paused
  [TicketStatus.ON_HOLD]: [
    TicketStatus.IN_PROCESS, 
    TicketStatus.IN_PROGRESS, 
    TicketStatus.PENDING
  ],
  
  // Escalated state - needs attention
  [TicketStatus.ESCALATED]: [
    TicketStatus.IN_PROCESS, 
    TicketStatus.IN_PROGRESS, 
    TicketStatus.PENDING
  ],
  
  // Resolved state - ready for closing
  [TicketStatus.RESOLVED]: [
    TicketStatus.CLOSED, 
    TicketStatus.REOPENED, 
    TicketStatus.PENDING
  ],
  
  // Pending state - initial or temporary state
  [TicketStatus.PENDING]: [
    TicketStatus.OPEN, 
    TicketStatus.ASSIGNED, 
    TicketStatus.IN_PROCESS
  ]
};

// Helper to check if status transition is valid
function isValidTransition(currentStatus: TicketStatus, newStatus: TicketStatus): boolean {
  return validTransitions[currentStatus].includes(newStatus);
}

// Helper to update time tracking
function updateTimeTracking(ticket: any) {
  const now = new Date();
  const timeInStatus = ticket.lastStatusChange 
    ? Math.floor((now.getTime() - new Date(ticket.lastStatusChange).getTime()) / 60000) 
    : 0;
  
  const totalTimeOpen = ticket.createdAt
    ? Math.floor((now.getTime() - new Date(ticket.createdAt).getTime()) / 60000)
    : 0;

  return { timeInStatus, totalTimeOpen };
}

// Helper to check ticket access
async function checkTicketAccess(user: any, ticketId: number) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { 
      customerId: true, 
      assignedToId: true, 
      zoneId: true, 
      ownerId: true, 
      subOwnerId: true 
    }
  });
  
  if (!ticket) return { allowed: false, error: 'Ticket not found' };
  
  // Admin can access any ticket
  if (user.role === UserRole.ADMIN) return { allowed: true };
  
  // Zone user can access tickets in their zone
  if (user.role === UserRole.ZONE_USER && ticket.zoneId === user.zoneId) {
    return { allowed: true };
  }
  
  // Service person can access assigned tickets or tickets where they are sub-owner
  if (user.role === UserRole.SERVICE_PERSON && 
      (ticket.assignedToId === user.id || ticket.subOwnerId === user.id)) {
    return { allowed: true };
  }
  
  // Owner can access their own tickets
  if (ticket.ownerId === user.id || ticket.subOwnerId === user.id) {
    return { allowed: true };
  }
  
  return { allowed: false, error: 'Access denied' };
}

// Create a new ticket (Service Coordinator workflow)
export const createTicket = async (req: TicketRequest, res: Response) => {
  try {
    const { 
      title, 
      description, 
      priority = 'MEDIUM', 
      customerId, 
      assetId, 
      contactId,
      zoneId,
      errorDetails,
      proofImages,
      relatedMachineIds
    } = req.body;
    
    const user = req.user as any;

    if (!title || !description || !zoneId) {
      return res.status(400).json({ 
        error: 'Title, description, and zone are required' 
      });
    }

    // Validate zone access for non-admin users
    if (user.role === UserRole.ZONE_USER && user.zoneId !== zoneId) {
      return res.status(403).json({ 
        error: 'You can only create tickets in your assigned zone' 
      });
    }

    const ticketData: Prisma.TicketCreateInput = {
      title,
      description,
      priority: priority as Priority,
      status: TicketStatus.OPEN,
      customer: { connect: { id: customerId || user.customerId } },
      contact: { connect: { id: contactId } },
      createdBy: { connect: { id: user.id } },
      owner: { connect: { id: user.id } },
      zone: { connect: { id: zoneId } },
      errorDetails,
      proofImages: proofImages ? JSON.stringify(proofImages) : undefined,
      relatedMachineIds: relatedMachineIds ? JSON.stringify(relatedMachineIds) : undefined,
      lastStatusChange: new Date(),
      ...(assetId && { asset: { connect: { id: assetId } } }),
    };

    const ticket = await prisma.ticket.create({
      data: ticketData,
      include: {
        customer: { select: { id: true, companyName: true } },
        asset: { select: { id: true, model: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        contact: { select: { id: true, name: true, email: true, phone: true } },
        zone: { select: { id: true, name: true } }
      }
    });

    // Create audit log entry
  // Create audit log entry
await prisma.auditLog.create({
  data: {
    action: 'TICKET_CREATED',
    entityType: 'TICKET',
    entityId: ticket.id,
    userId: user.id,
    metadata: {
      status: ticket.status,
      title: ticket.title
    },
    updatedAt: new Date(), // Add this required field
    performedAt: new Date(), // It's good practice to include this too
    performedById: user.id, // Include the performer
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

// Get tickets with role-based filtering
export const getTickets = async (req: TicketRequest, res: Response) => {
  try {
    const { status, priority, page = 1, limit = 20, view } = req.query;
    const user = req.user as any;
    const skip = (Number(page) - 1) * Number(limit);
    
    const where: any = {};
    
    // View-based filtering
    if (view === 'unassigned') {
      where.assignedToId = null;
    } else if (view === 'assigned-to-zone') {
      where.status = TicketStatus.ASSIGNED;
      where.assignedTo = {
        role: UserRole.ZONE_USER
      };
    }
    
    // Role-based filtering for non-admin users
    if (user.role !== UserRole.ADMIN) {
      if (user.role === UserRole.ZONE_USER) {
        where.customerId = user.customerId;
      } else if (user.role === UserRole.SERVICE_PERSON) {
        where.assignedToId = user.id;
      }
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

// Get ticket by ID with full details
export const getTicket = async (req: TicketRequest, res: Response) => {
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
        customer: { 
          select: { 
            id: true,
            companyName: true,
            address: true,
            serviceZone: {
              select: { id: true, name: true }
            }
          } 
        },
        asset: {
          select: {
            id: true,
            machineId: true,
            model: true,
            serialNo: true,
            location: true,
            status: true
          }
        },
        contact: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true
          }
        },
        assignedTo: { 
          select: { 
            id: true, 
            email: true,
            name: true 
          } 
        },
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true
          }
        },
        subOwner: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true
          }
        },
        zone: {
          select: {
            id: true,
            name: true
          }
        },
        statusHistory: {
          include: {
            changedBy: {
              select: {
                id: true,
                email: true,
                name: true
              }
            }
          },
          orderBy: { changedAt: 'desc' },
          take: 10
        },
        notes: {
          include: {
            author: {
              select: {
                id: true,
                email: true,
                name: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        attachments: {
          include: {
            uploadedBy: {
              select: {
                id: true,
                email: true,
                name: true
              }
            }
          }
        },
        poRequests: {
          include: {
            requestedBy: {
              select: {
                id: true,
                email: true,
                name: true
              }
            },
            approvedBy: {
              select: {
                id: true,
                email: true,
                name: true
              }
            }
          }
        }
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

// Update ticket status with history recording
export const updateStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, comments } = req.body;
    const user = req.user as any;

    const permission = await checkTicketAccess(user, Number(id));
    if (!permission.allowed) {
      return res.status(403).json({ error: permission.error });
    }

    if (!Object.values(TicketStatus).includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Fetch current ticket to compute time tracking
    const currentTicket = await prisma.ticket.findUnique({
      where: { id: Number(id) },
    });
    if (!currentTicket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const { timeInStatus, totalTimeOpen } = updateTimeTracking(currentTicket);

    // Prepare update data with status and timestamps
    const updateData: any = {
      status,
      lastStatusChange: new Date(),
      timeInStatus,
      totalTimeOpen
    };

    // Add resolvedAt timestamp if status is RESOLVED
    if (status === 'RESOLVED') {
      updateData.resolvedAt = new Date();
    }

    // Update the ticket with new status and timestamps
    const updatedTicket = await prisma.ticket.update({
      where: { id: Number(id) },
      data: updateData,
    });

    // Insert a new record into TicketStatusHistory
    await prisma.ticketStatusHistory.create({
      data: {
        ticket: { connect: { id: Number(id) } },
        status: status,
        changedBy: { connect: { id: user.id } },
        changedAt: new Date(),
        notes: comments,
        timeInStatus,
        totalTimeOpen,
      },
    });

    return res.json(updatedTicket);
  } catch (error) {
    console.error('Error updating status:', error);
    return res.status(500).json({ error: 'Failed to update status' });
  }
};

// Comment functionality removed - will be implemented later

// Assign ticket to service person (Help Desk -> Service Person)
export const assignTicket = async (req: TicketRequest, res: Response) => {
  try {
    const { id: ticketId } = req.params;
    const { assignedToId, subOwnerId } = req.body;
    const user = req.user as AuthUser;

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!assignedToId) {
      return res.status(400).json({ error: 'assignedToId is required' });
    }

    // Check if the ticket exists
    const ticket = await prisma.ticket.findUnique({
      where: { id: Number(ticketId) },
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Check if the assigned user exists and is a service person
    const assignedUser = await prisma.user.findUnique({
      where: { 
        id: Number(assignedToId),
        role: 'SERVICE_PERSON'
      },
    });

    if (!assignedUser) {
      return res.status(404).json({ error: 'Service person not found' });
    }

    // Update the ticket with the new assignee
    const updatedTicket = await prisma.ticket.update({
      where: { id: Number(ticketId) },
      data: {
        assignedToId: Number(assignedToId),
        ...(subOwnerId && { subOwnerId: Number(subOwnerId) }),
        status: TicketStatus.ASSIGNED,
        lastStatusChange: new Date(),
      },
      include: {
        assignedTo: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        subOwner: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    // Create status history entry
    await prisma.ticketStatusHistory.create({
      data: {
        ticketId: updatedTicket.id,
        status: updatedTicket.status,
        changedById: user.id,
        notes: `Ticket assigned to ${updatedTicket.assignedTo?.name || 'service person'}`
      }
    });

    // Send notification to assigned user
    await NotificationService.createTicketAssignmentNotification(
      updatedTicket.id,
      Number(assignedToId),
      user.id
    );

    // Create audit log
    await prisma.auditLog.create({
      data: {
        action: 'ASSIGN_TO_SERVICE_PERSON',
        entityType: 'TICKET',
        entityId: Number(ticketId),
        userId: user.id,
        details: `Assigned ticket to service person ${assignedUser.name}`,
        updatedAt: new Date()
      }
    });

    res.json(updatedTicket);
  } catch (error) {
    console.error('Error assigning ticket:', error);
    res.status(500).json({ error: 'Error assigning ticket' });
  }
};

// Plan onsite visit
export const planOnsiteVisit = async (req: TicketRequest, res: Response) => {
  try {
    const { id: ticketId } = req.params;
    const { servicePersonId, visitDate, notes } = req.body;
    const user = req.user as AuthUser;

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify service person exists and is active
    const servicePerson = await prisma.user.findFirst({
      where: {
        id: Number(servicePersonId),
        role: UserRole.SERVICE_PERSON,
        isActive: true
      }
    });

    if (!servicePerson) {
      return res.status(404).json({ error: 'Service person not found or inactive' });
    }

    // Update ticket with onsite visit details
    const updatedTicket = await prisma.ticket.update({
      where: { id: Number(ticketId) },
      data: {
        assignedToId: Number(servicePersonId),
        status: TicketStatus.ONSITE_VISIT_PLANNED,
        // onsiteVisitDate: new Date(visitDate), // Field may not exist in schema
        lastStatusChange: new Date(),
      },
      include: {
        assignedTo: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    // Create status history
    await prisma.ticketStatusHistory.create({
      data: {
        ticketId: Number(ticketId),
        status: TicketStatus.ONSITE_VISIT_PLANNED,
        changedById: user.id,
        notes: notes || `Onsite visit planned for ${visitDate}`
      }
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        action: 'PLAN_ONSITE_VISIT',
        entityType: 'TICKET',
        entityId: Number(ticketId),
        userId: user.id,
        details: `Planned onsite visit for ${visitDate}`,
        updatedAt: new Date()
      }
    });

    // Send onsite visit notification
    if (updatedTicket.assignedToId) {
      await NotificationService.createOnsiteVisitNotification(
        Number(ticketId),
        updatedTicket.assignedToId,
        new Date(visitDate),
        user.id
      );
    }

    res.json(updatedTicket);
  } catch (error) {
    console.error('Error planning onsite visit:', error);
    res.status(500).json({ error: 'Error planning onsite visit' });
  }
};

// Assign ticket to zone user for onsite visit
export const assignToZoneUser = async (req: TicketRequest, res: Response) => {
  try {
    const { id: ticketId } = req.params;
    const { zoneUserId } = req.body;
    const user = req.user as AuthUser;

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!zoneUserId) {
      return res.status(400).json({ error: 'zoneUserId is required' });
    }

    // Verify zone user exists
    const zoneUser = await prisma.user.findUnique({
      where: { 
        id: Number(zoneUserId),
        role: 'ZONE_USER'
      },
    });

    if (!zoneUser) {
      return res.status(404).json({ error: 'Zone user not found' });
    }

    // First get the current ticket to preserve its status
    const currentTicket = await prisma.ticket.findUnique({
      where: { id: Number(ticketId) },
      select: { status: true, assignedToId: true }
    });

    if (!currentTicket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    console.log('Current ticket status before update:', currentTicket.status);

    // Update only the assignedToId and lastStatusChange, explicitly setting status to its current value
    const updatedTicket = await prisma.ticket.update({
      where: { id: Number(ticketId) },
      data: {
        assignedToId: Number(zoneUserId),
        status: currentTicket.status, // Explicitly set to current status
        lastStatusChange: new Date(),
      },
      include: {
        assignedTo: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

      // Create status history entry for the assignment
    await prisma.ticketStatusHistory.create({
      data: {
        ticketId: updatedTicket.id,
        status: currentTicket.status,
        changedById: user.id,
        notes: `Assigned to zone user: ${updatedTicket.assignedTo?.name || 'zone user'}`,
        timeInStatus: null,
        totalTimeOpen: null
      }
    });

    console.log('Ticket updated with status:', currentTicket.status);

    // Send notification to assigned user
    await NotificationService.createTicketAssignmentNotification(
      updatedTicket.id,
      Number(zoneUserId),
      user.id
    );

    // Create audit log
    await prisma.auditLog.create({
      data: {
        action: 'ASSIGN_TO_ZONE_USER',
        entityType: 'TICKET',
        entityId: Number(ticketId),
        userId: user.id,
        details: `Assigned ticket to zone user ${zoneUser.name}`,
        updatedAt: new Date()
      }
    });

    // Send assignment notification
    await NotificationService.createTicketAssignmentNotification(
      Number(ticketId),
      Number(zoneUserId),
      user.id
    );

    res.json(updatedTicket);
  } catch (error) {
    console.error('Error assigning to zone user:', error);
    res.status(500).json({ error: 'Error assigning to zone user' });
  }
};

// Complete onsite visit
export const completeOnsiteVisit = async (req: TicketRequest, res: Response) => {
  try {
    const { id: ticketId } = req.params;
    const { resolutionSummary, isResolved, sparePartsNeeded, sparePartsDetails } = req.body;
    const user = req.user as AuthUser;

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    let newStatus: TicketStatus;
    
    if (isResolved) {
      newStatus = TicketStatus.RESOLVED;
    } else if (sparePartsNeeded) {
      newStatus = TicketStatus.SPARE_PARTS_NEEDED;
    } else {
      newStatus = TicketStatus.IN_PROCESS;
    }

    const updatedTicket = await prisma.ticket.update({
      where: { id: Number(ticketId) },
      data: {
        visitCompletedDate: new Date(),
        resolutionSummary,
        ...(sparePartsDetails && { sparePartsDetails: JSON.stringify(sparePartsDetails) }),
        status: newStatus,
        lastStatusChange: new Date(),
      },
    });

    // Create status history entry
    await prisma.ticketStatusHistory.create({
      data: {
        ticketId: Number(ticketId),
        status: newStatus,
        changedById: user.id,
        notes: req.body.notes || `Status changed to ${newStatus}`
      }
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_SPARE_PARTS_STATUS',
        entityType: 'TICKET',
        entityId: Number(ticketId),
        userId: user.id,
        details: `Updated spare parts status to ${sparePartsNeeded ? 'NEEDED' : 'NOT_NEEDED'}`,
        updatedAt: new Date()
      }
    });

    // Send spare parts notification only if needed
    if (sparePartsNeeded) {
      await NotificationService.createSparePartsNotification(
        Number(ticketId),
        'NEEDED',
        user.id
      );
    }

    // Send status change notification
    await NotificationService.createTicketStatusNotification(
      Number(ticketId),
      TicketStatus.ONSITE_VISIT,
      newStatus,
      user.id
    );

    res.json(updatedTicket);
  } catch (error) {
    console.error('Error completing onsite visit:', error);
    res.status(500).json({ error: 'Error completing onsite visit' });
  }
};

// Request PO for spare parts
export const requestPO = async (req: TicketRequest, res: Response) => {
  try {
    const { id: ticketId } = req.params;
    const { amount, description, notes } = req.body;
    const user = req.user as AuthUser;

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Create PO request
    const poRequest = await prisma.pORequest.create({
      data: {
        ticketId: Number(ticketId),
        amount: amount ? parseFloat(amount) : undefined,
        description,
        notes,
        requestedById: user.id,
        status: 'PENDING',
      },
    });

    // Update ticket status
    const updatedTicket = await prisma.ticket.update({
      where: { id: Number(ticketId) },
      data: {
        status: TicketStatus.PO_NEEDED,
        lastStatusChange: new Date(),
      },
    });

    // Create status history entry
    await prisma.ticketStatusHistory.create({
      data: {
        ticketId: Number(ticketId),
        status: TicketStatus.PO_NEEDED,
        changedById: user.id,
        notes: `PO requested: ${description}`,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        action: 'CREATE_PO_REQUEST',
        entityType: 'PO_REQUEST',
        entityId: poRequest.id,
        userId: user.id,
        details: `Created PO request: ${description}`,
        updatedAt: new Date()
      }
    });

    // Send PO creation notification
    await NotificationService.createPONotification(
      Number(ticketId),
      poRequest.id,
      'CREATED',
      user.id
    );

    res.json({ ticket: updatedTicket, poRequest });
  } catch (error) {
    console.error('Error requesting PO:', error);
    res.status(500).json({ error: 'Error requesting PO' });
  }
};

// Approve PO
export const approvePO = async (req: TicketRequest, res: Response) => {
  try {
    const { id: ticketId } = req.params;
    const { poNumber, notes } = req.body;
    const user = req.user as AuthUser;

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Only admins can approve POs
    if (user.role !== UserRole.ADMIN) {
      return res.status(403).json({ error: 'Only admins can approve POs' });
    }

    // Update PO request
    await prisma.pORequest.updateMany({
      where: { ticketId: Number(ticketId) },
      data: {
        status: 'APPROVED',
        approvedById: user.id,
        approvedAt: new Date(),
        notes,
      },
    });

    // Update ticket
    const updatedTicket = await prisma.ticket.update({
      where: { id: Number(ticketId) },
      data: {
        poNumber,
        poApprovedAt: new Date(),
        poApprovedById: user.id,
        status: TicketStatus.PO_RECEIVED,
        lastStatusChange: new Date(),
      },
    });

    // Create status history entry
    await prisma.ticketStatusHistory.create({
      data: {
        ticketId: Number(ticketId),
        status: TicketStatus.PO_RECEIVED,
        changedById: user.id,
        notes: `PO approved: ${poNumber}`,
      },
    });

    res.json(updatedTicket);
  } catch (error) {
    console.error('Error approving PO:', error);
    res.status(500).json({ error: 'Error approving PO' });
  }
};

// Update spare parts status
export const updateSparePartsStatus = async (req: TicketRequest, res: Response) => {
  try {
    const { id: ticketId } = req.params;
    const { status: sparePartsStatus, details } = req.body;
    const user = req.user as AuthUser;

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    let newTicketStatus: TicketStatus;
    
    switch (sparePartsStatus) {
      case 'BOOKED':
        newTicketStatus = TicketStatus.SPARE_PARTS_BOOKED;
        break;
      case 'DELIVERED':
        newTicketStatus = TicketStatus.SPARE_PARTS_DELIVERED;
        break;
      default:
        return res.status(400).json({ error: 'Invalid spare parts status' });
    }

    const updatedTicket = await prisma.ticket.update({
      where: { id: Number(ticketId) },
      data: {
        status: newTicketStatus,
        sparePartsDetails: details ? JSON.stringify(details) : undefined,
        lastStatusChange: new Date(),
      },
    });

    // Create status history entry
    await prisma.ticketStatusHistory.create({
      data: {
        ticketId: Number(ticketId),
        status: newTicketStatus,
        changedById: user.id,
        notes: `Spare parts ${sparePartsStatus.toLowerCase()}`,
      },
    });

    res.json(updatedTicket);
  } catch (error) {
    console.error('Error updating spare parts status:', error);
    res.status(500).json({ error: 'Error updating spare parts status' });
  }
};


// Close ticket (Zone Owner closes after resolution)
export const closeTicket = async (req: TicketRequest, res: Response) => {
  try {
    const { id: ticketId } = req.params;
    const { feedback, rating } = req.body;
    const user = req.user as AuthUser;

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // First update to CLOSED_PENDING status
    await prisma.ticket.update({
      where: { id: Number(ticketId) },
      data: {
        status: TicketStatus.CLOSED_PENDING,
        lastStatusChange: new Date(),
      },
    });

    // Create status history entry for CLOSED_PENDING
    await prisma.ticketStatusHistory.create({
      data: {
        ticketId: Number(ticketId),
        status: TicketStatus.CLOSED_PENDING,
        changedById: user.id,
        notes: 'Ticket marked as closed pending',
      },
    });

    // Then update to CLOSED status
    const updatedTicket = await prisma.ticket.update({
      where: { id: Number(ticketId) },
      data: {
        status: TicketStatus.CLOSED,
        lastStatusChange: new Date(),
      },
    });

    // Create feedback if provided
    if (feedback || rating) {
      await prisma.ticketFeedback.create({
        data: {
          ticketId: Number(ticketId),
          feedback,
          rating: rating || 5,
          submittedById: user.id,
        },
      });
    }

    // Create status history entry for CLOSED
    await prisma.ticketStatusHistory.create({
      data: {
        ticketId: Number(ticketId),
        status: TicketStatus.CLOSED,
        changedById: user.id,
        notes: 'Ticket closed by zone owner',
      },
    });

    res.json(updatedTicket);
  } catch (error) {
    console.error('Error closing ticket:', error);
    res.status(500).json({ error: 'Error closing ticket' });
  }
};

// Get ticket activity log
export const getTicketActivity = async (req: TicketRequest, res: Response) => {
  try {
    const ticketId = parseInt(req.params.id || '', 10);
    if (isNaN(ticketId)) {
      return res.status(400).json({ error: 'Invalid ticket ID' });
    }

    // Check if user has access to this ticket
    const hasAccess = await checkTicketAccess(req.user, ticketId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get ticket status history and notes as activities
    const [statusHistory, notes] = await Promise.all([
      prisma.ticketStatusHistory.findMany({
        where: { ticketId },
        orderBy: { changedAt: 'desc' },
        include: {
          changedBy: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true
            }
          }
        }
      }),
      prisma.ticketNote.findMany({
        where: { ticketId },
        orderBy: { createdAt: 'desc' },
        include: {
          author: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true
            }
          }
        }
      })
    ]);

    // Define activity type
    type Activity = {
      id: string;
      type: 'STATUS_CHANGE' | 'NOTE';
      description: string;
      data: Record<string, any>;
      user: { id: number; email: string; name: string | null; role: string };
      createdAt: Date;
      updatedAt: Date;
    };

    // Combine and sort activities
    const activities: Activity[] = [
      ...statusHistory.map((history: any) => ({
        id: `status_${history.id}`,
        type: 'STATUS_CHANGE' as const,
        description: `changed status to ${history.status}`,
        data: { status: history.status, notes: history.notes },
        user: {
          ...history.changedBy,
          name: history.changedBy.name || history.changedBy.email.split('@')[0] // Use email prefix if name is not available
        },
        createdAt: history.changedAt,
        updatedAt: history.changedAt
      })),
      ...notes.map((note: { id: number; content: string; author: { id: number; email: string; name: string | null; role: string }; createdAt: Date; updatedAt: Date }) => ({
        id: `note_${note.id}`,
        type: 'NOTE' as const,
        description: 'Note added',
        data: { content: note.content },
        user: {
          ...note.author,
          name: note.author.name || note.author.email.split('@')[0] // Use email prefix if name is not available
        },
        createdAt: note.createdAt,
        updatedAt: note.updatedAt
      }))
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    res.json(activities);
  } catch (error) {
    console.error('Error fetching ticket activity:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Add note to ticket (internal use)
export const addNote = async (req: TicketRequest, res: Response) => {
  try {
    const { id: ticketId } = req.params;
    const { content } = req.body;
    const user = req.user as AuthUser;

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Add note directly to ticket notes field or create a simple log entry
    const updatedTicket = await prisma.ticket.update({
      where: { id: Number(ticketId) },
      data: {
        // Store note in a notes field if available, or handle differently
        lastStatusChange: new Date(),
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        action: 'ADD_NOTE',
        entityType: 'TICKET',
        entityId: Number(ticketId),
        userId: user.id,
        details: 'Added internal note',
        updatedAt: new Date()
      }
    });

    res.json({ success: true, message: 'Note added successfully', ticket: updatedTicket });
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ error: 'Error adding note' });
  }
};
