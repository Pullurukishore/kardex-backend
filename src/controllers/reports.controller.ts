import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { format, subDays, eachDayOfInterval, differenceInMinutes } from 'date-fns';
import { generatePdf, getColumnsForReport } from '../utils/pdfGenerator';
import { generateCsv, getCsvColumns } from '../utils/csvGenerator';

// Define enums since they're not exported from Prisma client
enum TicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
  ASSIGNED = 'ASSIGNED',
  PENDING = 'PENDING'
}

enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

enum SLAStatus {
  ON_TIME = 'ON_TIME',
  BREACHED = 'BREACHED',
  AT_RISK = 'AT_RISK'
}

enum UserRole {
  ADMIN = 'ADMIN',
  ZONE_USER = 'ZONE_USER',
  SERVICE_PERSON = 'SERVICE_PERSON'
}

// Define interfaces for report data
type TicketSummaryData = {
  tickets: any[];
  summary: any;
  statusDistribution: Record<string, number>;
  priorityDistribution: Record<string, number>;
  dailyTrends: Array<{ date: string; created: number; resolved: number }>;
};

type SlaPerformanceData = {
  breachedTickets: any[];
  summary: any;
  prioritySla: Record<string, any>;
};

type CustomerSatisfactionData = {
  recentFeedbacks: any[];
  ratingDistribution: Record<number, number>;
  customerRatings: Record<string, any>;
};

type ZonePerformanceData = {
  zones: any[];
  summary: any;
};

type AgentProductivityData = {
  agents: any[];
  summary: any;
};

type IndustrialZoneData = {
  zoneUsers: any[];
  servicePersons: any[];
  machineDowntime: any[];
  detailedDowntime: any[];
  summary: any;
};

const prisma = new PrismaClient();

interface ReportFilters {
  from?: string;
  to?: string;
  zoneId?: string;
  reportType: string;
  customerId?: string;
  assetId?: string;
}

export const generateReport = async (req: Request, res: Response) => {
  try {
    const { from, to, zoneId, reportType, customerId, assetId } = req.query as unknown as ReportFilters;
    const startDate = from ? new Date(from) : subDays(new Date(), 30);
    const endDate = to ? new Date(to) : new Date();
    
    // Set end date to end of day
    endDate.setHours(23, 59, 59, 999);

    const whereClause: any = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (zoneId) {
      whereClause.zoneId = parseInt(zoneId);
    }

    switch (reportType) {
      case 'ticket-summary':
        return await generateTicketSummaryReport(res, whereClause, startDate, endDate);
      case 'sla-performance':
        return await generateSlaPerformanceReport(res, whereClause, startDate, endDate);
      case 'customer-satisfaction':
        return await generateCustomerSatisfactionReport(res, whereClause, startDate, endDate);
      case 'zone-performance':
        return await generateZonePerformanceReport(res, whereClause, startDate, endDate);
      case 'agent-productivity':
        return await generateAgentProductivityReport(res, whereClause, startDate, endDate);
      case 'industrial-data':
        return await generateIndustrialDataReport(res, whereClause, startDate, endDate, { customerId, assetId });
      case 'executive-summary':
        return await generateExecutiveSummaryReport(res, whereClause, startDate, endDate);
      default:
        return res.status(400).json({ error: 'Invalid report type' });
    }
  } catch (error) {
    console.error('Error generating report:', error);
    return res.status(500).json({ error: 'Failed to generate report' });
  }
};

;

// Helper functions for different report types
async function generateTicketSummaryReport(res: Response, whereClause: any, startDate: Date, endDate: Date) {
  const [tickets, statusDistribution, priorityDistribution, slaDistribution] = await Promise.all([
    prisma.ticket.findMany({
      where: whereClause,
      include: { 
        customer: true, 
        assignedTo: true,
        zone: true,
        asset: true
      }
    }),
    prisma.ticket.groupBy({
      by: ['status'],
      where: whereClause,
      _count: true,
    }),
    prisma.ticket.groupBy({
      by: ['priority'],
      where: whereClause,
      _count: true,
    }),
    prisma.ticket.groupBy({
      by: ['slaStatus'],
      where: whereClause,
      _count: true,
    })
  ]);

  // Generate daily trends
  const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
  const dailyTrends = await Promise.all(
    dateRange.map(async (date) => {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      const [created, resolved] = await Promise.all([
        prisma.ticket.count({
          where: {
            ...whereClause,
            createdAt: { gte: startOfDay, lte: endOfDay }
          }
        }),
        prisma.ticket.count({
          where: {
            ...whereClause,
            status: { in: ['RESOLVED', 'CLOSED'] },
            updatedAt: { gte: startOfDay, lte: endOfDay }
          }
        })
      ]);

      return {
        date: format(date, 'yyyy-MM-dd'),
        created,
        resolved
      };
    })
  );

  // Calculate average resolution time
  const resolvedTickets = tickets.filter((t: { status: string }) => 
    t.status === 'RESOLVED' || t.status === 'CLOSED'
  );
  
  let avgResolutionTime = 0;
  if (resolvedTickets.length > 0) {
    const totalTime = resolvedTickets.reduce((sum: number, ticket: { createdAt: Date; updatedAt: Date }) => {
      if (ticket.createdAt && ticket.updatedAt) {
        return sum + differenceInMinutes(ticket.updatedAt, ticket.createdAt);
      }
      return sum;
    }, 0);
    avgResolutionTime = Math.round(totalTime / resolvedTickets.length);
  }

  res.json({
    summary: {
      totalTickets: tickets.length,
      openTickets: tickets.filter((t: { status: string }) => t.status === 'OPEN').length,
      inProgressTickets: tickets.filter((t: { status: string }) => 
        ['IN_PROGRESS', 'ASSIGNED', 'IN_PROCESS'].includes(t.status)
      ).length,
      resolvedTickets: resolvedTickets.length,
      closedTickets: tickets.filter((t: { status: string }) => t.status === 'CLOSED').length,
      averageResolutionTime: avgResolutionTime,
      escalatedTickets: tickets.filter((t: { isEscalated: boolean }) => t.isEscalated).length,
    },
    statusDistribution: statusDistribution.reduce((acc: any, curr: any) => ({
      ...acc,
      [curr.status]: curr._count
    }), {}),
    priorityDistribution: priorityDistribution.reduce((acc: any, curr: any) => ({
      ...acc,
      [curr.priority]: curr._count
    }), {}),
    slaDistribution: slaDistribution.reduce((acc: any, curr: any) => ({
      ...acc,
      [curr.slaStatus || 'NOT_SET']: curr._count
    }), {}),
    dailyTrends,
    recentTickets: tickets
      .sort((a: { createdAt: Date }, b: { createdAt: Date }) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10)
  });
}

async function generateSlaPerformanceReport(res: Response, whereClause: any, startDate: Date, endDate: Date) {
  const tickets = await prisma.ticket.findMany({
    where: { 
      ...whereClause, 
      slaDueAt: { not: null }
    },
    include: { 
      customer: true,
      assignedTo: true,
      zone: true,
      asset: true
    }
  });

  const now = new Date();
  const slaBreaches = tickets.filter((t: any) => t.slaDueAt && now > t.slaDueAt);
  const slaOnTime = tickets.filter((t: any) => t.slaDueAt && now <= t.slaDueAt);

  // Calculate SLA compliance by priority
  const prioritySla = Object.values(Priority).reduce((acc: any, priority: any) => {
    const priorityTickets = tickets.filter((t: any) => t.priority === priority);
    const priorityBreaches = priorityTickets.filter((t: any) => t.slaDueAt && now > t.slaDueAt);
    
    acc[priority] = {
      total: priorityTickets.length,
      breaches: priorityBreaches.length,
      compliance: priorityTickets.length > 0 
        ? ((priorityTickets.length - priorityBreaches.length) / priorityTickets.length) * 100 
        : 100
    };
    return acc;
  }, {} as Record<string, any>);

  res.json({
    summary: {
      totalTicketsWithSLA: tickets.length,
      slaBreaches: slaBreaches.length,
      slaOnTime: slaOnTime.length,
      complianceRate: tickets.length > 0 
        ? ((tickets.length - slaBreaches.length) / tickets.length) * 100 
        : 100
    },
    prioritySla,
    breachedTickets: slaBreaches.map((t: any) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      slaDueAt: t.slaDueAt,
      customer: t.customer?.companyName || 'Unknown',
      assignedTo: t.assignedTo ? t.assignedTo.name : 'Unassigned',
      zone: t.zone?.name || 'No Zone',
      asset: t.asset ? `${t.asset.machineId} - ${t.asset.model}` : 'No Asset'
    }))
  });
}

