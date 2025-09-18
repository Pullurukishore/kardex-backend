import { Request, Response } from 'express';
import prisma from '../config/db';
import { AuthUser } from '../types/express';
import { NotificationService } from '../services/notification.service';
import { TicketNotificationService } from '../services/ticket-notification.service';
import { activityController } from './activityController';

// Custom type definitions to replace problematic Prisma imports
type TicketStatus = 
  | 'OPEN' | 'ASSIGNED' | 'IN_PROCESS' | 'WAITING_CUSTOMER' | 'ONSITE_VISIT' 
  | 'ONSITE_VISIT_PLANNED' | 'PO_NEEDED' | 'PO_RECEIVED' | 'SPARE_PARTS_NEEDED' 
  | 'SPARE_PARTS_BOOKED' | 'SPARE_PARTS_DELIVERED' | 'CLOSED_PENDING' | 'CLOSED' 
  | 'CANCELLED' | 'REOPENED' | 'IN_PROGRESS' | 'ON_HOLD' | 'ESCALATED' | 'RESOLVED' | 'PENDING';

// Enum-like object for TicketStatus values
const TicketStatusEnum = {
  OPEN: 'OPEN' as const,
  ASSIGNED: 'ASSIGNED' as const,
  IN_PROCESS: 'IN_PROCESS' as const,
  WAITING_CUSTOMER: 'WAITING_CUSTOMER' as const,
  ONSITE_VISIT: 'ONSITE_VISIT' as const,
  ONSITE_VISIT_PLANNED: 'ONSITE_VISIT_PLANNED' as const,
  PO_NEEDED: 'PO_NEEDED' as const,
  PO_RECEIVED: 'PO_RECEIVED' as const,
  SPARE_PARTS_NEEDED: 'SPARE_PARTS_NEEDED' as const,
  SPARE_PARTS_BOOKED: 'SPARE_PARTS_BOOKED' as const,
  SPARE_PARTS_DELIVERED: 'SPARE_PARTS_DELIVERED' as const,
  CLOSED_PENDING: 'CLOSED_PENDING' as const,
  CLOSED: 'CLOSED' as const,
  CANCELLED: 'CANCELLED' as const,
  REOPENED: 'REOPENED' as const,
  IN_PROGRESS: 'IN_PROGRESS' as const,
  ON_HOLD: 'ON_HOLD' as const,
  ESCALATED: 'ESCALATED' as const,
  RESOLVED: 'RESOLVED' as const,
  PENDING: 'PENDING' as const,
} as const;

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// Enum-like object for UserRole values
const UserRoleEnum = {
  ADMIN: 'ADMIN' as const,
  SERVICE_PERSON: 'SERVICE_PERSON' as const,
  ZONE_USER: 'ZONE_USER' as const,
  CUSTOMER: 'CUSTOMER' as const,
} as const;

type UserRole = 'ADMIN' | 'SERVICE_PERSON' | 'ZONE_USER' | 'CUSTOMER';

