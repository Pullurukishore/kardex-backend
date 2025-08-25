import { Request, Response } from 'express';
import { TicketStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../types/express';
import prisma from '../config/db';

export const getDashboardData = async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser | undefined;
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    let dashboardData: any = {};

    // Common stats for all roles
    const [totalTickets, openTickets, inProgressTickets, resolvedTickets] = await Promise.all([
      prisma.ticket.count(),
      prisma.ticket.count({ 
        where: { 
          status: 'OPEN'
        } 
      }),
      prisma.ticket.count({ 
        where: { 
          status: 'IN_PROGRESS'
        } 
      }),
      prisma.ticket.count({ 
        where: { 
          status: 'CLOSED'
        } 
      })
    ]);

    dashboardData.stats = {
      totalTickets,
      openTickets,
      inProgressTickets,
      resolvedTickets,
      resolutionRate: totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0
    };

    // Get role-specific data
    switch (user.role) {
      case 'ADMIN':
        await getAdminDashboardData(dashboardData);
        break;
      case 'SERVICE_PERSON':
        await getServicePersonDashboardData(dashboardData, user.id);
        break;
      case 'CUSTOMER_OWNER':
      case 'CUSTOMER_CONTACT':
        if (user.customerId) {
          await getCustomerDashboardData(dashboardData, user.customerId);
        } else {
          return res.status(400).json({ error: 'Customer ID is required' });
        }
        break;
      default:
        return res.status(400).json({ error: 'Invalid user role' });
    }

    // Get recent tickets based on role
    dashboardData.recentTickets = await getRecentTicketsForUser(user, 10);

    return res.json(dashboardData);
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
};

async function getAdminDashboardData(dashboardData: any) {
  const [
    totalCustomers, 
    totalServicePersons,
    totalServiceZones,
    ticketStatusDistribution,
    ticketTrends
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.user.count({ where: { role: 'SERVICE_PERSON' } }),
    prisma.serviceZone.count(),
    prisma.ticket.groupBy({
      by: ['status'],
      _count: { id: true }
    }),
    prisma.$queryRaw`
      SELECT 
        DATE(createdAt) as date,
        COUNT(*) as count,
        status
      FROM Ticket
      WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(createdAt), status
      ORDER BY date ASC
    `
  ]);

  dashboardData.adminStats = {
    totalCustomers,
    totalServicePersons,
    totalServiceZones,
    ticketStatusDistribution: ticketStatusDistribution.reduce((acc: any, item: any) => {
      acc[item.status] = item._count.id;
      return acc;
    }, {}),
    ticketTrends
  };
}

async function getServicePersonDashboardData(dashboardData: any, userId: number) {
  const [
    assignedTickets,
    completedTickets,
    pendingApprovals,
    customerDistribution
  ] = await Promise.all([
    prisma.ticket.count({ 
      where: { 
        assignedToId: userId,
        status: { 
          in: [
            TicketStatus.OPEN, 
            TicketStatus.IN_PROGRESS, 
            'WAITING_FOR_RESPONSE'
          ] 
        }
      } 
    }),
    prisma.ticket.count({ 
      where: { 
        assignedToId: userId,
        status: TicketStatus.CLOSED,
        updatedAt: {
          gte: new Date(new Date().setDate(new Date().getDate() - 30))
        }
      } 
    }),
    // Changed from purchaseRequest to purchaseRequestTicket if that's your model name
    // Purchase requests are not currently implemented
    0,
    prisma.ticket.groupBy({
      by: ['customerId'],
      _count: { id: true },
      where: { assignedToId: userId },
      orderBy: { _count: { id: 'desc' } },
      take: 5
    })
  ]);

  dashboardData.servicePersonStats = {
    assignedTickets,
    completedTickets,
    pendingApprovals,
    customerDistribution: await Promise.all(
      customerDistribution.map(async (item: any) => {
        const customer = await prisma.customer.findUnique({
          where: { id: item.customerId },
          select: { companyName: true }
        });
        return {
          customerId: item.customerId,
          customerName: customer?.companyName || 'Unknown',
          ticketCount: item._count.id
        };
      })
    )
  };
}

async function getCustomerDashboardData(dashboardData: any, customerId: number) {
  const [
    myTickets,
    openTickets,
    inProgressTickets,
    resolvedTickets,
    assetDistribution
  ] = await Promise.all([
    prisma.ticket.count({ where: { customerId } }),
    prisma.ticket.count({ 
      where: { 
        customerId,
        status: TicketStatus.OPEN 
      } 
    }),
    prisma.ticket.count({ 
      where: { 
        customerId,
        status: TicketStatus.IN_PROGRESS 
      } 
    }),
    prisma.ticket.count({ 
      where: { 
        customerId,
        status: TicketStatus.CLOSED 
      } 
    }),
    // Changed to use the correct field name from your Prisma schema
    prisma.ticket.groupBy({
      by: ['assetId'] as const,
      _count: {
        id: true
      },
      where: { customerId },
      orderBy: {
        _count: {
          id: 'desc'
        }
      },
      take: 5
    })
  ]);

  dashboardData.customerStats = {
    myTickets,
    openTickets,
    inProgressTickets,
    resolvedTickets,
    resolutionRate: myTickets > 0 ? (resolvedTickets / myTickets) * 100 : 0,
    assetDistribution: await Promise.all(
      assetDistribution.map(async (item: any) => {
        if (!item.assetId) return { assetName: 'Unassigned', ticketCount: item._count.id };
        
        const asset = await prisma.asset.findUnique({
          where: {
            id: item.assetId
          },
          select: {
            id: true,
            model: true
          }
        });
        
        return {
          assetId: item.assetId,
          assetName: asset?.model || 'Unknown',
          ticketCount: item._count.id
        };
      })
    )
  };
}