async function generateCustomerSatisfactionReport(res: Response, whereClause: any, startDate: Date, endDate: Date) {
  const data = await getCustomerSatisfactionData(whereClause, startDate, endDate);
  res.json(data);
}

async function getCustomerSatisfactionData(whereClause: any, startDate: Date, endDate: Date) {
  // Build where for feedback with optional zone restriction via ticket relation
  const feedbackWhere: any = {
    submittedAt: { gte: startDate, lte: endDate },
  };
  if (whereClause?.zoneId !== undefined) {
    if (typeof whereClause.zoneId === 'number' || typeof whereClause.zoneId === 'string') {
      feedbackWhere.ticket = { zoneId: parseInt(whereClause.zoneId as number as unknown as string) };
    } else if (typeof whereClause.zoneId === 'object' && whereClause.zoneId !== null) {
      if (Array.isArray((whereClause.zoneId as any).in)) {
        feedbackWhere.ticket = { zoneId: { in: (whereClause.zoneId as any).in } };
      }
    }
  }

  // Get TicketFeedback data (existing system)
  const ticketFeedbacks = await prisma.ticketFeedback.findMany({
    where: feedbackWhere,
    include: {
      ticket: {
        include: {
          customer: true,
          zone: true,
          asset: true
        }
      },
      submittedBy: true
    }
  });

  // Build where for ratings with optional zone restriction via ticket relation
  const ratingWhere: any = {
    createdAt: { gte: startDate, lte: endDate },
  };
  if (whereClause?.zoneId !== undefined) {
    if (typeof whereClause.zoneId === 'number' || typeof whereClause.zoneId === 'string') {
      ratingWhere.ticket = { zoneId: parseInt(whereClause.zoneId as number as unknown as string) };
    } else if (typeof whereClause.zoneId === 'object' && whereClause.zoneId !== null) {
      if (Array.isArray((whereClause.zoneId as any).in)) {
        ratingWhere.ticket = { zoneId: { in: (whereClause.zoneId as any).in } };
      }
    }
  }

  // Get Rating data (new WhatsApp system)
  const ratings = await prisma.rating.findMany({
    where: ratingWhere,
    include: {
      ticket: {
        include: {
          customer: true,
          zone: true,
          asset: true
        }
      },
      customer: true
    }
  });

  // Combine both feedback types into a unified format
  const allFeedbacks = [
    ...ticketFeedbacks.map(tf => ({
      id: tf.id,
      rating: tf.rating,
      comment: tf.feedback,
      submittedAt: tf.submittedAt,
      ticketId: tf.ticketId,
      ticket: tf.ticket,
      source: 'WEB',
      customer: tf.ticket.customer?.companyName || 'Unknown'
    })),
    ...ratings.map(r => ({
      id: r.id,
      rating: r.rating,
      comment: r.feedback,
      submittedAt: r.createdAt,
      ticketId: r.ticketId,
      ticket: r.ticket,
      source: r.source,
      customer: r.customer?.companyName || 'Unknown'
    }))
  ];

  // Calculate rating distribution
  const ratingDistribution: Record<number, number> = {};
  for (let i = 1; i <= 5; i++) {
    ratingDistribution[i] = 0;
  }

  allFeedbacks.forEach((fb: any) => {
    if (fb.rating >= 1 && fb.rating <= 5) {
      ratingDistribution[fb.rating]++;
    }
  });

  // Calculate average rating
  const totalRating = allFeedbacks.reduce((sum: number, fb: any) => sum + fb.rating, 0);
  const averageRating = allFeedbacks.length > 0 ? totalRating / allFeedbacks.length : 0;

  // Group by customer
  const customerRatings: Record<string, any> = {};
  allFeedbacks.forEach((fb: any) => {
    const customerName = fb.customer;
    if (!customerRatings[customerName]) {
      customerRatings[customerName] = {
        total: 0,
        sum: 0,
        feedbacks: []
      };
    }
    customerRatings[customerName].total++;
    customerRatings[customerName].sum += fb.rating;
    customerRatings[customerName].feedbacks.push(fb);
  });

  // Calculate average per customer
  Object.keys(customerRatings).forEach(customer => {
    customerRatings[customer].average = customerRatings[customer].sum / customerRatings[customer].total;
  });

  return {
    summary: {
      totalFeedbacks: allFeedbacks.length,
      averageRating: parseFloat(averageRating.toFixed(2)),
      positiveFeedbacks: allFeedbacks.filter((fb: any) => fb.rating >= 4).length,
      negativeFeedbacks: allFeedbacks.filter((fb: any) => fb.rating <= 2).length
    },
    ratingDistribution,
    customerRatings,
    recentFeedbacks: allFeedbacks
      .sort((a: { submittedAt: Date }, b: { submittedAt: Date }) => b.submittedAt.getTime() - a.submittedAt.getTime())
      .slice(0, 20)
  };
}

async function generateZonePerformanceReport(res: Response, whereClause: any, startDate: Date, endDate: Date) {
  // Create a clean where clause for the zone query
  const zoneWhere: any = {};
  
  // If a specific zone is selected, only fetch that zone
  if (whereClause.zoneId !== undefined) {
    if (typeof whereClause.zoneId === 'number' || typeof whereClause.zoneId === 'string') {
      zoneWhere.id = parseInt(whereClause.zoneId as number as unknown as string);
    } else if (typeof whereClause.zoneId === 'object' && whereClause.zoneId !== null) {
      // Support shape: { in: number[] }
      if (Array.isArray((whereClause.zoneId as any).in)) {
        zoneWhere.id = { in: (whereClause.zoneId as any).in };
      }
    }
  }
  
  const zones = await prisma.serviceZone.findMany({
    where: zoneWhere,
    include: {
      tickets: {
        where: whereClause,
        include: {
          customer: true,
          assignedTo: true,
          asset: true
        }
      },
      servicePersons: {
        include: {
          user: true
        }
      },
      customers: {
        include: {
          assets: true
        }
      }
    }
  });

  const zoneStats = zones.map((zone: any) => {
    const tickets = zone.tickets;
    const resolvedTickets = tickets.filter((t: { status: string }) => 
      t.status === 'RESOLVED' || t.status === 'CLOSED'
    );
    const openTickets = tickets.filter((t: { status: string }) => 
      ['OPEN', 'IN_PROGRESS', 'ASSIGNED'].includes(t.status)
    );
    
    // Calculate average resolution time for this zone
    let avgResolutionTime = 0;
    if (resolvedTickets.length > 0) {
      const totalTime = resolvedTickets.reduce((sum: number, ticket: { createdAt: Date; updatedAt: Date }) => {
        if (ticket.createdAt && ticket.updatedAt) {
          return sum + differenceInMinutes(ticket.updatedAt, ticket.createdAt);
        }
        return sum;
      }, 0);
      avgResolutionTime = Math.round(totalTime / resolvedTickets.length);
    }

    // Count customers and assets in this zone
    const customerCount = zone.customers.length;
    const assetCount = zone.customers.reduce((sum: number, customer: { assets: any[] }) => sum + customer.assets.length, 0);

    return {
      zoneId: zone.id,
      zoneName: zone.name,
      totalTickets: tickets.length,
      resolvedTickets: resolvedTickets.length,
      openTickets: openTickets.length,
      servicePersons: zone.servicePersons.length,
      customerCount,
      assetCount,
      resolutionRate: tickets.length > 0 
        ? parseFloat(((resolvedTickets.length / tickets.length) * 100).toFixed(2))
        : 0,
      averageResolutionTime: avgResolutionTime,
      escalatedTickets: tickets.filter((t: { isEscalated: boolean }) => t.isEscalated).length
    };
  });

  res.json({
    zones: zoneStats.sort((a: { resolutionRate: number }, b: { resolutionRate: number }) => b.resolutionRate - a.resolutionRate),
    totalZones: zones.length,
    overallStats: {
      totalTickets: zoneStats.reduce((sum: number, zone: { totalTickets: number }) => sum + (zone.totalTickets || 0), 0),
      totalResolved: zoneStats.reduce((sum: number, zone: { resolvedTickets: number }) => sum + (zone.resolvedTickets || 0), 0),
      averageResolutionRate: zoneStats.length > 0 
        ? zoneStats.reduce((sum: number, zone: { resolutionRate: number }) => sum + zone.resolutionRate, 0) / zoneStats.length
        : 0
    }
  });
}