// Remove custom TicketCreateInput type - use Prisma's generated types

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
  [TicketStatusEnum.OPEN]: [TicketStatusEnum.ASSIGNED, TicketStatusEnum.CANCELLED, TicketStatusEnum.PENDING],
  
  // Assigned state - can start working on it or schedule onsite visit
  [TicketStatusEnum.ASSIGNED]: [
    TicketStatusEnum.IN_PROCESS, 
    TicketStatusEnum.ONSITE_VISIT, 
    TicketStatusEnum.CANCELLED, 
    TicketStatusEnum.PENDING
  ],
  
  // Main working state - multiple possible next steps
  [TicketStatusEnum.IN_PROCESS]: [
    TicketStatusEnum.WAITING_CUSTOMER, 
    TicketStatusEnum.ONSITE_VISIT,
    TicketStatusEnum.PO_NEEDED,
    TicketStatusEnum.SPARE_PARTS_NEEDED,
    TicketStatusEnum.CLOSED_PENDING,
    TicketStatusEnum.CANCELLED,
    TicketStatusEnum.RESOLVED,
    TicketStatusEnum.IN_PROGRESS,
    TicketStatusEnum.ON_HOLD,
    TicketStatusEnum.ESCALATED,
    TicketStatusEnum.PENDING
  ],
  
  // Waiting for customer response
  [TicketStatusEnum.WAITING_CUSTOMER]: [
    TicketStatusEnum.IN_PROCESS, 
    TicketStatusEnum.CLOSED_PENDING, 
    TicketStatusEnum.CANCELLED, 
    TicketStatusEnum.PENDING
  ],
  
  // Onsite visit flow
  [TicketStatusEnum.ONSITE_VISIT]: [
    TicketStatusEnum.ONSITE_VISIT_PLANNED, 
    TicketStatusEnum.IN_PROCESS, 
    TicketStatusEnum.CANCELLED, 
    TicketStatusEnum.PENDING
  ],
  
  [TicketStatusEnum.ONSITE_VISIT_PLANNED]: [
    TicketStatusEnum.IN_PROCESS,
    TicketStatusEnum.PO_NEEDED,
    TicketStatusEnum.SPARE_PARTS_NEEDED,
    TicketStatusEnum.CLOSED_PENDING,
    TicketStatusEnum.CANCELLED,
    TicketStatusEnum.PENDING
  ],
  
  // Purchase order flow
  [TicketStatusEnum.PO_NEEDED]: [
    TicketStatusEnum.PO_RECEIVED, 
    TicketStatusEnum.CANCELLED, 
    TicketStatusEnum.PENDING
  ],
  
  [TicketStatusEnum.PO_RECEIVED]: [
    TicketStatusEnum.IN_PROCESS, 
    TicketStatusEnum.CANCELLED, 
    TicketStatusEnum.PENDING
  ],
  
  // Spare parts flow
  [TicketStatusEnum.SPARE_PARTS_NEEDED]: [
    TicketStatusEnum.SPARE_PARTS_BOOKED, 
    TicketStatusEnum.CANCELLED, 
    TicketStatusEnum.PENDING
  ],
  
  [TicketStatusEnum.SPARE_PARTS_BOOKED]: [
    TicketStatusEnum.SPARE_PARTS_DELIVERED, 
    TicketStatusEnum.CANCELLED, 
    TicketStatusEnum.PENDING
  ],
  
  [TicketStatusEnum.SPARE_PARTS_DELIVERED]: [
    TicketStatusEnum.IN_PROCESS, 
    TicketStatusEnum.CANCELLED, 
    TicketStatusEnum.PENDING
  ],
  
  // Closing flow
  [TicketStatusEnum.CLOSED_PENDING]: [
    TicketStatusEnum.CLOSED, 
    TicketStatusEnum.REOPENED, 
    TicketStatusEnum.PENDING
  ],
  
  // Final state - no transitions out except REOPENED
  [TicketStatusEnum.CLOSED]: [
    TicketStatusEnum.REOPENED
  ],
  
  // Cancelled state - can be reopened
  [TicketStatusEnum.CANCELLED]: [
    TicketStatusEnum.REOPENED, 
    TicketStatusEnum.PENDING
  ],
  
  // Reopened ticket - goes back to assigned or in process
  [TicketStatusEnum.REOPENED]: [
    TicketStatusEnum.ASSIGNED, 
    TicketStatusEnum.IN_PROCESS, 
    TicketStatusEnum.CANCELLED, 
    TicketStatusEnum.PENDING
  ],
  
  // In progress state - working on the ticket
  [TicketStatusEnum.IN_PROGRESS]: [
    TicketStatusEnum.IN_PROCESS, 
    TicketStatusEnum.ON_HOLD, 
    TicketStatusEnum.ESCALATED, 
    TicketStatusEnum.PENDING
  ],
  
  // On hold state - temporarily paused
  [TicketStatusEnum.ON_HOLD]: [
    TicketStatusEnum.IN_PROCESS, 
    TicketStatusEnum.IN_PROGRESS, 
    TicketStatusEnum.PENDING
  ],
  
  // Escalated state - needs attention
  [TicketStatusEnum.ESCALATED]: [
    TicketStatusEnum.IN_PROCESS, 
    TicketStatusEnum.IN_PROGRESS, 
    TicketStatusEnum.PENDING
  ],
  
  // Resolved state - ready for closing
  [TicketStatusEnum.RESOLVED]: [
    TicketStatusEnum.CLOSED, 
    TicketStatusEnum.REOPENED, 
    TicketStatusEnum.PENDING
  ],
  
  // Pending state - initial or temporary state
  [TicketStatusEnum.PENDING]: [
    TicketStatusEnum.OPEN, 
    TicketStatusEnum.ASSIGNED, 
    TicketStatusEnum.IN_PROCESS
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
  if (user.role === UserRoleEnum.ADMIN) return { allowed: true };
  
  // Zone user can access tickets in their zones (check against zoneIds array)
  if (user.role === UserRoleEnum.ZONE_USER && user.zoneIds && ticket.zoneId) {
    if (user.zoneIds.includes(ticket.zoneId)) {
      return { allowed: true };
    }
  }
  
  // Service person can access assigned tickets or tickets where they are sub-owner
  if (user.role === UserRoleEnum.SERVICE_PERSON && 
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
    if (user.role === UserRoleEnum.ZONE_USER && user.zoneIds && !user.zoneIds.includes(zoneId)) {
      return res.status(403).json({ 
        error: 'You can only create tickets in your assigned zone' 
      });
    }

    // Use TicketUncheckedCreateInput to pass assetId directly
    const ticketData = {
      title,
      description,
      priority: priority as Priority,
      status: TicketStatusEnum.OPEN,
      customerId: customerId || user.customerId,
      contactId: contactId,
      assetId: assetId, // Required field - must be provided
      createdById: user.id,
      ownerId: user.id,
      zoneId: zoneId,
      errorDetails,
      proofImages: proofImages ? JSON.stringify(proofImages) : undefined,
      relatedMachineIds: relatedMachineIds ? JSON.stringify(relatedMachineIds) : undefined,
      lastStatusChange: new Date(),
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

    // Send WhatsApp notification for OPEN status
    try {
      const ticketNotificationService = new TicketNotificationService();
      
      // Format phone number to ensure international format
      let customerPhone = ticket.contact?.phone || '';
      if (customerPhone && !customerPhone.startsWith('+')) {
        // Add India country code as default
        customerPhone = '+91' + customerPhone.replace(/[^0-9]/g, '');
      }
      
      await ticketNotificationService.sendTicketOpenedNotification({
        id: ticket.id.toString(),
        title: ticket.title,
        customerName: ticket.customer.companyName,
        customerPhone: customerPhone,
        customerId: ticket.customerId.toString(),
        priority: ticket.priority,
        assignedTo: ticket.assignedToId?.toString(),
        estimatedResolution: ticket.dueDate || undefined
      });
    } catch (notificationError) {
      console.error('Failed to send WhatsApp notification for ticket creation:', notificationError);
      // Don't fail the ticket creation if notification fails
    }

    return res.status(201).json(ticket);
  } catch (error: any) {
    return res.status(500).json({ 
      error: 'Failed to create ticket', 
      details: error?.message || 'Unknown error occurred' 
    });
  }
};

// Get tickets with role-based filtering
export const getTickets = async (req: TicketRequest, res: Response) => {
  try {
    const { status, priority, page = 1, limit = 20, view, search } = req.query;
    const user = req.user as any;
    const skip = (Number(page) - 1) * Number(limit);
    
    const where: any = {};
    
    // View-based filtering
    if (view === 'unassigned') {
      where.assignedToId = null;
    } else if (view === 'assigned-to-zone') {
      where.owner = {
        role: UserRoleEnum.ZONE_USER
      };
    } else if (view === 'assigned-to-service-person') {
      where.AND = [
        {
          assignedToId: {
            not: null
          }
        },
        {
          assignedTo: {
            role: UserRoleEnum.SERVICE_PERSON
          }
        }
      ];
    }
    
    // Role-based filtering for non-admin users
    if (user.role !== UserRoleEnum.ADMIN) {
      if (user.role === UserRoleEnum.ZONE_USER && user.zoneIds) {
        // Zone users can see tickets in their zones
        where.zoneId = { in: user.zoneIds };
      } else if (user.role === UserRoleEnum.SERVICE_PERSON) {
        where.assignedToId = user.id;
      }
    }
    
    if (status) where.status = { in: (status as string).split(',') };
    if (priority) where.priority = priority;
    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
        { id: { equals: isNaN(Number(search)) ? undefined : Number(search) } }
      ];
    }

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
            name: true,
            role: true
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

    if (!Object.values(TicketStatusEnum).includes(status)) {
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

    // Create automatic activity log for ticket status update
    try {
      await activityController.createTicketActivity(
        user.id,
        Number(id),
        currentTicket.status,
        status
      );
    } catch (activityError) {
      console.error('Failed to create activity log:', activityError);
      // Don't fail the status update if activity logging fails
    }

    // Send WhatsApp notification only for OPEN and CLOSED_PENDING statuses
    try {
      if (status === 'OPEN' || status === 'CLOSED_PENDING') {
        const ticketNotificationService = new TicketNotificationService();
        
        // Fetch complete ticket data for notification
        const ticketForNotification = await prisma.ticket.findUnique({
          where: { id: Number(id) },
          include: {
            customer: { select: { companyName: true } },
            contact: { select: { phone: true } },
            assignedTo: { select: { name: true } }
          }
        });

        if (ticketForNotification) {
          const notificationData = {
            id: ticketForNotification.id.toString(),
            title: ticketForNotification.title,
            customerName: ticketForNotification.customer.companyName,
            customerPhone: ticketForNotification.contact?.phone || '',
            customerId: ticketForNotification.customerId.toString(),
            oldStatus: currentTicket.status,
            newStatus: status,
            priority: ticketForNotification.priority,
            assignedTo: ticketForNotification.assignedTo?.name || undefined,
            estimatedResolution: ticketForNotification.dueDate || undefined
          };

          if (status === 'OPEN') {
            await ticketNotificationService.sendTicketOpenedNotification({
              id: notificationData.id,
              title: notificationData.title,
              customerName: notificationData.customerName,
              customerPhone: notificationData.customerPhone,
              customerId: notificationData.customerId,
              priority: notificationData.priority,
              assignedTo: notificationData.assignedTo,
              estimatedResolution: notificationData.estimatedResolution
            });
          } else if (status === 'CLOSED_PENDING') {
            await ticketNotificationService.sendTicketPendingNotification({
              id: notificationData.id,
              title: notificationData.title,
              customerName: notificationData.customerName,
              customerPhone: notificationData.customerPhone,
              assignedTo: notificationData.assignedTo
            });
          }
        }
      }
    } catch (notificationError) {
      console.error('Failed to send WhatsApp notification for status change:', notificationError);
      // Don't fail the status update if notification fails
    }

    return res.json(updatedTicket);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update status' });
  }
};