export const getTicketStatusDistribution = async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { role, customerId } = user;
    let where: Prisma.TicketWhereInput = {};

    if (role === 'SERVICE_PERSON') {
      where.assignedToId = user.id;
    } else if (role === 'CUSTOMER_OWNER' && customerId) {
      where.customerId = customerId;
    }

    const distribution = await prisma.ticket.groupBy({
      by: ['status'],
      _count: { id: true },
      where
    });

    return res.json({
      distribution: distribution.map(item => ({
        status: item.status,
        count: item._count.id
      }))
    });
  } catch (error) {
    console.error('Error fetching ticket status distribution:', error);
    return res.status(500).json({ error: 'Failed to fetch ticket status distribution' });
  }
};

export const getTicketTrends = async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { role, customerId } = user;
    const { days = 30 } = req.query;
    
    let whereClause = Prisma.empty;
    if (role === 'SERVICE_PERSON') {
      whereClause = Prisma.sql`WHERE assignedToId = ${user.id}`;
    } else if (role === 'CUSTOMER_OWNER' && customerId) {
      whereClause = Prisma.sql`WHERE customerId = ${customerId}`;
    }

    const trends = await prisma.$queryRaw`
      SELECT 
        DATE(createdAt) as date,
        COUNT(*) as count
      FROM Ticket
      ${whereClause}
      AND createdAt >= DATE_SUB(NOW(), INTERVAL ${Number(days)} DAY)
      GROUP BY DATE(createdAt)
      ORDER BY date ASC
    `;

    return res.json({ trends });
  } catch (error) {
    console.error('Error fetching ticket trends:', error);
    return res.status(500).json({ error: 'Failed to fetch ticket trends' });
  }
};

export const getAdminStats = async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser | undefined;
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }

    const [
      totalCustomers,
      totalServicePersons,
      totalServiceZones,
      totalTickets,
      openTickets,
      inProgressTickets,
      closedTickets,
      pendingTickets
    ] = await Promise.all([
      prisma.customer.count(),
      prisma.user.count({ where: { role: 'SERVICE_PERSON' } }),
      prisma.serviceZone.count(),
      prisma.ticket.count(),
      prisma.ticket.count({ 
        where: { 
          status: 'OPEN'
        } 
      }),
      prisma.ticket.count({ 
        where: { 
          status: 'IN_PROGRESS'
        } 
      }),
      prisma.ticket.count({ 
        where: { 
          status: 'CLOSED',
          updatedAt: {
            gte: new Date(new Date().setDate(new Date().getDate() - 30))
          }
        } 
      }),
      prisma.ticket.count({ 
        where: { 
          status: 'WAITING_FOR_RESPONSE'
        } 
      })
    ]);

    const adminStats = {
      totalCustomers,
      totalServicePersons,
      totalServiceZones,
      totalTickets,
      openTickets,
      inProgressTickets,
      closedTickets,
      pendingTickets,
      resolutionRate: totalTickets > 0 ? (closedTickets / totalTickets) * 100 : 0
    };

    return res.json(adminStats);
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
};

export const getRecentTickets = async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser | undefined;
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { limit = 10 } = req.query;
    const tickets = await getRecentTicketsForUser(user, Number(limit));

    return res.json(tickets);
  } catch (error) {
    console.error('Error fetching recent tickets:', error);
    return res.status(500).json({ error: 'Failed to fetch recent tickets' });
  }
};

async function getRecentTicketsForUser(user: any, limit: number = 10) {
  let where: Prisma.TicketWhereInput = {};
  
  // Filter tickets based on user role
  switch (user.role) {
    case 'SERVICE_PERSON':
      where = { assignedToId: user.id };
      break;
    case 'CUSTOMER_OWNER':
      where = { customerId: user.customerId };
      break;
    // Admin can see all tickets
  }

  return prisma.ticket.findMany({
    where,
    orderBy: {
      createdAt: 'desc'
    },
    take: limit,
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      createdAt: true,
      customer: {
        select: {
          id: true,
          companyName: true
        }
      },
      assignedTo: user.role === 'CUSTOMER_OWNER' ? {
        select: {
          id: true
        }
      } : false,
      asset: user.role !== 'CUSTOMER_OWNER' ? {
        select: {
          id: true,
          model: true
        }
      } : false
    }
  });
}