async function generateAgentProductivityReport(res: Response, whereClause: any, startDate: Date, endDate: Date) {
  // Build filter for agents: service persons that have assigned tickets in allowed zones/date
  const assignedTicketsWhere: any = { ...whereClause };
  const agents = await prisma.user.findMany({
    where: { 
      role: 'SERVICE_PERSON',
      assignedTickets: {
        some: assignedTicketsWhere
      }
    },
    include: {
      assignedTickets: {
        where: assignedTicketsWhere,
        include: {
          customer: true,
          zone: true,
          asset: true
        }
      },
      serviceZones: {
        include: {
          serviceZone: true
        }
      }
    }
  });

  const agentStats = agents.map((agent: any) => {
    const tickets = agent.assignedTickets || [];
    const resolvedTickets = tickets.filter((t: { status: string }) => 
      t.status === 'RESOLVED' || t.status === 'CLOSED'
    );
    
    // Calculate average resolution time in minutes
    const resolvedWithTime = resolvedTickets.filter((t: any) => t.createdAt && t.updatedAt);
    const totalResolutionTime = resolvedWithTime.reduce((sum: number, t: any) => {
      return sum + differenceInMinutes(t.updatedAt, t.createdAt);
    }, 0);
    
    const avgResolutionTime = resolvedWithTime.length > 0 
      ? Math.round(totalResolutionTime / resolvedWithTime.length)
      : 0;

    // Calculate first response time (simplified)
    const ticketsWithResponse = tickets.filter((t: any) => t.updatedAt !== t.createdAt);
    const avgFirstResponseTime = ticketsWithResponse.length > 0
      ? Math.round(ticketsWithResponse.reduce((sum: number, t: any) => {
          return sum + differenceInMinutes(t.updatedAt, t.createdAt);
        }, 0) / ticketsWithResponse.length)
      : 0;

    return {
      agentId: agent.id,
      agentName: agent.name || agent.email || `Agent ${agent.id}`,
      email: agent.email,
      zones: agent.serviceZones.map((sz: any) => sz.serviceZone.name),
      totalTickets: tickets.length,
      resolvedTickets: resolvedTickets.length,
      openTickets: tickets.filter((t: any) => 
        ['OPEN', 'IN_PROGRESS', 'ASSIGNED'].includes(t.status)
      ).length,
      resolutionRate: tickets.length > 0 
        ? parseFloat(((resolvedTickets.length / tickets.length) * 100).toFixed(2))
        : 0,
      averageResolutionTime: avgResolutionTime,
      averageFirstResponseTime: avgFirstResponseTime,
      escalatedTickets: tickets.filter((t: { isEscalated: boolean }) => t.isEscalated).length
    };
  });

  res.json({
    agents: agentStats.sort((a: { resolutionRate: number }, b: { resolutionRate: number }) => b.resolutionRate - a.resolutionRate),
    totalAgents: agents.length,
    performanceMetrics: {
      topPerformer: agentStats.length > 0 
        ? agentStats.reduce((max: { resolutionRate: number }, agent: { resolutionRate: number }) => 
            agent.resolutionRate > max.resolutionRate ? agent : max, agentStats[0])
        : null,
      averageResolutionRate: agentStats.length > 0
        ? agentStats.reduce((sum: number, agent: any) => sum + agent.resolutionRate, 0) / agentStats.length
        : 0
    }
  });
}

async function generateIndustrialDataReport(res: Response, whereClause: any, startDate: Date, endDate: Date, filters?: { customerId?: string, assetId?: string }) {
  // Build base query for zone users and service persons
  const baseUserWhere: any = {
    isActive: true,
    ...((() => {
      // Support zoneId as single value or { in: [...] }
      if (whereClause?.zoneId === undefined) return {};
      if (typeof whereClause.zoneId === 'number' || typeof whereClause.zoneId === 'string') {
        return { serviceZones: { some: { serviceZoneId: parseInt(whereClause.zoneId as number as unknown as string) } } };
      }
      if (typeof whereClause.zoneId === 'object' && whereClause.zoneId !== null && Array.isArray((whereClause.zoneId as any).in)) {
        return { serviceZones: { some: { serviceZoneId: { in: (whereClause.zoneId as any).in } } } };
      }
      return {};
    })())
  };

  // Get zone users (ZONE_USER role) with zone filtering
  const zoneUsers = await prisma.user.findMany({
    where: {
      ...baseUserWhere,
      role: UserRole.ZONE_USER
    },
    include: {
      serviceZones: {
        include: {
          serviceZone: true
        }
      }
    }
  });

  // Get service persons with zone filtering
  const servicePersons = await prisma.user.findMany({
    where: {
      ...baseUserWhere,
      role: UserRole.SERVICE_PERSON
    },
    include: {
      serviceZones: {
        include: {
          serviceZone: true
        }
      },
      assignedTickets: {
        where: whereClause,
        include: {
          asset: true,
          zone: true
        }
      }
    }
  });

  // Get machine downtime data
  const ticketsWithDowntime = await prisma.ticket.findMany({
    where: {
      ...whereClause,
      OR: [
        { status: { in: ['OPEN', 'IN_PROGRESS', 'ASSIGNED'] } },
        { 
          status: { in: ['RESOLVED', 'CLOSED'] },
          updatedAt: { gte: startDate, lte: endDate }
        }
      ]
    },
    include: {
      asset: {
        include: {
          customer: true
        }
      },
      zone: true,
      assignedTo: true
    }
  });

  // Calculate downtime for each machine
  const machineDowntime = ticketsWithDowntime.map((ticket: any) => {
    let downtimeMinutes = 0;
    
    if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
      // For resolved tickets, calculate the time between creation and resolution
      downtimeMinutes = differenceInMinutes(ticket.updatedAt, ticket.createdAt);
    } else {
      // For open tickets, calculate time from creation to now
      downtimeMinutes = differenceInMinutes(new Date(), ticket.createdAt);
    }
    
    return {
      machineId: ticket.asset?.machineId || 'Unknown',
      model: ticket.asset?.model || 'Unknown',
      serialNo: ticket.asset?.serialNo || 'Unknown',
      customer: ticket.asset?.customer?.companyName || 'Unknown',
      zone: ticket.zone?.name || 'Unknown',
      ticketId: ticket.id,
      ticketTitle: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      resolvedAt: ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' ? ticket.updatedAt : null,
      downtimeMinutes,
      assignedTo: ticket.assignedTo?.name || 'Unassigned'
    };
  });

  // Group downtime by machine
  const machineDowntimeSummary = machineDowntime.reduce((acc: any, curr: any) => {
    const machineKey = curr.machineId;
    if (!acc[machineKey]) {
      acc[machineKey] = {
        machineId: curr.machineId,
        model: curr.model,
        serialNo: curr.serialNo,
        customer: curr.customer,
        totalDowntimeMinutes: 0,
        incidents: 0,
        openIncidents: 0,
        resolvedIncidents: 0
      };
    }
    
    acc[machineKey].totalDowntimeMinutes += curr.downtimeMinutes;
    acc[machineKey].incidents += 1;
    
    if (curr.status === 'RESOLVED' || curr.status === 'CLOSED') {
      acc[machineKey].resolvedIncidents += 1;
    } else {
      acc[machineKey].openIncidents += 1;
    }
    
    return acc;
  }, {} as Record<string, any>);

  // Filter zone users if customer filter is applied
  const filteredZoneUsers = zoneUsers.filter((user: any) => {
    if (!filters?.customerId) return true;
    return user.customerId === parseInt(filters.customerId);
  });

  // Filter machine downtime by asset if asset filter is applied
  const filteredMachineDowntime = Object.values<Record<string, any>>(machineDowntimeSummary).filter((machine: any) => {
    if (filters?.assetId && machine.machineId !== filters.assetId) {
      return false;
    }
    return true;
  });

  // Prepare response
  const response: IndustrialZoneData = {
    zoneUsers: filteredZoneUsers.map((user: any) => ({
      id: user.id,
      name: user.name || user.email,
      email: user.email,
      phone: user.phone,
      zones: user.serviceZones.map((sz: any) => sz.serviceZone.name),
      customerId: user.customerId
    })),
    servicePersons: servicePersons.map((sp: any) => ({
      id: sp.id,
      name: sp.name,
      email: sp.email,
      phone: sp.phone,
      zones: sp.serviceZones.map((sz: any) => sz.serviceZone.name),
      assignedTickets: sp.assignedTickets.length,
      activeTickets: sp.assignedTickets.filter((t: any) => 
        ['OPEN', 'IN_PROGRESS', 'ASSIGNED'].includes(t.status)
      ).length
    })),
    machineDowntime: filteredMachineDowntime as any[],
    detailedDowntime: machineDowntime.filter((downtime: any) => 
      !filters?.assetId || downtime.machineId === filters.assetId
    ) as any[],
    summary: {
      totalZoneUsers: zoneUsers.length,
      totalServicePersons: servicePersons.length,
      totalMachinesWithDowntime: filteredMachineDowntime.length,
      totalDowntimeHours: filteredMachineDowntime.reduce((sum: number, machine: any) => 
        sum + Math.round((machine.totalDowntimeMinutes || 0) / 60 * 100) / 100, 0
      ),
      averageDowntimePerMachine: filteredMachineDowntime.length > 0 
        ? Math.round(filteredMachineDowntime.reduce((sum: number, machine: any) => 
            sum + (machine.totalDowntimeMinutes || 0), 0
          ) / filteredMachineDowntime.length)
        : 0
    }
  };

  return res.json(response as IndustrialZoneData);
}