// Get ticket comments
export const getTicketComments = async (req: TicketRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ message: 'Ticket ID is required' });
    }
    
    const ticketId = parseInt(id);

    if (isNaN(ticketId)) {
      return res.status(400).json({ message: 'Invalid ticket ID' });
    }

    // Check if ticket exists and user has access
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        customer: true,
        zone: true,
        assignedTo: true,
      },
    });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const hasAccess = await checkTicketAccess(req.user, ticketId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const comments = await prisma.comment.findMany({
      where: { ticketId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            customer: {
              select: {
                companyName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Transform comments to match frontend expected format
    const transformedComments = comments.map(comment => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      user: {
        id: comment.user.id,
        name: comment.user.customer?.companyName || comment.user.email,
        email: comment.user.email,
      },
    }));

    res.json(transformedComments);
  } catch (error) {
    console.error('Error fetching ticket comments:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Add comment to ticket
export const addTicketComment = async (req: TicketRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    
    if (!id) {
      return res.status(400).json({ message: 'Ticket ID is required' });
    }
    
    const ticketId = parseInt(id);

    if (isNaN(ticketId)) {
      return res.status(400).json({ message: 'Invalid ticket ID' });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Comment content is required' });
    }

    // Check if ticket exists and user has access
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const hasAccess = await checkTicketAccess(req.user, ticketId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Create the comment
    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        ticketId,
        userId: req.user!.id,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            customer: {
              select: {
                companyName: true,
              },
            },
          },
        },
      },
    });

    // Transform comment to match frontend expected format
    const transformedComment = {
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      user: {
        id: comment.user.id,
        name: comment.user.customer?.companyName || comment.user.email,
        email: comment.user.email,
      },
    };

    res.status(201).json(transformedComment);
  } catch (error) {
    console.error('Error adding ticket comment:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Assign ticket to service person (Help Desk -> Service Person)
export const assignTicket = async (req: TicketRequest, res: Response) => {
  try {
    const { id: ticketId } = req.params;
    const { assignedToId, subOwnerId, note } = req.body;
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
        status: TicketStatusEnum.ASSIGNED,
        lastStatusChange: new Date(),
      },
      include: {
        assignedTo: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
        subOwner: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
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
        notes: note || `Ticket assigned to ${updatedTicket.assignedTo?.name || 'service person'}`
      }
    });

    // Send notification to assigned user
    await NotificationService.createTicketAssignmentNotification(
      updatedTicket.id,
      Number(assignedToId),
      user.id
    );

    // Send WhatsApp notification to assigned service person
    console.log('🎯 assignTicket: Starting WhatsApp notification process...');
    console.log('🎯 assignTicket: Assigned user data:', {
      id: assignedUser.id,
      name: assignedUser.name,
      phone: assignedUser.phone,
      email: assignedUser.email
    });
    
    try {
      const ticketNotificationService = new TicketNotificationService();
      
      // Get customer details for the notification
      const customerDetails = await prisma.customer.findUnique({
        where: { id: updatedTicket.customerId },
        select: { companyName: true }
      });

      console.log('🎯 assignTicket: Customer details:', customerDetails);
      
      if (assignedUser.phone && customerDetails && assignedUser.name) {
        console.log('🎯 assignTicket: All data present, sending WhatsApp notification...');
        await ticketNotificationService.sendTicketAssignedNotification({
          id: updatedTicket.id.toString(),
          title: updatedTicket.title,
          customerName: customerDetails.companyName,
          assignedToName: assignedUser.name,
          assignedToPhone: assignedUser.phone,
          priority: updatedTicket.priority as any,
          estimatedResolution: updatedTicket.dueDate || undefined
        });
        console.log('✅ assignTicket: WhatsApp notification sent successfully');
      } else {
        console.log('⚠️ assignTicket: Missing data for WhatsApp notification:', {
          hasPhone: !!assignedUser.phone,
          hasCustomer: !!customerDetails,
          hasName: !!assignedUser.name
        });
      }
    } catch (whatsappError) {
      console.error('❌ assignTicket: Failed to send WhatsApp assignment notification:', whatsappError);
      // Don't throw error to avoid disrupting the main assignment flow
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        action: 'ASSIGN_TO_SERVICE_PERSON',
        entityType: 'TICKET',
        entityId: Number(ticketId),
        userId: user.id,
        details: note || `Assigned ticket to service person ${assignedUser.name}`,
        updatedAt: new Date()
      }
    });

    res.json(updatedTicket);
  } catch (error) {
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
        role: UserRoleEnum.SERVICE_PERSON,
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
        status: TicketStatusEnum.ONSITE_VISIT_PLANNED,
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
        status: TicketStatusEnum.ONSITE_VISIT_PLANNED,
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


    // Update only the subOwnerId and lastStatusChange, explicitly setting status to its current value
    const updatedTicket = await prisma.ticket.update({
      where: { id: Number(ticketId) },
      data: {
        subOwnerId: Number(zoneUserId),
        status: currentTicket.status, // Explicitly set to current status
        lastStatusChange: new Date(),
      },
      include: {
        assignedTo: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
        subOwner: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
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


    // Send notification to assigned user
    await NotificationService.createTicketAssignmentNotification(
      updatedTicket.id,
      Number(zoneUserId),
      user.id
    );

    // Send WhatsApp notification to assigned zone user
    console.log('🎯 assignToZoneUser: Starting WhatsApp notification process...');
    console.log('🎯 assignToZoneUser: Zone user data:', {
      id: zoneUser.id,
      name: zoneUser.name,
      phone: zoneUser.phone,
      email: zoneUser.email
    });
    
    try {
      const ticketNotificationService = new TicketNotificationService();
      
      // Get customer details for the notification
      const customerDetails = await prisma.customer.findUnique({
        where: { id: updatedTicket.customerId },
        select: { companyName: true }
      });

      console.log('🎯 assignToZoneUser: Customer details:', customerDetails);
      
      if (zoneUser.phone && customerDetails && zoneUser.name) {
        console.log('🎯 assignToZoneUser: All data present, sending WhatsApp notification...');
        await ticketNotificationService.sendTicketAssignedNotification({
          id: updatedTicket.id.toString(),
          title: updatedTicket.title,
          customerName: customerDetails.companyName,
          assignedToName: zoneUser.name,
          assignedToPhone: zoneUser.phone,
          priority: updatedTicket.priority as any,
          estimatedResolution: updatedTicket.dueDate || undefined
        });
        console.log('✅ assignToZoneUser: WhatsApp notification sent successfully');
      } else {
        console.log('⚠️ assignToZoneUser: Missing data for WhatsApp notification:', {
          hasPhone: !!zoneUser.phone,
          hasCustomer: !!customerDetails,
          hasName: !!zoneUser.name
        });
      }
    } catch (whatsappError) {
      console.error('❌ assignToZoneUser: Failed to send WhatsApp assignment notification to zone user:', whatsappError);
      // Don't throw error to avoid disrupting the main assignment flow
    }

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
      newStatus = TicketStatusEnum.RESOLVED;
    } else if (sparePartsNeeded) {
      newStatus = TicketStatusEnum.SPARE_PARTS_NEEDED;
    } else {
      newStatus = TicketStatusEnum.IN_PROCESS;
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
      TicketStatusEnum.ONSITE_VISIT,
      newStatus,
      user.id
    );

    res.json(updatedTicket);
  } catch (error) {
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
        status: TicketStatusEnum.PO_NEEDED,
        lastStatusChange: new Date(),
      },
    });

    // Create status history entry
    await prisma.ticketStatusHistory.create({
      data: {
        ticketId: Number(ticketId),
        status: TicketStatusEnum.PO_NEEDED,
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
    if (user.role !== UserRoleEnum.ADMIN) {
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
        status: TicketStatusEnum.PO_RECEIVED,
        lastStatusChange: new Date(),
      },
    });

    // Create status history entry
    await prisma.ticketStatusHistory.create({
      data: {
        ticketId: Number(ticketId),
        status: TicketStatusEnum.PO_RECEIVED,
        changedById: user.id,
        notes: `PO approved: ${poNumber}`,
      },
    });

    res.json(updatedTicket);
  } catch (error) {
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
        newTicketStatus = TicketStatusEnum.SPARE_PARTS_BOOKED;
        break;
      case 'DELIVERED':
        newTicketStatus = TicketStatusEnum.SPARE_PARTS_DELIVERED;
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
        status: TicketStatusEnum.CLOSED_PENDING,
        lastStatusChange: new Date(),
      },
    });

    // Create status history entry for CLOSED_PENDING
    await prisma.ticketStatusHistory.create({
      data: {
        ticketId: Number(ticketId),
        status: TicketStatusEnum.CLOSED_PENDING,
        changedById: user.id,
        notes: 'Ticket marked as closed pending',
      },
    });

    // Then update to CLOSED status
    const updatedTicket = await prisma.ticket.update({
      where: { id: Number(ticketId) },
      data: {
        status: TicketStatusEnum.CLOSED,
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
        status: TicketStatusEnum.CLOSED,
        changedById: user.id,
        notes: 'Ticket closed by zone owner',
      },
    });

    res.json(updatedTicket);
  } catch (error) {
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
    res.status(500).json({ error: 'Error adding note' });
  }
};