// Define column structure for CSV/Excel export
interface ColumnDefinition {
  key: string;
  header: string;
  width?: number;
  format?: (value: any) => string;
  align?: 'left' | 'center' | 'right';
}

export const exportReport = async (req: Request, res: Response) => {
  try {
    const { from, to, zoneId, reportType, format = 'csv', ...otherFilters } = req.query as unknown as ReportFilters & { format: string };
    
    // Validate required parameters
    if (!reportType) {
      return res.status(400).json({ error: 'Report type is required' });
    }
    
    const startDate = from ? new Date(from) : subDays(new Date(), 30);
    const endDate = to ? new Date(to) : new Date();
    
    // Set end date to end of day
    endDate.setHours(23, 59, 59, 999);

    const whereClause: any = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (zoneId) {
      whereClause.zoneId = parseInt(zoneId as string);
    }

    let data: any[] = [];
    let columns: ColumnDefinition[] = [];
    let summaryData: any = null;
    const reportTitle = reportType.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    
    const filename = `${reportTitle.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}`;
    const filters = { 
      from: startDate.toISOString(), 
      to: endDate.toISOString(), 
      ...Object.fromEntries(
        Object.entries(otherFilters).filter(([_, v]) => v !== undefined && v !== '')
      )
    };

    // Get data based on report type
    switch (reportType) {
      case 'ticket-summary':
        const ticketData = await getTicketSummaryData(whereClause, startDate, endDate);
        data = ticketData.tickets || [];
        summaryData = ticketData.summary;
        columns = getColumnsForReport('ticket-summary');
        break;
        
      case 'sla-performance':
        const slaData = await getSlaPerformanceData(whereClause, startDate, endDate);
        data = slaData.breachedTickets || [];
        summaryData = slaData.summary;
        columns = getColumnsForReport('sla-performance');
        break;
        
      case 'executive-summary':
        const executiveData = await getExecutiveSummaryData(whereClause, startDate, endDate);
        data = executiveData.trends || [];
        summaryData = executiveData.summary;
        columns = getColumnsForReport('executive-summary');
        break;
        
      case 'customer-satisfaction':
        const satisfactionData = await getCustomerSatisfactionData(whereClause, startDate, endDate);
        data = satisfactionData.recentFeedbacks || [];
        
        // Calculate average rating
        const totalRatings = Object.entries(satisfactionData.ratingDistribution || {})
          .reduce((sum, [rating, count]) => sum + (parseInt(rating) * (count as number)), 0);
        const totalResponses = Object.values(satisfactionData.ratingDistribution || {})
          .reduce((sum, count) => sum + (count as number), 0);
        const averageRating = totalResponses > 0 ? (totalRatings / totalResponses).toFixed(1) : 0;
        
        summaryData = {
          'Average Rating': averageRating,
          'Total Feedbacks': totalResponses,
          'Rating Distribution': JSON.stringify(satisfactionData.ratingDistribution || {})
        };
        
        columns = [
          { key: 'id', header: 'ID', width: 10 },
          { key: 'rating', header: 'Rating', width: 15 },
          { key: 'comment', header: 'Comment', width: 50 },
          { key: 'createdAt', header: 'Date', width: 20, format: (date: string) => new Date(date).toLocaleString() },
          { key: 'ticketId', header: 'Ticket ID', width: 15 },
          { key: 'customerName', header: 'Customer', width: 30 }
        ];
        break;
        
      case 'industrial-data':
        const industrialData = await getIndustrialDataData(whereClause, startDate, endDate, otherFilters);
        data = industrialData.detailedDowntime || [];
        summaryData = industrialData.summary;
        columns = getColumnsForReport('industrial-data');
        break;
        
      case 'agent-productivity':
        const agentData = await getAgentProductivityData(whereClause, startDate, endDate);
        data = agentData.agents || [];
        summaryData = agentData.summary;
        columns = getColumnsForReport('agent-productivity');
        break;
        
      case 'zone-performance':
        const zoneData = await getZonePerformanceData(whereClause, startDate, endDate);
        data = zoneData.zones || [];
        summaryData = zoneData.summary;
        columns = getColumnsForReport('zone-performance');
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid report type' });
    }

    if (format.toLowerCase() === 'pdf') {
      // Generate PDF with summary and data
      await generatePdf(res, data, columns, `${reportTitle} Report`, filters, summaryData);
    } else {
      // Use the CSV generator for CSV export
      generateCsv(
        res,
        data,
        columns,
        `${reportTitle} Report`,
        filters,
        summaryData
      );
    }
  } catch (error) {
    console.error('Error exporting report:', error);
    res.status(500).json({ 
      error: 'Failed to export report',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Helper function to safely get nested properties
const getNestedValue = (obj: any, path: string) => {
  return path.split('.').reduce((acc, part) => {
    if (acc === null || acc === undefined) return '';
    if (Array.isArray(acc[part])) return acc[part].join(', ');
    return acc[part] !== undefined ? acc[part] : '';
  }, obj);
};

// Helper function to format a single CSV field
function formatCSVField(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  // Handle Date objects
  if (value instanceof Date) {
    return `"${value.toISOString()}"`;
  }
  
  // Handle arrays and objects
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    try {
      value = JSON.stringify(value);
    } catch (e) {
      value = String(value);
    }
  } else {
    value = String(value);
  }
  
  // Escape quotes and wrap in quotes
  value = value.replace(/"/g, '""');
  return `"${value}"`; // Always wrap in quotes for consistency
}

// Helper function to convert data to CSV with proper formatting
function convertToCSV(data: any[], columns?: Array<{key: string, header: string, format?: (value: any) => string}>): string {
  if (!data || data.length === 0) return '';
  
  // Use provided columns or get from first object
  const headers = columns ? columns.map(col => col.header) : Object.keys(data[0] || {});
  const keys = columns ? columns.map(col => col.key) : Object.keys(data[0] || {});
  
  // Create CSV header row with BOM for Excel compatibility
  let csv = '\uFEFF'; // Add BOM for Excel
  csv += headers.map(header => formatCSVField(header)).join(',') + '\r\n';
  
  // Add data rows
  data.forEach(row => {
    if (!row) return; // Skip null/undefined rows
    
    const values = keys.map((key, index) => {
      // Get the value, handling nested properties
      let value = getNestedValue(row, key);
      
      // Apply formatting if specified
      if (columns && columns[index]?.format) {
        try {
          value = columns[index].format?.(value) ?? value;
        } catch (e) {
          console.warn(`Error formatting value for column ${key}:`, e);
        }
      }
      
      return formatCSVField(value);
    });
    
    csv += values.join(',') + '\r\n';
  });
  
  return csv;
}

// Helper functions to get report data without sending response
async function getTicketSummaryData(whereClause: any, startDate: Date, endDate: Date): Promise<TicketSummaryData> {
  const tickets = await prisma.ticket.findMany({
    where: whereClause,
    include: { 
      customer: true, 
      assignedTo: true,
      zone: true,
      asset: true
    }
  });

  const statusDistribution = await prisma.ticket.groupBy({
    by: ['status'],
    where: whereClause,
    _count: true,
  });

  const priorityDistribution = await prisma.ticket.groupBy({
    by: ['priority'],
    where: whereClause,
    _count: true,
  });

  const slaDistribution = await prisma.ticket.groupBy({
    by: ['slaStatus'],
    where: whereClause,
    _count: true,
  });

  // Generate daily trends
  const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
  const dailyTrends = await Promise.all(
    dateRange.map(async (date) => {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      const [created, resolved] = await Promise.all([
        prisma.ticket.count({
          where: {
            ...whereClause,
            createdAt: { gte: startOfDay, lte: endOfDay }
          }
        }),
        prisma.ticket.count({
          where: {
            ...whereClause,
            status: { in: ['RESOLVED', 'CLOSED'] },
            updatedAt: { gte: startOfDay, lte: endOfDay }
          }
        })
      ]);

      return {
        date: format(date, 'yyyy-MM-dd'),
        created,
        resolved
      };
    })
  );

  // Calculate average resolution time
  const resolvedTickets = tickets.filter((t: { status: string }) => 
    t.status === 'RESOLVED' || t.status === 'CLOSED'
  );
  
  let avgResolutionTime = 0;
  if (resolvedTickets.length > 0) {
    const totalTime = resolvedTickets.reduce((sum: number, ticket: { updatedAt: Date; createdAt: Date }) => {
      if (ticket.createdAt && ticket.updatedAt) {
        return sum + differenceInMinutes(ticket.updatedAt, ticket.createdAt);
      }
      return sum;
    }, 0);
    avgResolutionTime = Math.round(totalTime / resolvedTickets.length);
  }

  return {
    tickets,
    summary: {
      totalTickets: tickets.length,
      openTickets: tickets.filter((t: any) => t.status === 'OPEN').length,
      inProgressTickets: tickets.filter((t: any) => 
        ['IN_PROGRESS', 'ASSIGNED', 'IN_PROCESS'].includes(t.status)
      ).length,
      resolvedTickets: resolvedTickets.length,
      closedTickets: tickets.filter((t: any) => t.status === 'CLOSED').length,
      averageResolutionTime: avgResolutionTime,
      escalatedTickets: tickets.filter((t: { isEscalated: boolean }) => t.isEscalated).length,
    },
    statusDistribution: statusDistribution.reduce((acc: Record<string, number>, curr: { status: string; _count: number }) => ({
      ...acc,
      [curr.status]: curr._count
    }), {}),
    priorityDistribution: priorityDistribution.reduce((acc: Record<string, number>, curr: { priority: string; _count: number }) => ({
      ...acc,
      [curr.priority]: curr._count
    }), {}),
    dailyTrends
  };
}

async function getSlaPerformanceData(whereClause: any, startDate: Date, endDate: Date): Promise<SlaPerformanceData> {
  const tickets = await prisma.ticket.findMany({
    where: { 
      ...whereClause, 
      slaDueAt: { not: null }
    },
    include: { 
      customer: true,
      assignedTo: true,
      zone: true,
      asset: true
    }
  });

  const now = new Date();
  const breachedTickets = tickets.filter((t: { slaDueAt: Date | null }) => t.slaDueAt && now > t.slaDueAt);

  // Calculate SLA compliance by priority
  const prioritySla = Object.values(Priority).reduce((acc: any, priority: any) => {
    const priorityTickets = tickets.filter((t: any) => t.priority === priority);
    const priorityBreaches = priorityTickets.filter((t: any) => t.slaDueAt && now > t.slaDueAt);
    
    acc[priority] = {
      total: priorityTickets.length,
      breaches: priorityBreaches.length,
      compliance: priorityTickets.length > 0 
        ? ((priorityTickets.length - priorityBreaches.length) / priorityTickets.length) * 100 
        : 100
    };
    return acc;
  }, {} as Record<string, any>);

  return {
    breachedTickets,
    summary: {
      totalTicketsWithSLA: tickets.length,
      slaBreaches: breachedTickets.length,
      slaOnTime: tickets.length - breachedTickets.length,
      complianceRate: tickets.length > 0 
        ? ((tickets.length - breachedTickets.length) / tickets.length) * 100 
        : 100
    },
    prioritySla
  };
}

async function getZonePerformanceData(whereClause: any, startDate: Date, endDate: Date): Promise<ZonePerformanceData> {
  const zones = await prisma.serviceZone.findMany({
    include: {
      tickets: { where: whereClause },
      customers: true,
      servicePersons: true
    }
  });

  const zoneStats = zones.map((zone: any) => {
    const tickets = zone.tickets;
    const resolvedTickets = tickets.filter((t: { status: string }) => 
      t.status === 'RESOLVED' || t.status === 'CLOSED'
    );
    
    // Calculate average resolution time for this zone
    let avgResolutionTime = 0;
    if (resolvedTickets.length > 0) {
      const totalTime = resolvedTickets.reduce((sum: number, ticket: { createdAt: Date; updatedAt: Date }) => {
        if (ticket.createdAt && ticket.updatedAt) {
          return sum + differenceInMinutes(ticket.updatedAt, ticket.createdAt);
        }
        return sum;
      }, 0);
      avgResolutionTime = Math.round(totalTime / resolvedTickets.length);
    }

    // Count customers and assets in this zone
    const customerCount = zone.customers.length;
    const assetCount = zone.customers.reduce((sum: number, customer: { assets: any[] }) => sum + customer.assets.length, 0);

    return {
      zoneId: zone.id,
      zoneName: zone.name,
      totalTickets: tickets.length,
      resolvedTickets: resolvedTickets.length,
      openTickets: tickets.filter((t: any) => 
        ['OPEN', 'IN_PROGRESS', 'ASSIGNED'].includes(t.status)
      ).length,
      servicePersons: zone.servicePersons.length,
      customerCount,
      assetCount,
      resolutionRate: tickets.length > 0 
        ? parseFloat(((resolvedTickets.length / tickets.length) * 100).toFixed(2))
        : 0,
      averageResolutionTime: avgResolutionTime,
      escalatedTickets: tickets.filter((t: { isEscalated: boolean }) => t.isEscalated).length
    };
  });

  return {
    zones: zoneStats,
    summary: {
      totalZones: zones.length,
      totalTickets: zoneStats.reduce((sum: number, zone: { totalTickets: number }) => sum + (zone.totalTickets || 0), 0),
      totalResolved: zoneStats.reduce((sum: number, zone: { resolvedTickets: number }) => sum + (zone.resolvedTickets || 0), 0),
      averageResolutionRate: zoneStats.length > 0 
        ? zoneStats.reduce((sum: number, zone: { resolutionRate: number }) => sum + (zone.resolutionRate || 0), 0) / zoneStats.length
        : 0
    }
  };
}

async function getAgentProductivityData(whereClause: any, startDate: Date, endDate: Date): Promise<AgentProductivityData> {
  const agents = await prisma.user.findMany({
    where: { 
      role: 'SERVICE_PERSON',
      assignedTickets: {
        some: whereClause
      }
    },
    include: {
      assignedTickets: {
        where: whereClause,
        include: {
          customer: true,
          zone: true,
          asset: true
        }
      },
      serviceZones: {
        include: {
          serviceZone: true
        }
      }
    }
  });

  const agentStats = agents.map((agent: any) => {
    const tickets = agent.assignedTickets || [];
    const resolvedTickets = tickets.filter((t: { status: string }) => 
      t.status === 'RESOLVED' || t.status === 'CLOSED'
    );
    
    // Calculate average resolution time in minutes
    const resolvedWithTime = resolvedTickets.filter((t: any) => t.createdAt && t.updatedAt);
    const totalResolutionTime = resolvedWithTime.reduce((sum: number, t: any) => {
      return sum + differenceInMinutes(t.updatedAt, t.createdAt);
    }, 0);
    
    const avgResolutionTime = resolvedWithTime.length > 0 
      ? Math.round(totalResolutionTime / resolvedWithTime.length)
      : 0;

    // Calculate first response time (simplified)
    const ticketsWithResponse = tickets.filter((t: any) => t.updatedAt !== t.createdAt);
    const avgFirstResponseTime = ticketsWithResponse.length > 0
      ? Math.round(ticketsWithResponse.reduce((sum: number, t: any) => {
          return sum + differenceInMinutes(t.updatedAt, t.createdAt);
        }, 0) / ticketsWithResponse.length)
      : 0;

    return {
      agentId: agent.id,
      agentName: agent.name || agent.email || `Agent ${agent.id}`,
      email: agent.email,
      zones: agent.serviceZones.map((sz: any) => sz.serviceZone.name),
      totalTickets: tickets.length,
      resolvedTickets: resolvedTickets.length,
      openTickets: tickets.filter((t: any) => 
        ['OPEN', 'IN_PROGRESS', 'ASSIGNED'].includes(t.status)
      ).length,
      resolutionRate: tickets.length > 0 
        ? parseFloat(((resolvedTickets.length / tickets.length) * 100).toFixed(2))
        : 0,
      averageResolutionTime: avgResolutionTime,
      averageFirstResponseTime: avgFirstResponseTime,
      escalatedTickets: tickets.filter((t: { isEscalated: boolean }) => t.isEscalated).length
    };
  });

  return {
    agents: agentStats,
    summary: {
      totalAgents: agents.length,
      performanceMetrics: {
        topPerformer: agentStats.length > 0 
          ? agentStats.reduce((max: any, agent: any) => 
              agent.resolutionRate > max.resolutionRate ? agent : max, agentStats[0])
          : null,
        averageResolutionRate: agentStats.length > 0
          ? agentStats.reduce((sum: number, agent: any) => sum + agent.resolutionRate, 0) / agentStats.length
          : 0
      }
    }
  };
}

async function getIndustrialDataData(whereClause: any, startDate: Date, endDate: Date, filters?: { customerId?: string, assetId?: string }): Promise<IndustrialZoneData> {
  // Get zone users (ZONE_USER role)
  const zoneUsers = await prisma.user.findMany({
    where: {
      role: UserRole.ZONE_USER,
      isActive: true
    },
    include: {
      serviceZones: {
        include: {
          serviceZone: true
        }
      }
    }
  });

  // Get service persons
  const servicePersons = await prisma.user.findMany({
    where: {
      role: UserRole.SERVICE_PERSON,
      isActive: true
    },
    include: {
      serviceZones: {
        include: {
          serviceZone: true
        }
      },
      assignedTickets: {
        where: whereClause,
        include: {
          asset: true
        }
      }
    }
  });

  // Get machine downtime data
  const ticketsWithDowntime = await prisma.ticket.findMany({
    where: {
      ...whereClause,
      OR: [
        { status: { in: ['OPEN', 'IN_PROGRESS', 'ASSIGNED'] } },
        { 
          status: { in: ['RESOLVED', 'CLOSED'] },
          updatedAt: { gte: startDate, lte: endDate }
        }
      ]
    },
    include: {
      asset: {
        include: {
          customer: true
        }
      },
      zone: true,
      assignedTo: true
    }
  });

  // Calculate downtime for each machine
  const machineDowntime = ticketsWithDowntime.map((ticket: any) => {
    let downtimeMinutes = 0;
    
    if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
      // For resolved tickets, calculate the time between creation and resolution
      downtimeMinutes = differenceInMinutes(ticket.updatedAt, ticket.createdAt);
    } else {
      // For open tickets, calculate time from creation to now
      downtimeMinutes = differenceInMinutes(new Date(), ticket.createdAt);
    }
    
    return {
      machineId: ticket.asset?.machineId || 'Unknown',
      model: ticket.asset?.model || 'Unknown',
      serialNo: ticket.asset?.serialNo || 'Unknown',
      customer: ticket.asset?.customer?.companyName || 'Unknown',
      zone: ticket.zone?.name || 'Unknown',
      ticketId: ticket.id,
      ticketTitle: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      resolvedAt: ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' ? ticket.updatedAt : null,
      downtimeMinutes,
      assignedTo: ticket.assignedTo?.name || 'Unassigned'
    };
  });

  // Group downtime by machine
  const machineDowntimeSummary = machineDowntime.reduce((acc: any, curr: any) => {
    const machineKey = curr.machineId;
    if (!acc[machineKey]) {
      acc[machineKey] = {
        machineId: curr.machineId,
        model: curr.model,
        serialNo: curr.serialNo,
        customer: curr.customer,
        totalDowntimeMinutes: 0,
        incidents: 0,
        openIncidents: 0,
        resolvedIncidents: 0
      };
    }
    
    acc[machineKey].totalDowntimeMinutes += curr.downtimeMinutes;
    acc[machineKey].incidents += 1;
    
    if (curr.status === 'RESOLVED' || curr.status === 'CLOSED') {
      acc[machineKey].resolvedIncidents += 1;
    } else {
      acc[machineKey].openIncidents += 1;
    }
    
    return acc;
  }, {} as Record<string, any>);

  // Filter machine downtime by asset if specified
  const filteredMachineDowntime = Object.values(machineDowntimeSummary).filter((machine: any) => {
    if (filters?.assetId && machine.machineId !== filters.assetId) {
      return false;
    }
    return true;
  });

  return {
    zoneUsers: zoneUsers.map((user: any) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      zones: user.serviceZones.map((sz: any) => sz.serviceZone.name),
      lastLogin: user.lastLoginAt,
      customerId: user.customerId
    })),
    servicePersons: servicePersons.map((sp: any) => ({
      id: sp.id,
      name: sp.name,
      email: sp.email,
      phone: sp.phone,
      zones: sp.serviceZones.map((sz: any) => sz.serviceZone.name),
      assignedTickets: sp.assignedTickets?.length || 0,
      activeTickets: sp.assignedTickets?.filter((t: any) => 
        ['OPEN', 'IN_PROGRESS', 'ASSIGNED'].includes(t.status)
      ).length || 0
    })),
    machineDowntime: filteredMachineDowntime as any[],
    detailedDowntime: machineDowntime.filter((downtime: any) => 
      !filters?.assetId || downtime.machineId === filters.assetId
    ) as any[],
    summary: {
      totalZoneUsers: zoneUsers.length,
      totalServicePersons: servicePersons.length,
      totalMachinesWithDowntime: filteredMachineDowntime.length,
      totalDowntimeHours: filteredMachineDowntime.reduce((sum: number, machine: any) => 
        sum + Math.round((machine.totalDowntimeMinutes || 0) / 60 * 100) / 100, 0
      ),
      averageDowntimePerMachine: filteredMachineDowntime.length > 0 
        ? Math.round(filteredMachineDowntime.reduce((sum: number, machine: any) => 
            sum + (machine.totalDowntimeMinutes || 0), 0
          ) / filteredMachineDowntime.length)
        : 0
    }
  };
}

async function generateExecutiveSummaryReport(res: Response, whereClause: any, startDate: Date, endDate: Date) {
  try {
    // Get comprehensive data for executive summary
    const [
      tickets,
      feedbacks,
      zones,
      agents,
      customers,
      assets
    ] = await Promise.all([
      // All tickets in date range
      prisma.ticket.findMany({
        where: whereClause,
        include: {
          customer: true,
          assignedTo: true,
          zone: true,
          asset: true
        }
      }),
      // Customer feedback
      prisma.ticketFeedback.findMany({
        where: {
          submittedAt: { gte: startDate, lte: endDate }
        },
        include: {
          ticket: { include: { customer: true } }
        }
      }),
      // Service zones
      prisma.serviceZone.findMany({
        include: {
          tickets: { where: whereClause },
          customers: true,
          servicePersons: true
        }
      }),
      // Service agents
      prisma.user.findMany({
        where: { role: 'SERVICE_PERSON' },
        include: {
          assignedTickets: { where: whereClause }
        }
      }),
      // Customers
      prisma.customer.findMany({
        include: {
          tickets: { where: whereClause },
          assets: true
        }
      }),
      // Assets
      prisma.asset.findMany({
        include: {
          tickets: { where: whereClause }
        }
      })
    ]);

    // Calculate key metrics
    const resolvedTickets = tickets.filter((t: { status: string }) => ['RESOLVED', 'CLOSED'].includes(t.status));
    const openTickets = tickets.filter((t: { status: string }) => ['OPEN', 'IN_PROGRESS', 'ASSIGNED'].includes(t.status));
    const criticalTickets = tickets.filter((t: { priority: string }) => t.priority === 'CRITICAL');
    
    // Calculate resolution metrics
    const avgResolutionTime = resolvedTickets.length > 0 
      ? resolvedTickets.reduce((sum: number, ticket: { updatedAt: Date; createdAt: Date }) => {
          return sum + differenceInMinutes(ticket.updatedAt, ticket.createdAt);
        }, 0) / resolvedTickets.length
      : 0;

    // Customer satisfaction metrics
    const avgRating = feedbacks.length > 0 
      ? feedbacks.reduce((sum: number, fb: any) => sum + fb.rating, 0) / feedbacks.length 
      : 0;

    // Financial impact estimation (simplified)
    const estimatedRevenueSaved = resolvedTickets.length * 500; // $500 per resolved ticket
    const downtimeCost = openTickets.length * 100; // $100 per hour of downtime

    // Zone performance
    const zonePerformance = zones.map((zone: any) => {
      const zoneTickets = zone.tickets;
      const zoneResolved = zoneTickets.filter((t: any) => ['RESOLVED', 'CLOSED'].includes(t.status));
      return {
        name: zone.name,
        efficiency: zoneTickets.length > 0 ? (zoneResolved.length / zoneTickets.length) * 100 : 0,
        ticketCount: zoneTickets.length,
        customerCount: zone.customers.length
      };
    });

    // Agent productivity
    const agentProductivity = agents.map((agent: any) => {
      const agentTickets = agent.assignedTickets;
      const agentResolved = agentTickets.filter((t: any) => ['RESOLVED', 'CLOSED'].includes(t.status));
      return {
        name: agent.name || agent.email,
        productivity: agentTickets.length > 0 ? (agentResolved.length / agentTickets.length) * 100 : 0,
        ticketCount: agentTickets.length
      };
    });

    // Asset health
    const assetHealth = assets.map((asset: any) => {
      const assetTickets = asset.tickets;
      const criticalIssues = assetTickets.filter((t: any) => t.priority === 'CRITICAL').length;
      return {
        machineId: asset.machineId,
        model: asset.model,
        healthScore: Math.max(0, 100 - (criticalIssues * 20)), // Simplified health score
        ticketCount: assetTickets.length
      };
    });

    // Trends data
    const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
    const trends = await Promise.all(
      dateRange.slice(-7).map(async (date) => { // Last 7 days for trends
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);
        
        const [created, resolved, feedback] = await Promise.all([
          prisma.ticket.count({
            where: { ...whereClause, createdAt: { gte: dayStart, lte: dayEnd } }
          }),
          prisma.ticket.count({
            where: { 
              ...whereClause, 
              status: { in: ['RESOLVED', 'CLOSED'] },
              updatedAt: { gte: dayStart, lte: dayEnd }
            }
          }),
          prisma.ticketFeedback.aggregate({
            where: { submittedAt: { gte: dayStart, lte: dayEnd } },
            _avg: { rating: true }
          })
        ]);

        return {
          date: format(date, 'MMM dd'),
          ticketsCreated: created,
          ticketsResolved: resolved,
          avgRating: feedback._avg.rating || 0
        };
      })
    );

    res.json({
      summary: {
        totalTickets: tickets.length,
        resolvedTickets: resolvedTickets.length,
        openTickets: openTickets.length,
        criticalTickets: criticalTickets.length,
        resolutionRate: tickets.length > 0 ? (resolvedTickets.length / tickets.length) * 100 : 0,
        avgResolutionTimeHours: Math.round(avgResolutionTime / 60),
        customerSatisfaction: parseFloat(avgRating.toFixed(1)),
        totalCustomers: customers.length,
        activeAssets: assets.length,
        estimatedRevenueSaved,
        downtimeCost,
        netBusinessImpact: estimatedRevenueSaved - downtimeCost
      },
      zonePerformance: zonePerformance.sort((a: { efficiency: number }, b: { efficiency: number }) => b.efficiency - a.efficiency),
      agentProductivity: agentProductivity.sort((a: { productivity: number }, b: { productivity: number }) => b.productivity - a.productivity),
      assetHealth: assetHealth.sort((a: { healthScore: number }, b: { healthScore: number }) => a.healthScore - b.healthScore),
      trends,
      kpis: {
        firstCallResolution: Math.round(Math.random() * 20 + 70), // Simulated KPI
        slaCompliance: Math.round(Math.random() * 15 + 80), // Simulated KPI
        customerRetention: Math.round(Math.random() * 10 + 85), // Simulated KPI
        operationalEfficiency: Math.round(Math.random() * 20 + 75) // Simulated KPI
      }
    });
  } catch (error) {
    console.error('Error generating executive summary:', error);
    res.status(500).json({ error: 'Failed to generate executive summary' });
  }
}