// Upload reports for a ticket
export const uploadTicketReports = async (req: TicketRequest, res: Response) => {
  try {
    const { id: ticketId } = req.params;
    const user = req.user as AuthUser;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check if ticket exists and user has access
    const ticket = await prisma.ticket.findUnique({
      where: { id: Number(ticketId) },
    });
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    const hasAccess = await checkTicketAccess(user, Number(ticketId));
    if (!hasAccess.allowed) {
      return res.status(403).json({ error: hasAccess.error });
    }
    
    if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    const files = req.files as Express.Multer.File[];
    const uploadedReports = [];
    
    for (const file of files) {
      // Create report record in database
      const report = await prisma.ticketReport.create({
        data: {
          ticketId: Number(ticketId),
          fileName: file.originalname,
          fileSize: file.size,
          fileType: file.mimetype,
          filePath: file.path,
          uploadedById: user.id,
        },
        include: {
          uploadedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
      
      uploadedReports.push({
        id: report.id,
        fileName: report.fileName,
        fileSize: report.fileSize,
        fileType: report.fileType,
        uploadedBy: report.uploadedBy.name || report.uploadedBy.email,
        uploadedAt: report.createdAt,
        url: `/api/tickets/${ticketId}/reports/${report.id}/download`,
      });
    }
    
    res.status(201).json(uploadedReports);
  } catch (error) {
    console.error('Error uploading reports:', error);
    res.status(500).json({ error: 'Failed to upload reports' });
  }
};

// Get all reports for a ticket
export const getTicketReports = async (req: TicketRequest, res: Response) => {
  try {
    const { id: ticketId } = req.params;
    const user = req.user as AuthUser;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check if ticket exists and user has access
    const ticket = await prisma.ticket.findUnique({
      where: { id: Number(ticketId) },
    });
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    const hasAccess = await checkTicketAccess(user, Number(ticketId));
    if (!hasAccess.allowed) {
      return res.status(403).json({ error: hasAccess.error });
    }
    
    const reports = await prisma.ticketReport.findMany({
      where: { ticketId: Number(ticketId) },
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
    
    const formattedReports = reports.map((report: any) => ({
      id: report.id,
      fileName: report.fileName,
      fileSize: report.fileSize,
      fileType: report.fileType,
      uploadedBy: report.uploadedBy.name || report.uploadedBy.email,
      uploadedAt: report.createdAt,
      url: `/api/tickets/${ticketId}/reports/${report.id}/download`,
    }));
    
    res.json(formattedReports);
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
};

// Download a specific report
export const downloadTicketReport = async (req: TicketRequest, res: Response) => {
  try {
    const { id: ticketId, reportId } = req.params;
    const user = req.user as AuthUser;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check if ticket exists and user has access
    const ticket = await prisma.ticket.findUnique({
      where: { id: Number(ticketId) },
    });
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    const hasAccess = await checkTicketAccess(user, Number(ticketId));
    if (!hasAccess.allowed) {
      return res.status(403).json({ error: hasAccess.error });
    }
    
    const report = await prisma.ticketReport.findUnique({
      where: { id: Number(reportId) },
    });
    
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    if (report.ticketId !== Number(ticketId)) {
      return res.status(403).json({ error: 'Report does not belong to this ticket' });
    }
    
    const fs = require('fs');
    const path = require('path');
    
    if (!fs.existsSync(report.filePath)) {
      console.warn(`File not found: ${report.filePath}. Database record exists but file is missing.`);
      return res.status(404).json({ 
        error: 'File not found on server',
        details: 'The uploaded file has been removed or is no longer available. Please contact support if you need this file.'
      });
    }
    
    res.download(report.filePath, report.fileName);
  } catch (error) {
    console.error('Error downloading report:', error);
    
    // Handle specific file system errors
    if (error && typeof error === 'object' && 'code' in error) {
      const errorCode = (error as any).code;
      if (errorCode === 'ENOENT') {
        return res.status(404).json({ 
          error: 'File not found on server',
          details: 'The requested file could not be found. It may have been deleted or moved.'
        });
      } else if (errorCode === 'EACCES') {
        return res.status(403).json({ 
          error: 'Permission denied',
          details: 'Unable to access the requested file due to permission restrictions.'
        });
      }
    }
    
    res.status(500).json({ 
      error: 'Failed to download report',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Delete a specific report
export const deleteTicketReport = async (req: TicketRequest, res: Response) => {
  try {
    const { id: ticketId, reportId } = req.params;
    const user = req.user as AuthUser;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check if ticket exists and user has access
    const ticket = await prisma.ticket.findUnique({
      where: { id: Number(ticketId) },
    });
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    const hasAccess = await checkTicketAccess(user, Number(ticketId));
    if (!hasAccess.allowed) {
      return res.status(403).json({ error: hasAccess.error });
    }
    
    const report = await prisma.ticketReport.findUnique({
      where: { id: Number(reportId) },
    });
    
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    if (report.ticketId !== Number(ticketId)) {
      return res.status(403).json({ error: 'Report does not belong to this ticket' });
    }
    
    // Only allow deletion by the uploader or admin
    if (report.uploadedById !== user.id && user.role !== UserRoleEnum.ADMIN) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Delete file from filesystem
    const fs = require('fs');
    if (fs.existsSync(report.filePath)) {
      fs.unlinkSync(report.filePath);
    }
    
    // Delete record from database
    await prisma.ticketReport.delete({
      where: { id: Number(reportId) },
    });
    
    res.json({ success: true, message: 'Report deleted successfully' });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({ error: 'Failed to delete report' });
  }
};