async function getExecutiveSummaryData(whereClause: any, startDate: Date, endDate: Date) {
  // Reuse the executive summary generation logic
  const [
    tickets,
    feedbacks,
    zones,
    agents,
    customers,
    assets
  ] = await Promise.all([
    prisma.ticket.findMany({
      where: whereClause,
      include: { customer: true, assignedTo: true, zone: true, asset: true }
    }),
    prisma.ticketFeedback.findMany({
      where: { submittedAt: { gte: startDate, lte: endDate } },
      include: { ticket: { include: { customer: true } } }
    }),
    prisma.serviceZone.findMany({
      include: { tickets: { where: whereClause }, customers: true, servicePersons: true }
    }),
    prisma.user.findMany({
      where: { role: 'SERVICE_PERSON' },
      include: { assignedTickets: { where: whereClause } }
    }),
    prisma.customer.findMany({
      include: { tickets: { where: whereClause }, assets: true }
    }),
    prisma.asset.findMany({
      include: { tickets: { where: whereClause } }
    })
  ]);

  const resolvedTickets = tickets.filter((t: { status: string }) => ['RESOLVED', 'CLOSED'].includes(t.status));
  const openTickets = tickets.filter((t: { status: string }) => ['OPEN', 'IN_PROGRESS', 'ASSIGNED'].includes(t.status));
  const avgRating = feedbacks.length > 0 ? feedbacks.reduce((sum: number, fb: { rating: number }) => sum + fb.rating, 0) / feedbacks.length : 0;
  
  const avgResolutionTime = resolvedTickets.length > 0 
    ? resolvedTickets.reduce((sum: number, ticket: { updatedAt: Date, createdAt: Date }) => sum + differenceInMinutes(ticket.updatedAt, ticket.createdAt), 0) / resolvedTickets.length
    : 0;

  // Generate trends data for the last 7 days
  const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
  const trends = await Promise.all(
    dateRange.slice(-7).map(async (date) => {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      
      const [created, resolved] = await Promise.all([
        prisma.ticket.count({
          where: { ...whereClause, createdAt: { gte: dayStart, lte: dayEnd } }
        }),
        prisma.ticket.count({
          where: { 
            ...whereClause, 
            status: { in: ['RESOLVED', 'CLOSED'] },
            updatedAt: { gte: dayStart, lte: dayEnd }
          }
        })
      ]);

      return {
        date: format(date, 'MMM dd'),
        ticketsCreated: created,
        ticketsResolved: resolved,
        avgRating: Math.random() * 2 + 3 // Simulated for demo
      };
    })
  );

  return {
    summary: {
      totalTickets: tickets.length,
      resolvedTickets: resolvedTickets.length,
      openTickets: openTickets.length,
      resolutionRate: tickets.length > 0 ? (resolvedTickets.length / tickets.length) * 100 : 0,
      avgResolutionTimeHours: Math.round(avgResolutionTime / 60),
      customerSatisfaction: parseFloat(avgRating.toFixed(1)),
      totalCustomers: customers.length,
      activeAssets: assets.length
    },
    trends,
    kpis: {
      firstCallResolution: Math.round(Math.random() * 20 + 70),
      slaCompliance: Math.round(Math.random() * 15 + 80),
      customerRetention: Math.round(Math.random() * 10 + 85),
      operationalEfficiency: Math.round(Math.random() * 20 + 75)
    }
  };
}

export const generateZoneReport = async (req: Request, res: Response) => {
  try {
    const { from, to, reportType, customerId, assetId, zoneId } = req.query as unknown as ReportFilters;
    const user = (req as any).user;
    
    // Get user's zones - different logic for ZONE_USER vs SERVICE_PERSON
    let userZoneIds: number[] = [];
    
    if (user.role === 'ZONE_USER') {
      // For ZONE_USER, prefer explicit user.zoneId; fallback to user's customer's serviceZoneId
      const userRecord = await prisma.user.findUnique({
        where: { id: user.id },
        select: { zoneId: true, customerId: true }
      });

      if (userRecord?.zoneId) {
        userZoneIds = [parseInt(userRecord.zoneId)];
      } else if (userRecord?.customerId) {
        const customer = await prisma.customer.findUnique({
          where: { id: userRecord.customerId },
          select: { serviceZoneId: true }
        });
        if (customer?.serviceZoneId) {
          userZoneIds = [customer.serviceZoneId];
        }
      }

      // Fallback: if still empty, check ServicePersonZone mapping for this user
      if (userZoneIds.length === 0) {
        const userZones = await prisma.servicePersonZone.findMany({
          where: { userId: user.id },
          select: { serviceZoneId: true }
        });
        userZoneIds = userZones.map((uz: { serviceZoneId: number }) => uz.serviceZoneId);
      }
    } else {
      // For SERVICE_PERSON, get zones from servicePersonZone table
      const userZones = await prisma.servicePersonZone.findMany({
        where: { userId: user.id },
        select: { serviceZoneId: true }
      });
      userZoneIds = userZones.map((uz: { serviceZoneId: number }) => uz.serviceZoneId);
    }
    
    if (userZoneIds.length === 0) {
      return res.status(403).json({ error: 'User has no assigned zones' });
    }
    
    const startDate = from ? new Date(from) : subDays(new Date(), 30);
    const endDate = to ? new Date(to) : new Date();
    endDate.setHours(23, 59, 59, 999);

    // Base where clause
    const whereClause: any = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      }
    };

    // If a specific zoneId is requested, validate access
    if (zoneId) {
      const requestedZoneId = parseInt(zoneId);
      const isAdmin = user.role === 'ADMIN';
      const hasAccess = isAdmin || userZoneIds.includes(requestedZoneId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'You do not have access to this zone' });
      }
      whereClause.zoneId = requestedZoneId;
    } else {
      // Otherwise, restrict by user's zones
      whereClause.zoneId = { in: userZoneIds };
    }

    switch (reportType) {
      case 'ticket-summary':
        return await generateTicketSummaryReport(res, whereClause, startDate, endDate);
      case 'customer-satisfaction':
        return await generateCustomerSatisfactionReport(res, whereClause, startDate, endDate);
      case 'industrial-data':
        return await generateIndustrialDataReport(res, whereClause, startDate, endDate, { customerId, assetId });
      case 'zone-performance':
        return await generateZonePerformanceReport(res, whereClause, startDate, endDate);
      case 'agent-productivity':
        return await generateAgentProductivityReport(res, whereClause, startDate, endDate);
      case 'executive-summary':
        return await generateExecutiveSummaryReport(res, whereClause, startDate, endDate);
      default:
        return res.status(400).json({ error: 'Invalid report type' });
    }
  } catch (error) {
    console.error('Error generating zone report:', error);
    res.status(500).json({ error: 'Failed to generate zone report' });
  }
}

export const exportZoneReport = async (req: Request, res: Response) => {
  try {
    const { from, to, reportType, format = 'csv', zoneId, ...otherFilters } = req.query as unknown as ReportFilters & { format: string };
    const user = (req as any).user;
    
    // Validate required parameters
    if (!reportType) {
      return res.status(400).json({ error: 'Report type is required' });
    }
    
    // Validate report type
    const validReportTypes = ['executive-summary', 'customer-satisfaction', 'industrial-data', 'agent-productivity', 'zone-performance'];
    if (!validReportTypes.includes(reportType)) {
      return res.status(400).json({ error: 'Invalid report type' });
    }
    
    // Get user's zones - different logic for ZONE_USER vs SERVICE_PERSON
    let userZoneIds: number[] = [];
    
    if (user.role === 'ZONE_USER') {
      // For ZONE_USER, prefer explicit user.zoneId; fallback to user's customer's serviceZoneId
      const userRecord = await prisma.user.findUnique({
        where: { id: user.id },
        select: { zoneId: true, customerId: true }
      });
      
      if (userRecord?.zoneId) {
        userZoneIds = [parseInt(userRecord.zoneId)];
      } else if (userRecord?.customerId) {
        const customer = await prisma.customer.findUnique({
          where: { id: userRecord.customerId },
          select: { serviceZoneId: true }
        });
        if (customer?.serviceZoneId) {
          userZoneIds = [customer.serviceZoneId];
        }
      }

      // Fallback: if still empty, check ServicePersonZone mapping for this user
      if (userZoneIds.length === 0) {
        const userZones = await prisma.servicePersonZone.findMany({
          where: { userId: user.id },
          select: { serviceZoneId: true }
        });
        userZoneIds = userZones.map((uz: { serviceZoneId: number }) => uz.serviceZoneId);
      }
    } else {
      // For SERVICE_PERSON, get zones from servicePersonZone table
      const userZones = await prisma.servicePersonZone.findMany({
        where: { userId: user.id },
        select: { serviceZoneId: true }
      });
      userZoneIds = userZones.map((uz: { serviceZoneId: number }) => uz.serviceZoneId);
    }
    
    if (userZoneIds.length === 0) {
      return res.status(403).json({ error: 'User has no assigned zones' });
    }
    
    const startDate = from ? new Date(from) : subDays(new Date(), 30);
    const endDate = to ? new Date(to) : new Date();
    endDate.setHours(23, 59, 59, 999);

    // Base where clause
    const whereClause: any = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      }
    };

    // If a specific zoneId is requested, validate access
    if (zoneId) {
      const requestedZoneId = parseInt(zoneId as string);
      const isAdmin = user.role === 'ADMIN';
      const hasAccess = isAdmin || userZoneIds.includes(requestedZoneId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'You do not have access to this zone' });
      }
      whereClause.zoneId = requestedZoneId;
    } else {
      // Otherwise, restrict by user's zones
      whereClause.zoneId = { in: userZoneIds };
    }

    let data: any[] = [];
    let columns: ColumnDefinition[] = [];
    let summaryData: any = null;
    const reportTitle = reportType.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    
    const filename = `Zone-${reportTitle.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}`;
    const filters = { 
      from: startDate.toISOString(), 
      to: endDate.toISOString(), 
      zones: zoneId ? String(zoneId) : userZoneIds.join(','),
      ...Object.fromEntries(
        Object.entries(otherFilters).filter(([_, v]) => v !== undefined && v !== '')
      )
    };

    // Get data based on report type
    switch (reportType) {
      case 'executive-summary':
        const executiveData = await getExecutiveSummaryData(whereClause, startDate, endDate);
        data = executiveData.trends || [];
        summaryData = executiveData.summary;
        columns = getColumnsForReport('executive-summary');
        break;
        
      case 'customer-satisfaction':
        const satisfactionData = await getCustomerSatisfactionData(whereClause, startDate, endDate);
        data = satisfactionData.recentFeedbacks || [];
        
        const totalRatings = Object.entries(satisfactionData.ratingDistribution || {})
          .reduce((sum, [rating, count]) => sum + (parseInt(rating) * (count as number)), 0);
        const totalResponses = Object.values(satisfactionData.ratingDistribution || {})
          .reduce((sum, count) => sum + (count as number), 0);
        const averageRating = totalResponses > 0 ? (totalRatings / totalResponses).toFixed(1) : 0;
        
        summaryData = {
          'Average Rating': averageRating,
          'Total Feedbacks': totalResponses,
          'Rating Distribution': JSON.stringify(satisfactionData.ratingDistribution || {})
        };
        
        columns = [
          { key: 'id', header: 'ID', width: 10 },
          { key: 'rating', header: 'Rating', width: 15 },
          { key: 'comment', header: 'Comment', width: 50 },
          { key: 'createdAt', header: 'Date', width: 20, format: (date: string) => new Date(date).toLocaleString() },
          { key: 'ticketId', header: 'Ticket ID', width: 15 },
          { key: 'customerName', header: 'Customer', width: 30 }
        ];
        break;
        
      case 'industrial-data':
        const industrialData = await getIndustrialDataData(whereClause, startDate, endDate, otherFilters);
        data = industrialData.detailedDowntime || [];
        summaryData = industrialData.summary;
        columns = getColumnsForReport('industrial-data');
        break;
        
      case 'agent-productivity':
        const agentData = await getAgentProductivityData(whereClause, startDate, endDate);
        data = agentData.agents || [];
        summaryData = agentData.summary;
        columns = getColumnsForReport('agent-productivity');
        break;
        
      case 'zone-performance':
        const zoneData = await getZonePerformanceData(whereClause, startDate, endDate);
        data = zoneData.zones || [];
        summaryData = zoneData.summary;
        columns = getColumnsForReport('zone-performance');
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid report type' });
    }

    if (format.toLowerCase() === 'pdf') {
      await generatePdf(res, data, columns, `Zone ${reportTitle} Report`, filters, summaryData);
    } else {
      generateCsv(
        res,
        data,
        columns,
        `Zone ${reportTitle} Report`,
        filters,
        summaryData
      );
    }
  } catch (error) {
    console.error('Error exporting zone report:', error);
    res.status(500).json({ 
      error: 'Failed to export zone report',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export default {
  generateReport,
  exportReport,
  generateZoneReport,
  exportZoneReport,
  getZonePerformanceData,
  getAgentProductivityData,
  getIndustrialDataData,
  getExecutiveSummaryData
}