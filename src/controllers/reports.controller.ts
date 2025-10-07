import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { format, subDays, eachDayOfInterval, differenceInMinutes, getDay, setHours, setMinutes, setSeconds, setMilliseconds, addDays, startOfDay } from 'date-fns';
import { generatePdf, getPdfColumns } from '../utils/pdfGenerator';
import { generateExcel, getExcelColumns } from '../utils/excelGenerator';

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

// Helper function to calculate business hours between two dates (9 AM to 5 PM, excluding Sundays)
function calculateBusinessHoursInMinutes(startDate: Date, endDate: Date): number {
  if (startDate >= endDate) return 0;

  let totalMinutes = 0;
  let currentDate = new Date(startDate);
  const finalDate = new Date(endDate);

  // Business hours: 9 AM to 5 PM (8 hours per day)
  const BUSINESS_START_HOUR = 9;
  const BUSINESS_END_HOUR = 17;
  const BUSINESS_HOURS_PER_DAY = BUSINESS_END_HOUR - BUSINESS_START_HOUR; // 8 hours
  const BUSINESS_MINUTES_PER_DAY = BUSINESS_HOURS_PER_DAY * 60; // 480 minutes

  while (currentDate < finalDate) {
    const dayOfWeek = getDay(currentDate); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    // Skip Sundays (dayOfWeek === 0)
    if (dayOfWeek !== 0) {
      // Create business hours for this day
      const businessStart = setMilliseconds(setSeconds(setMinutes(setHours(currentDate, BUSINESS_START_HOUR), 0), 0), 0);
      const businessEnd = setMilliseconds(setSeconds(setMinutes(setHours(currentDate, BUSINESS_END_HOUR), 0), 0), 0);

      // Determine the actual start and end times for this day
      let dayStart = businessStart;
      let dayEnd = businessEnd;

      // If this is the first day, use the actual start time if it's after business start
      if (currentDate.toDateString() === startDate.toDateString()) {
        if (startDate > businessStart) {
          dayStart = startDate;
        }
      }

      // If this is the last day, use the actual end time if it's before business end
      if (currentDate.toDateString() === finalDate.toDateString()) {
        if (finalDate < businessEnd) {
          dayEnd = finalDate;
        }
      }

      // Only count time if it falls within business hours
      if (dayStart < businessEnd && dayEnd > businessStart) {
        // Ensure we don't go outside business hours
        if (dayStart < businessStart) dayStart = businessStart;
        if (dayEnd > businessEnd) dayEnd = businessEnd;
        
        if (dayStart < dayEnd) {
          totalMinutes += differenceInMinutes(dayEnd, dayStart);
        }
      }
    }

    // Move to next day
    currentDate = addDays(startOfDay(currentDate), 1);
  }

  return totalMinutes;
}

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
      case 'her-analysis':
        return await generateHerAnalysisReport(res, whereClause, startDate, endDate);
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
  // Comprehensive data fetching with all necessary relations
  const [
    tickets, 
    statusDistribution, 
    priorityDistribution, 
    slaDistribution,
    zoneDistribution,
    customerDistribution,
    assigneeDistribution
  ] = await Promise.all([
    // Main tickets with all relations
    prisma.ticket.findMany({
      where: whereClause,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        callType: true,
        isEscalated: true,
        createdAt: true,
        updatedAt: true,
        customer: true,
        assignedTo: true,
        zone: true,
        asset: true,
        statusHistory: {
          orderBy: { changedAt: 'desc' }
        },
        feedbacks: true,
        rating: true,
        reports: true
      }
    }),
    // Status distribution
    prisma.ticket.groupBy({
      by: ['status'],
      where: whereClause,
      _count: true,
    }),
    // Priority distribution
    prisma.ticket.groupBy({
      by: ['priority'],
      where: whereClause,
      _count: true,
    }),
    // SLA status distribution
    prisma.ticket.groupBy({
      by: ['slaStatus'],
      where: whereClause,
      _count: true,
    }),
    // Zone-wise distribution
    prisma.ticket.groupBy({
      by: ['zoneId'],
      where: whereClause,
      _count: true,
    }),
    // Customer-wise distribution (top 10)
    prisma.ticket.groupBy({
      by: ['customerId'],
      where: whereClause,
      _count: true,
      orderBy: { _count: { customerId: 'desc' } },
      take: 10
    }),
    // Assignee distribution
    prisma.ticket.groupBy({
      by: ['assignedToId'],
      where: whereClause,
      _count: true,
    })
  ]);

  // Generate comprehensive daily trends
  const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
  const dailyTrends = await Promise.all(
    dateRange.map(async (date) => {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      const [created, resolved, escalated, assigned] = await Promise.all([
        prisma.ticket.count({
          where: {
            ...whereClause,
            createdAt: { gte: startOfDay, lte: endOfDay }
          }
        }),
        // Use status history for accurate resolution tracking
        prisma.ticketStatusHistory.count({
          where: {
            status: { in: ['RESOLVED', 'CLOSED'] },
            changedAt: { gte: startOfDay, lte: endOfDay },
            ticket: whereClause
          }
        }),
        prisma.ticket.count({
          where: {
            ...whereClause,
            isEscalated: true,
            escalatedAt: { gte: startOfDay, lte: endOfDay }
          }
        }),
        prisma.ticket.count({
          where: {
            ...whereClause,
            status: 'ASSIGNED',
            updatedAt: { gte: startOfDay, lte: endOfDay }
          }
        })
      ]);

      return {
        date: format(date, 'yyyy-MM-dd'),
        created,
        resolved,
        escalated,
        assigned
      };
    })
  );

  // Calculate average resolution time
  const resolvedTickets = tickets.filter((t: { status: string }) => 
    t.status === 'RESOLVED' || t.status === 'CLOSED'
  );
  
  let avgResolutionTime = 0;
  if (resolvedTickets.length > 0) {
    // Get tickets with status history to find actual resolution time
    const ticketsWithHistory = await prisma.ticket.findMany({
      where: {
        id: { in: resolvedTickets.map((t: any) => t.id) }
      },
      include: {
        statusHistory: {
          where: {
            status: { in: ['RESOLVED', 'CLOSED'] }
          },
          orderBy: { changedAt: 'desc' },
          take: 1
        }
      }
    });

    let totalTime = 0;
    let validTickets = 0;

    for (const ticket of ticketsWithHistory) {
      let resolutionTime: Date | null = null;
      
      // First try to get resolution time from status history
      if (ticket.statusHistory && ticket.statusHistory.length > 0) {
        resolutionTime = ticket.statusHistory[0].changedAt;
      } 
      // Fallback to updatedAt if no status history
      else if (ticket.updatedAt && ticket.createdAt) {
        // Only use updatedAt if it's significantly different from createdAt (more than 1 minute)
        const timeDiff = differenceInMinutes(ticket.updatedAt, ticket.createdAt);
        if (timeDiff > 1) {
          resolutionTime = ticket.updatedAt;
        }
      }

      if (resolutionTime && ticket.createdAt) {
        const resolutionMinutes = calculateBusinessHoursInMinutes(ticket.createdAt, resolutionTime);
        // Only include reasonable resolution times (between 1 minute and 30 business days)
        if (resolutionMinutes >= 1 && resolutionMinutes <= (30 * 8 * 60)) { // 30 business days = 14400 minutes
          totalTime += resolutionMinutes;
          validTickets++;
        }
      }
    }

    if (validTickets > 0) {
      avgResolutionTime = Math.round(totalTime / validTickets);
    }
  }

  // Calculate advanced metrics
  const now = new Date();
  const criticalTickets = tickets.filter((t: any) => t.priority === 'CRITICAL');
  const highPriorityTickets = tickets.filter((t: any) => t.priority === 'HIGH');
  const unassignedTickets = tickets.filter((t: any) => !t.assignedToId);
  const overdueTickets = tickets.filter((t: any) => t.slaDueAt && now > new Date(t.slaDueAt));
  const ticketsWithFeedback = tickets.filter((t: any) => t.feedbacks?.length > 0 || t.rating);
  
  // Calculate customer satisfaction metrics
  const ratingsData = tickets.filter((t: any) => t.rating?.rating).map((t: any) => t.rating.rating);
  const avgCustomerRating = ratingsData.length > 0 
    ? Math.round((ratingsData.reduce((sum: number, rating: number) => sum + rating, 0) / ratingsData.length) * 100) / 100 
    : 0;
  
  // Calculate first response time
  const ticketsWithHistory = tickets.filter((t: any) => t.statusHistory?.length > 0);
  let avgFirstResponseTime = 0;
  if (ticketsWithHistory.length > 0) {
    const firstResponseTimes = ticketsWithHistory
      .map((t: any) => {
        const firstResponse = t.statusHistory.find((h: any) => h.status !== 'OPEN');
        if (firstResponse) {
          return calculateBusinessHoursInMinutes(new Date(t.createdAt), new Date(firstResponse.changedAt));
        }
        return null;
      })
      .filter((time: number | null): time is number => time !== null && time > 0 && time <= (3 * 8 * 60)); // Max 3 business days
    
    if (firstResponseTimes.length > 0) {
      avgFirstResponseTime = Math.round(firstResponseTimes.reduce((sum: number, time: number) => sum + time, 0) / firstResponseTimes.length);
    }
  }

  // Get zone names for distribution
  const zoneNames = await prisma.serviceZone.findMany({
    where: { id: { in: zoneDistribution.map((z: any) => z.zoneId) } },
    select: { id: true, name: true }
  });

  // Get customer names for distribution
  const customerNames = await prisma.customer.findMany({
    where: { id: { in: customerDistribution.map((c: any) => c.customerId) } },
    select: { id: true, companyName: true }
  });

  // Get assignee names for distribution
  const assigneeNames = await prisma.user.findMany({
    where: { id: { in: assigneeDistribution.filter((a: any) => a.assignedToId).map((a: any) => a.assignedToId) } },
    select: { id: true, name: true, email: true }
  });

  // Calculate resolution rate
  const resolutionRate = tickets.length > 0 
    ? Math.round((resolvedTickets.length / tickets.length) * 100 * 100) / 100 
    : 0;

  // Calculate escalation rate
  const escalationRate = tickets.length > 0 
    ? Math.round((tickets.filter((t: any) => t.isEscalated).length / tickets.length) * 100 * 100) / 100 
    : 0;

  // Calculate customer performance metrics (more tickets = machine issues)
  const customerPerformanceMetrics = customerDistribution.map((c: any) => {
    const customerTickets = tickets.filter((t: any) => t.customerId === c.customerId);
    const customerName = customerNames.find((cn: any) => cn.id === c.customerId)?.companyName || 'Unknown Customer';
    
    // Calculate machine issue indicators
    const criticalIssues = customerTickets.filter((t: any) => t.priority === 'CRITICAL').length;
    const highPriorityIssues = customerTickets.filter((t: any) => t.priority === 'HIGH').length;
    const escalatedIssues = customerTickets.filter((t: any) => t.isEscalated).length;
    const repeatIssues = customerTickets.filter((t: any) => {
      // Check if customer has multiple tickets for same asset
      const assetTickets = customerTickets.filter((at: any) => at.assetId === t.assetId);
      return assetTickets.length > 1;
    }).length;
    
    // Calculate average resolution time for this customer
    const customerResolvedTickets = customerTickets.filter((t: any) => 
      t.status === 'RESOLVED' || t.status === 'CLOSED'
    );
    let avgCustomerResolutionTime = 0;
    if (customerResolvedTickets.length > 0) {
      const customerResolutionTimes = customerResolvedTickets
        .map((t: any) => {
          const resolutionHistory = t.statusHistory?.find((h: any) => 
            h.status === 'RESOLVED' || h.status === 'CLOSED'
          );
          if (resolutionHistory) {
            return calculateBusinessHoursInMinutes(new Date(t.createdAt), new Date(resolutionHistory.changedAt));
          }
          return null;
        })
        .filter((time: number | null): time is number => time !== null && time > 0 && time <= (30 * 8 * 60));
      
      if (customerResolutionTimes.length > 0) {
        avgCustomerResolutionTime = Math.round(
          customerResolutionTimes.reduce((sum: number, time: number) => sum + time, 0) / customerResolutionTimes.length
        );
      }
    }
    
    // Calculate machine health score (lower score = more issues)
    const totalIssues = criticalIssues + highPriorityIssues + escalatedIssues + repeatIssues;
    const machineHealthScore = Math.max(0, 100 - (totalIssues * 5) - (c._count * 2));
    
    return {
      customerId: c.customerId,
      customerName,
      totalTickets: c._count,
      criticalIssues,
      highPriorityIssues,
      escalatedIssues,
      repeatIssues,
      avgResolutionTimeMinutes: avgCustomerResolutionTime,
      avgResolutionTimeHours: avgCustomerResolutionTime > 0 ? Math.round((avgCustomerResolutionTime / 60) * 100) / 100 : 0,
      machineHealthScore,
      riskLevel: machineHealthScore < 50 ? 'HIGH' : machineHealthScore < 75 ? 'MEDIUM' : 'LOW'
    };
  }).sort((a: any, b: any) => b.totalTickets - a.totalTickets); // Sort by ticket count (most issues first)

  // Calculate onsite visit traveling time
  const onsiteTickets = tickets.filter((t: any) => 
    t.visitStartedAt && (t.visitReachedAt || t.visitInProgressAt)
  );
  
  let avgOnsiteTravelTime = 0;
  let avgOnsiteTravelTimeHours = 0;
  if (onsiteTickets.length > 0) {
    const travelTimes = onsiteTickets
      .map((t: any) => {
        const startTime = new Date(t.visitStartedAt);
        const reachTime = new Date(t.visitReachedAt || t.visitInProgressAt);
        const travelMinutes = differenceInMinutes(reachTime, startTime);
        
        // Validate travel time (should be between 1 minute and 8 hours)
        if (travelMinutes > 0 && travelMinutes <= 480) {
          return travelMinutes;
        }
        return null;
      })
      .filter((time: number | null) => time !== null);
    
    if (travelTimes.length > 0) {
      avgOnsiteTravelTime = Math.round(
        travelTimes.reduce((sum: number, time: number) => sum + time, 0) / travelTimes.length
      );
      avgOnsiteTravelTimeHours = Math.round((avgOnsiteTravelTime / 60) * 100) / 100;
    }
  }

  res.json({
    summary: {
      // Basic counts
      totalTickets: tickets.length,
      openTickets: tickets.filter((t: { status: string }) => t.status === 'OPEN').length,
      inProgressTickets: tickets.filter((t: { status: string }) => 
        ['IN_PROGRESS', 'ASSIGNED', 'IN_PROCESS', 'ONSITE_VISIT', 'ONSITE_VISIT_IN_PROGRESS'].includes(t.status)
      ).length,
      resolvedTickets: resolvedTickets.length,
      closedTickets: tickets.filter((t: { status: string }) => t.status === 'CLOSED').length,
      
      // Priority-based metrics
      criticalTickets: criticalTickets.length,
      highPriorityTickets: highPriorityTickets.length,
      unassignedTickets: unassignedTickets.length,
      
      // SLA and performance metrics
      overdueTickets: overdueTickets.length,
      escalatedTickets: tickets.filter((t: { isEscalated: boolean }) => t.isEscalated).length,
      resolutionRate,
      escalationRate,
      
      // Time-based metrics
      averageResolutionTime: avgResolutionTime,
      averageResolutionTimeHours: avgResolutionTime > 0 ? Math.round((avgResolutionTime / 60) * 100) / 100 : 0,
      averageResolutionTimeDays: avgResolutionTime > 0 ? Math.round((avgResolutionTime / (60 * 24)) * 100) / 100 : 0,
      averageFirstResponseTime: avgFirstResponseTime,
      averageFirstResponseTimeHours: avgFirstResponseTime > 0 ? Math.round((avgFirstResponseTime / 60) * 100) / 100 : 0,
      
      // Customer satisfaction metrics
      ticketsWithFeedback: ticketsWithFeedback.length,
      averageCustomerRating: avgCustomerRating,
      totalRatings: ratingsData.length,
      
      // Operational metrics
      totalZones: zoneNames.length,
      totalCustomers: customerNames.length,
      totalAssignees: assigneeNames.length,
      
      // Onsite visit metrics
      avgOnsiteTravelTime: avgOnsiteTravelTime,
      avgOnsiteTravelTimeHours: avgOnsiteTravelTimeHours,
      totalOnsiteVisits: onsiteTickets.length,
    },
    
    // Enhanced distributions with names
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
    
    zoneDistribution: zoneDistribution.map((z: any) => ({
      zoneId: z.zoneId,
      zoneName: zoneNames.find((zn: any) => zn.id === z.zoneId)?.name || 'Unknown Zone',
      count: z._count
    })),
    
    customerDistribution: customerDistribution.map((c: any) => ({
      customerId: c.customerId,
      customerName: customerNames.find((cn: any) => cn.id === c.customerId)?.companyName || 'Unknown Customer',
      count: c._count
    })),
    
    assigneeDistribution: assigneeDistribution
      .filter((a: any) => a.assignedToId)
      .map((a: any) => ({
        assigneeId: a.assignedToId,
        assigneeName: assigneeNames.find((an: any) => an.id === a.assignedToId)?.name || 
                     assigneeNames.find((an: any) => an.id === a.assignedToId)?.email || 'Unknown Assignee',
        count: a._count
      })),
    
    // Enhanced daily trends
    dailyTrends,
    
    // Recent tickets with full details
    recentTickets: tickets
      .sort((a: { createdAt: Date }, b: { createdAt: Date }) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 20)
      .map((ticket: any) => ({
        id: ticket.id,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        createdAt: ticket.createdAt,
        customerName: ticket.customer?.companyName || 'Unknown',
        zoneName: ticket.zone?.name || 'Unknown',
        assigneeName: ticket.assignedTo?.name || 'Unassigned',
        isEscalated: ticket.isEscalated,
        slaStatus: ticket.slaStatus,
        hasRating: !!ticket.rating,
        rating: ticket.rating?.rating || null
      })),
      
    // Customer performance metrics (machine health analysis)
    customerPerformanceMetrics,
    
    // Performance insights
    insights: {
      topPerformingZone: zoneDistribution.length > 0 
        ? zoneNames.find((zn: any) => zn.id === zoneDistribution[0].zoneId)?.name || 'N/A'
        : 'N/A',
      mostActiveCustomer: customerDistribution.length > 0 
        ? customerNames.find((cn: any) => cn.id === customerDistribution[0].customerId)?.companyName || 'N/A'
        : 'N/A',
      topAssignee: assigneeDistribution.length > 0 && assigneeDistribution[0].assignedToId
        ? assigneeNames.find((an: any) => an.id === assigneeDistribution[0].assignedToId)?.name || 'N/A'
        : 'N/A',
      worstPerformingCustomer: customerPerformanceMetrics.length > 0 
        ? customerPerformanceMetrics[0].customerName
        : 'N/A',
      avgTravelTimeFormatted: avgOnsiteTravelTimeHours > 0 
        ? `${Math.floor(avgOnsiteTravelTimeHours)}h ${avgOnsiteTravelTime % 60}m`
        : 'N/A'
    }
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
    
    // Calculate average resolution time for this zone (business hours)
    let avgResolutionTime = 0;
    if (resolvedTickets.length > 0) {
      const totalTime = resolvedTickets.reduce((sum: number, ticket: { createdAt: Date; updatedAt: Date }) => {
        if (ticket.createdAt && ticket.updatedAt) {
          return sum + calculateBusinessHoursInMinutes(ticket.createdAt, ticket.updatedAt);
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
      return sum + calculateBusinessHoursInMinutes(t.createdAt, t.updatedAt);
    }, 0);
    
    const avgResolutionTime = resolvedWithTime.length > 0 
      ? Math.round(totalResolutionTime / resolvedWithTime.length)
      : 0;

    // Calculate first response time (simplified)
    const ticketsWithResponse = tickets.filter((t: any) => t.updatedAt !== t.createdAt);
    const avgFirstResponseTime = ticketsWithResponse.length > 0
      ? Math.round(ticketsWithResponse.reduce((sum: number, t: any) => {
          return sum + calculateBusinessHoursInMinutes(t.createdAt, t.updatedAt);
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

  // Build additional filters for tickets based on customerId and assetId
  const ticketFilters: any = {
    ...whereClause,
    OR: [
      { status: { in: ['OPEN', 'IN_PROGRESS', 'ASSIGNED'] } },
      { 
        status: { in: ['RESOLVED', 'CLOSED'] },
        updatedAt: { gte: startDate, lte: endDate }
      }
    ]
  };

  // Add customer filter if specified
  if (filters?.customerId) {
    ticketFilters.customerId = parseInt(filters.customerId);
  }

  // Add asset filter if specified
  if (filters?.assetId) {
    ticketFilters.assetId = parseInt(filters.assetId);
  }

  // Get machine downtime data
  const ticketsWithDowntime = await prisma.ticket.findMany({
    where: ticketFilters,
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

  // Calculate downtime for each machine (business hours)
  const machineDowntime = ticketsWithDowntime.map((ticket: any) => {
    let downtimeMinutes = 0;
    
    if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
      // For resolved tickets, calculate the time between creation and resolution (business hours)
      downtimeMinutes = calculateBusinessHoursInMinutes(ticket.createdAt, ticket.updatedAt);
    } else {
      // For open tickets, calculate time from creation to now (business hours)
      downtimeMinutes = calculateBusinessHoursInMinutes(ticket.createdAt, new Date());
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

  // Since we've already filtered tickets at the query level, we don't need additional filtering
  // Zone users are not filtered by customer as they manage zones, not specific customers
  const filteredZoneUsers = zoneUsers;

  // Machine downtime is already filtered by the ticket query with customerId and assetId
  const filteredMachineDowntime = Object.values<Record<string, any>>(machineDowntimeSummary).map((machine: any) => ({
    ...machine,
    totalDowntimeHours: Math.round((machine.totalDowntimeMinutes / 60) * 100) / 100,
    avgDowntimeHours: machine.incidents > 0 ? Math.round((machine.totalDowntimeMinutes / machine.incidents / 60) * 100) / 100 : 0
  }));

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
    detailedDowntime: machineDowntime as any[],
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
          ) / filteredMachineDowntime.length / 60 * 100) / 100
        : 0
    }
  };

  return res.json(response as IndustrialZoneData);
}

// Define column structure for PDF/Excel export
interface ColumnDefinition {
  key: string;
  header: string;
  width?: number;
  format?: (value: any) => string;
  align?: 'left' | 'center' | 'right';
}

export const exportReport = async (req: Request, res: Response) => {
  try {
    const { from, to, zoneId, reportType, format = 'pdf', ...otherFilters } = req.query as unknown as ReportFilters & { format: string };
    
    console.log('Export request received:', { from, to, zoneId, reportType, format, otherFilters });
    
    // Validate required parameters
    if (!reportType) {
      console.error('Export failed: Report type is required');
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

    console.log('Export whereClause:', whereClause);

    let data: any[] = [];
    let columns: ColumnDefinition[] = [];
    let summaryData: any = null;
    
    // Custom title mapping for better report names
    const titleMap: { [key: string]: string } = {
      'industrial-data': 'Machine Report',
      'ticket-summary': 'Ticket Summary Report',
      'customer-satisfaction': 'Customer Satisfaction Report',
      'zone-performance': 'Zone Performance Report',
      'agent-productivity': 'Performance Report of All Service Persons and Zone Users',
      'sla-performance': 'SLA Performance Report',
      'executive-summary': 'Executive Summary Report',
      'her-analysis': 'Business Hours SLA Report'
    };
    
    const reportTitle = titleMap[reportType] || reportType.split('-').map(word => 
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
        columns = getPdfColumns('ticket-summary');
        break;
        
      case 'sla-performance':
        const slaData = await getSlaPerformanceData(whereClause, startDate, endDate);
        data = slaData.breachedTickets || [];
        summaryData = slaData.summary;
        columns = getPdfColumns('sla-performance');
        break;
        
      case 'executive-summary':
        const executiveData = await getExecutiveSummaryData(whereClause, startDate, endDate);
        data = executiveData.trends || [];
        summaryData = executiveData.summary;
        columns = getPdfColumns('executive-summary');
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
        data = industrialData.machineDowntime || [];
        summaryData = industrialData.summary;
        columns = getPdfColumns('industrial-data');
        break;
        
      case 'agent-productivity':
        const agentData = await getAgentProductivityData(whereClause, startDate, endDate);
        data = agentData.agents || [];
        summaryData = agentData.summary;
        columns = getPdfColumns('agent-productivity');
        break;
        
      case 'zone-performance':
        const zoneData = await getZonePerformanceData(whereClause, startDate, endDate);
        data = zoneData.zones || [];
        summaryData = zoneData.summary;
        columns = getPdfColumns('zone-performance');
        console.log('Zone performance data fetched:', { dataCount: data.length, summary: summaryData });
        break;
        
      case 'her-analysis':
        // HER Analysis uses the same data structure as the generateHerAnalysisReport
        const herTickets = await prisma.ticket.findMany({
          where: whereClause,
          include: {
            customer: true,
            assignedTo: true,
            zone: true,
            asset: true
          }
        });
        
        // HER calculation helper functions
        const BUSINESS_START_HOUR = 9;
        const BUSINESS_END_HOUR = 17;
        const BUSINESS_END_MINUTE = 30;
        const WORKING_DAYS = [1, 2, 3, 4, 5, 6];
        const SLA_HOURS_BY_PRIORITY: Record<string, number> = {
          'CRITICAL': 4, 'HIGH': 8, 'MEDIUM': 24, 'LOW': 48
        };
        
        const calculateBusinessHours = (startDate: Date, endDate: Date): number => {
          let businessHours = 0;
          let currentDate = new Date(startDate);
          while (currentDate < endDate) {
            const dayOfWeek = currentDate.getDay();
            if (WORKING_DAYS.includes(dayOfWeek)) {
              const dayStart = new Date(currentDate);
              dayStart.setHours(BUSINESS_START_HOUR, 0, 0, 0);
              const dayEnd = new Date(currentDate);
              dayEnd.setHours(BUSINESS_END_HOUR, BUSINESS_END_MINUTE, 0, 0);
              const periodStart = new Date(Math.max(currentDate.getTime(), dayStart.getTime()));
              const periodEnd = new Date(Math.min(endDate.getTime(), dayEnd.getTime()));
              if (periodStart < periodEnd) {
                businessHours += (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60);
              }
            }
            currentDate.setDate(currentDate.getDate() + 1);
            currentDate.setHours(0, 0, 0, 0);
          }
          return businessHours;
        };
        
        data = herTickets.map((ticket: any) => {
          const priority = ticket.priority || 'LOW';
          const herHours = SLA_HOURS_BY_PRIORITY[priority] || SLA_HOURS_BY_PRIORITY['LOW'];
          let businessHoursUsed = 0;
          let isHerBreached = false;
          let resolvedAt = null;
          
          if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
            businessHoursUsed = calculateBusinessHours(ticket.createdAt, ticket.updatedAt);
            isHerBreached = businessHoursUsed > herHours;
            resolvedAt = ticket.updatedAt;
          } else {
            businessHoursUsed = calculateBusinessHours(ticket.createdAt, new Date());
          }
          
          return {
            id: ticket.id,
            title: ticket.title,
            customer: ticket.customer?.companyName || 'Unknown',
            serialNo: ticket.asset?.serialNo || 'N/A',
            address: ticket.customer?.address || 'N/A',
            status: ticket.status,
            priority: ticket.priority,
            assignedTo: ticket.assignedTo?.name || 'Unassigned',
            createdAt: ticket.createdAt,
            zone: ticket.zone?.name || 'No Zone',
            herHours,
            businessHoursUsed: Math.round(businessHoursUsed * 100) / 100,
            isHerBreached: isHerBreached ? 'Yes' : 'No',
            resolvedAt: resolvedAt
          };
        });
        
        const herCompliantTickets = data.filter((t: any) => t.isHerBreached === 'No').length;
        const herBreachedTickets = data.filter((t: any) => t.isHerBreached === 'Yes').length;
        const complianceRate = data.length > 0 ? (herCompliantTickets / data.length) * 100 : 100;
        
        summaryData = {
          'Total Tickets': data.length,
          'HER Compliant': herCompliantTickets,
          'HER Breached': herBreachedTickets,
          'Compliance Rate': `${Math.round(complianceRate * 100) / 100}%`
        };
        
        columns = [
          { key: 'id', header: 'Ticket ID', width: 12 },
          { key: 'title', header: 'Title', width: 30 },
          { key: 'customer', header: 'Customer', width: 25 },
          { key: 'serialNo', header: 'Serial No', width: 18 },
          { key: 'address', header: 'Address', width: 30 },
          { key: 'status', header: 'Status', width: 15 },
          { key: 'priority', header: 'Priority', width: 12 },
          { key: 'assignedTo', header: 'Assigned To', width: 20 },
          { key: 'createdAt', header: 'Created', width: 20, format: (date: string) => new Date(date).toLocaleString() },
          { key: 'zone', header: 'Zone', width: 20 },
          { key: 'herHours', header: 'SLA Hours', width: 15 },
          { key: 'businessHoursUsed', header: 'Hours Used', width: 15 },
          { key: 'isHerBreached', header: 'Breached', width: 15 },
          { key: 'resolvedAt', header: 'Resolved', width: 20, format: (date: string) => date ? new Date(date).toLocaleString() : 'N/A' }
        ];
        console.log('HER Analysis data fetched:', { dataCount: data.length, summary: summaryData });
        break;
        
      default:
        console.error('Invalid report type:', reportType);
        return res.status(400).json({ error: 'Invalid report type' });
    }

    console.log(`Exporting ${reportType} as ${format}, data count: ${data.length}`);

    if (format.toLowerCase() === 'pdf') {
      // Generate PDF with summary and data
      await generatePdf(res, data, columns, reportTitle, filters, summaryData);
    } else if (format.toLowerCase() === 'excel' || format.toLowerCase() === 'xlsx') {
      // Generate Excel with enhanced formatting and summary data
      const excelColumns = getExcelColumns(reportType);
      console.log('Generating Excel with columns:', excelColumns.map(c => c.key));
      await generateExcel(res, data, excelColumns, reportTitle, filters, summaryData);
    } else {
      // Default to PDF export
      const pdfColumns = getPdfColumns(reportType);
      await generatePdf(res, data, pdfColumns, reportTitle, filters, summaryData);
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


// Helper functions to get report data without sending response
async function getTicketSummaryData(whereClause: any, startDate: Date, endDate: Date): Promise<TicketSummaryData> {
  const tickets = await prisma.ticket.findMany({
    where: whereClause,
    include: { 
      customer: true, 
      assignedTo: true,
      zone: true,
      asset: true,
      statusHistory: {
        orderBy: { changedAt: 'desc' }
      },
      feedbacks: true,
      rating: true,
      reports: true
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

  // Enhanced ticket data with all required fields
  const enhancedTickets = tickets.map((ticket: any) => {
    // Calculate response time (first response)
    let responseTime = 0;
    if (ticket.statusHistory && ticket.statusHistory.length > 0) {
      const firstResponse = ticket.statusHistory.find((h: any) => h.status !== 'OPEN');
      if (firstResponse) {
        responseTime = differenceInMinutes(new Date(firstResponse.changedAt), new Date(ticket.createdAt));
      }
    }

    // Calculate travel time using status history: (STARTED → REACHED) + (RESOLVED → COMPLETED)
    let travelTime = 0;
    if (ticket.statusHistory && ticket.statusHistory.length > 0) {
      const statusHistory = ticket.statusHistory;
      
      // Going travel time (ONSITE_VISIT_STARTED → ONSITE_VISIT_REACHED)
      const goingStart = statusHistory.find((h: any) => h.status === 'ONSITE_VISIT_STARTED');
      const goingEnd = statusHistory.find((h: any) => h.status === 'ONSITE_VISIT_REACHED');
      
      // Return travel time (ONSITE_VISIT_RESOLVED → ONSITE_VISIT_COMPLETED)
      const returnStart = statusHistory.find((h: any) => h.status === 'ONSITE_VISIT_RESOLVED');
      const returnEnd = statusHistory.find((h: any) => h.status === 'ONSITE_VISIT_COMPLETED');

      let totalTravelMinutes = 0;
      let hasValidTravel = false;

      // Add going travel time
      if (goingStart && goingEnd && goingStart.changedAt < goingEnd.changedAt) {
        const goingMinutes = differenceInMinutes(new Date(goingEnd.changedAt), new Date(goingStart.changedAt));
        if (goingMinutes > 0 && goingMinutes <= 120) { // Max 2 hours for one-way travel
          totalTravelMinutes += goingMinutes;
          hasValidTravel = true;
        }
      }

      // Add return travel time
      if (returnStart && returnEnd && returnStart.changedAt < returnEnd.changedAt) {
        const returnMinutes = differenceInMinutes(new Date(returnEnd.changedAt), new Date(returnStart.changedAt));
        if (returnMinutes > 0 && returnMinutes <= 120) { // Max 2 hours for one-way travel
          totalTravelMinutes += returnMinutes;
          hasValidTravel = true;
        }
      }

      // Only use if we have valid travel data and total is reasonable
      if (hasValidTravel && totalTravelMinutes <= 240) { // Max 4 hours total travel
        travelTime = totalTravelMinutes;
      }
    }

    // Calculate onsite working time using status history: ONSITE_VISIT_IN_PROGRESS → ONSITE_VISIT_RESOLVED
    let onsiteWorkingTime = 0;
    if (ticket.statusHistory && ticket.statusHistory.length > 0) {
      const statusHistory = ticket.statusHistory;
      
      const onsiteStart = statusHistory.find((h: any) => h.status === 'ONSITE_VISIT_IN_PROGRESS');
      const onsiteEnd = statusHistory.find((h: any) => h.status === 'ONSITE_VISIT_RESOLVED');
      
      if (onsiteStart && onsiteEnd && onsiteStart.changedAt < onsiteEnd.changedAt) {
        const workingMinutes = differenceInMinutes(new Date(onsiteEnd.changedAt), new Date(onsiteStart.changedAt));
        if (workingMinutes > 0 && workingMinutes <= 480) { // Max 8 hours for onsite work
          onsiteWorkingTime = workingMinutes;
        }
      }
    }

    // Calculate total resolution time
    let totalResolutionTime = 0;
    if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
      if (ticket.statusHistory && ticket.statusHistory.length > 0) {
        const resolutionHistory = ticket.statusHistory.find((h: any) => 
          h.status === 'RESOLVED' || h.status === 'CLOSED'
        );
        if (resolutionHistory) {
          totalResolutionTime = differenceInMinutes(new Date(resolutionHistory.changedAt), new Date(ticket.createdAt));
        }
      } else if (ticket.updatedAt && ticket.createdAt) {
        const timeDiff = differenceInMinutes(ticket.updatedAt, ticket.createdAt);
        if (timeDiff > 1) {
          totalResolutionTime = timeDiff;
        }
      }
    }

    // Calculate machine downtime (same as total resolution time for now)
    const machineDowntime = totalResolutionTime;

    // Calculate total response hours (from open to closed)
    const totalResponseHours = totalResolutionTime > 0 ? totalResolutionTime / 60 : 0;

    return {
      ...ticket,
      responseTime,
      travelTime,
      onsiteWorkingTime,
      totalResolutionTime,
      machineDowntime,
      totalResponseHours,
      callType: ticket.callType, // Use the actual database callType field
      reportsCount: ticket.reports ? ticket.reports.length : 0
    };
  });

  return {
    tickets: enhancedTickets,
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
  // Build zone filter - if zoneId is in whereClause, filter zones too
  const zoneWhere: any = {};
  if (whereClause.zoneId !== undefined) {
    if (typeof whereClause.zoneId === 'number' || typeof whereClause.zoneId === 'string') {
      zoneWhere.id = parseInt(whereClause.zoneId as string);
    } else if (typeof whereClause.zoneId === 'object' && whereClause.zoneId !== null) {
      if (Array.isArray((whereClause.zoneId as any).in)) {
        zoneWhere.id = { in: (whereClause.zoneId as any).in };
      }
    }
  }

  const zones = await prisma.serviceZone.findMany({
    where: zoneWhere,
    include: {
      tickets: { where: whereClause },
      customers: {
        include: {
          assets: true
        }
      },
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
      return sum + calculateBusinessHoursInMinutes(t.createdAt, t.updatedAt);
    }, 0);
    
    const avgResolutionTime = resolvedWithTime.length > 0 
      ? Math.round(totalResolutionTime / resolvedWithTime.length)
      : 0;

    // Calculate first response time (simplified)
    const ticketsWithResponse = tickets.filter((t: any) => t.updatedAt !== t.createdAt);
    const avgFirstResponseTime = ticketsWithResponse.length > 0
      ? Math.round(ticketsWithResponse.reduce((sum: number, t: any) => {
          return sum + calculateBusinessHoursInMinutes(t.createdAt, t.updatedAt);
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

  // Build additional filters for tickets based on customerId and assetId
  const ticketFilters: any = {
    ...whereClause,
    OR: [
      { status: { in: ['OPEN', 'IN_PROGRESS', 'ASSIGNED'] } },
      { 
        status: { in: ['RESOLVED', 'CLOSED'] },
        updatedAt: { gte: startDate, lte: endDate }
      }
    ]
  };

  // Add customer filter if specified
  if (filters?.customerId) {
    ticketFilters.customerId = parseInt(filters.customerId);
  }

  // Add asset filter if specified
  if (filters?.assetId) {
    ticketFilters.assetId = parseInt(filters.assetId);
  }

  // Get machine downtime data
  const ticketsWithDowntime = await prisma.ticket.findMany({
    where: ticketFilters,
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
      // For resolved tickets, calculate the time between creation and resolution (business hours)
      downtimeMinutes = calculateBusinessHoursInMinutes(ticket.createdAt, ticket.updatedAt);
    } else {
      // For open tickets, calculate time from creation to now (business hours)
      downtimeMinutes = calculateBusinessHoursInMinutes(ticket.createdAt, new Date());
    }
    
    // Format downtime in hours and minutes
    const downtimeHours = Math.floor(downtimeMinutes / 60);
    const remainingMinutes = downtimeMinutes % 60;
    const downtimeFormatted = downtimeMinutes > 0 
      ? `${downtimeHours}h ${remainingMinutes}m`
      : '0h 0m';
    
    // Determine assigned technician (zone user or service person)
    let assignedTechnician = 'Unassigned';
    if (ticket.assignedTo) {
      // Check if it's a zone user or service person and format accordingly
      const role = ticket.assignedTo.role;
      const name = ticket.assignedTo.name || ticket.assignedTo.email;
      if (role === 'ZONE_USER') {
        assignedTechnician = `${name} (Zone User)`;
      } else if (role === 'SERVICE_PERSON') {
        assignedTechnician = `${name} (Service Person)`;
      } else {
        assignedTechnician = name;
      }
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
      downtimeFormatted,
      assignedTo: ticket.assignedTo?.name || 'Unassigned',
      assignedTechnician
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
  }).map((machine: any) => ({
    ...machine,
    totalDowntimeHours: Math.round((machine.totalDowntimeMinutes / 60) * 100) / 100,
    avgDowntimeHours: machine.incidents > 0 ? Math.round((machine.totalDowntimeMinutes / machine.incidents / 60) * 100) / 100 : 0
  }));

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
          ) / filteredMachineDowntime.length / 60 * 100) / 100
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

// HER (Hours of Expected Resolution) Analysis Report
async function generateHerAnalysisReport(res: Response, whereClause: any, startDate: Date, endDate: Date) {
  try {
    // Get all tickets in the date range
    const tickets = await prisma.ticket.findMany({
      where: whereClause,
      include: {
        customer: true,
        assignedTo: true,
        zone: true,
        asset: true
      }
    });

    // Business hours configuration
    const BUSINESS_START_HOUR = 9; // 9:00 AM
    const BUSINESS_END_HOUR = 17; // 5:00 PM (17:00)
    const BUSINESS_END_MINUTE = 30; // 5:30 PM
    const WORKING_DAYS = [1, 2, 3, 4, 5, 6]; // Monday to Saturday (0 = Sunday)

    // SLA hours by priority (in business hours)
    const SLA_HOURS_BY_PRIORITY: Record<string, number> = {
      'CRITICAL': 4,   // 4 business hours
      'HIGH': 8,       // 8 business hours  
      'MEDIUM': 24,    // 24 business hours (3 business days)
      'LOW': 48        // 48 business hours (6 business days)
    };

    // Helper function to calculate business hours between two dates
    function calculateBusinessHours(startDate: Date, endDate: Date): number {
      let businessHours = 0;
      let currentDate = new Date(startDate);
      
      while (currentDate < endDate) {
        const dayOfWeek = currentDate.getDay();
        
        // Skip Sundays (0)
        if (WORKING_DAYS.includes(dayOfWeek)) {
          const dayStart = new Date(currentDate);
          dayStart.setHours(BUSINESS_START_HOUR, 0, 0, 0);
          
          const dayEnd = new Date(currentDate);
          dayEnd.setHours(BUSINESS_END_HOUR, BUSINESS_END_MINUTE, 0, 0);
          
          // Calculate overlap with business hours for this day
          const periodStart = new Date(Math.max(currentDate.getTime(), dayStart.getTime()));
          const periodEnd = new Date(Math.min(endDate.getTime(), dayEnd.getTime()));
          
          if (periodStart < periodEnd) {
            const hoursThisDay = (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60);
            businessHours += hoursThisDay;
          }
        }
        
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(0, 0, 0, 0);
      }
      
      return businessHours;
    }

    // Helper function to calculate HER deadline from ticket creation
    function calculateHerDeadline(createdAt: Date, priority: string): Date {
      const slaHours = SLA_HOURS_BY_PRIORITY[priority] || SLA_HOURS_BY_PRIORITY['LOW'];
      let remainingHours = slaHours;
      let currentDate = new Date(createdAt);
      
      // If ticket created outside business hours, start from next business day
      const dayOfWeek = currentDate.getDay();
      const hour = currentDate.getHours();
      const minute = currentDate.getMinutes();
      
      if (!WORKING_DAYS.includes(dayOfWeek) || 
          hour < BUSINESS_START_HOUR || 
          (hour > BUSINESS_END_HOUR) || 
          (hour === BUSINESS_END_HOUR && minute > BUSINESS_END_MINUTE)) {
        // Move to next business day at 9 AM
        do {
          currentDate.setDate(currentDate.getDate() + 1);
          currentDate.setHours(BUSINESS_START_HOUR, 0, 0, 0);
        } while (!WORKING_DAYS.includes(currentDate.getDay()));
      }
      
      // Add business hours to find deadline
      while (remainingHours > 0) {
        const dayOfWeek = currentDate.getDay();
        
        if (WORKING_DAYS.includes(dayOfWeek)) {
          const dayStart = new Date(currentDate);
          dayStart.setHours(BUSINESS_START_HOUR, 0, 0, 0);
          
          const dayEnd = new Date(currentDate);
          dayEnd.setHours(BUSINESS_END_HOUR, BUSINESS_END_MINUTE, 0, 0);
          
          const availableHoursToday = Math.max(0, (dayEnd.getTime() - Math.max(currentDate.getTime(), dayStart.getTime())) / (1000 * 60 * 60));
          
          if (remainingHours <= availableHoursToday) {
            // Deadline is today
            currentDate.setTime(currentDate.getTime() + (remainingHours * 60 * 60 * 1000));
            break;
          } else {
            // Use all available hours today and continue tomorrow
            remainingHours -= availableHoursToday;
          }
        }
        
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(BUSINESS_START_HOUR, 0, 0, 0);
      }
      
      return currentDate;
    }

    // Process each ticket for HER analysis
    const herTickets = tickets.map((ticket: any) => {
      const priority = ticket.priority || 'LOW';
      const herHours = SLA_HOURS_BY_PRIORITY[priority] || SLA_HOURS_BY_PRIORITY['LOW'];
      const herDeadline = calculateHerDeadline(ticket.createdAt, priority);
      
      let actualResolutionHours: number | undefined;
      let businessHoursUsed = 0;
      let isHerBreached = false;
      
      if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
        // Calculate actual resolution time in business hours
        businessHoursUsed = calculateBusinessHours(ticket.createdAt, ticket.updatedAt);
        actualResolutionHours = businessHoursUsed;
        isHerBreached = businessHoursUsed > herHours;
      } else {
        // For open tickets, calculate time used so far
        businessHoursUsed = calculateBusinessHours(ticket.createdAt, new Date());
        isHerBreached = new Date() > herDeadline;
      }
      
      return {
        id: ticket.id,
        title: ticket.title,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: ticket.createdAt.toISOString(),
        resolvedAt: (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') ? ticket.updatedAt.toISOString() : undefined,
        slaDueAt: herDeadline.toISOString(),
        herHours,
        actualResolutionHours,
        isHerBreached,
        businessHoursUsed: Math.round(businessHoursUsed * 100) / 100,
        customer: ticket.customer?.companyName || 'Unknown',
        assignedTo: ticket.assignedTo?.name || 'Unassigned',
        zone: ticket.zone?.name || 'No Zone'
      };
    });

    // Calculate summary statistics
    const totalTickets = herTickets.length;
    const herCompliantTickets = herTickets.filter(t => !t.isHerBreached).length;
    const herBreachedTickets = herTickets.filter(t => t.isHerBreached).length;
    const complianceRate = totalTickets > 0 ? (herCompliantTickets / totalTickets) * 100 : 100;
    
    const averageHerHours = totalTickets > 0 
      ? herTickets.reduce((sum, t) => sum + t.herHours, 0) / totalTickets 
      : 0;
    
    const resolvedTickets = herTickets.filter(t => t.actualResolutionHours !== undefined);
    const averageActualHours = resolvedTickets.length > 0
      ? resolvedTickets.reduce((sum, t) => sum + (t.actualResolutionHours || 0), 0) / resolvedTickets.length
      : 0;

    // Calculate priority breakdown
    const priorityBreakdown: Record<string, any> = {};
    Object.keys(SLA_HOURS_BY_PRIORITY).forEach(priority => {
      const priorityTickets = herTickets.filter(t => t.priority === priority);
      const priorityCompliant = priorityTickets.filter(t => !t.isHerBreached);
      const priorityBreached = priorityTickets.filter(t => t.isHerBreached);
      
      priorityBreakdown[priority] = {
        total: priorityTickets.length,
        compliant: priorityCompliant.length,
        breached: priorityBreached.length,
        complianceRate: priorityTickets.length > 0 ? (priorityCompliant.length / priorityTickets.length) * 100 : 100
      };
    });

    res.json({
      herAnalysis: {
        tickets: herTickets,
        summary: {
          totalTickets,
          herCompliantTickets,
          herBreachedTickets,
          complianceRate: Math.round(complianceRate * 100) / 100,
          averageHerHours: Math.round(averageHerHours * 100) / 100,
          averageActualHours: Math.round(averageActualHours * 100) / 100
        },
        priorityBreakdown
      }
    });
  } catch (error) {
    console.error('Error generating HER analysis:', error);
    res.status(500).json({ error: 'Failed to generate HER analysis' });
  }
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
      case 'sla-performance':
        return await generateSlaPerformanceReport(res, whereClause, startDate, endDate);
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
      case 'her-analysis':
        return await generateHerAnalysisReport(res, whereClause, startDate, endDate);
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
    const { from, to, reportType, format = 'pdf', zoneId, ...otherFilters } = req.query as unknown as ReportFilters & { format: string };
    const user = (req as any).user;
    
    // Validate required parameters
    if (!reportType) {
      return res.status(400).json({ error: 'Report type is required' });
    }
    
    // Validate report type
    const validReportTypes = ['ticket-summary', 'sla-performance', 'executive-summary', 'customer-satisfaction', 'industrial-data', 'agent-productivity', 'zone-performance', 'her-analysis'];
    if (!validReportTypes.includes(reportType)) {
      return res.status(400).json({ error: 'Invalid report type or report type does not support export' });
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
    
    // Custom title mapping for better report names
    const titleMap: { [key: string]: string } = {
      'industrial-data': 'Machine Report',
      'ticket-summary': 'Ticket Summary Report',
      'customer-satisfaction': 'Customer Satisfaction Report',
      'zone-performance': 'Zone Performance Report',
      'agent-productivity': 'Performance Report of All Service Persons and Zone Users',
      'sla-performance': 'SLA Performance Report',
      'executive-summary': 'Executive Summary Report',
      'her-analysis': 'Business Hours SLA Report'
    };
    
    const reportTitle = titleMap[reportType] || reportType.split('-').map(word => 
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
      case 'ticket-summary':
        const ticketData = await getTicketSummaryData(whereClause, startDate, endDate);
        data = ticketData.tickets || [];
        summaryData = ticketData.summary;
        columns = getPdfColumns('ticket-summary');
        break;
        
      case 'sla-performance':
        const slaData = await getSlaPerformanceData(whereClause, startDate, endDate);
        data = slaData.breachedTickets || [];
        summaryData = slaData.summary;
        columns = getPdfColumns('sla-performance');
        break;
        
      case 'executive-summary':
        const executiveData = await getExecutiveSummaryData(whereClause, startDate, endDate);
        data = executiveData.trends || [];
        summaryData = executiveData.summary;
        columns = getPdfColumns('executive-summary');
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
        data = industrialData.machineDowntime || [];
        summaryData = industrialData.summary;
        columns = getPdfColumns('industrial-data');
        break;
        
      case 'agent-productivity':
        const agentData = await getAgentProductivityData(whereClause, startDate, endDate);
        data = agentData.agents || [];
        summaryData = agentData.summary;
        columns = getPdfColumns('agent-productivity');
        break;
        
      case 'zone-performance':
        const zoneData = await getZonePerformanceData(whereClause, startDate, endDate);
        data = zoneData.zones || [];
        summaryData = zoneData.summary;
        columns = getPdfColumns('zone-performance');
        break;
        
      case 'her-analysis':
        // HER Analysis uses the same data structure as the generateHerAnalysisReport
        const herTickets = await prisma.ticket.findMany({
          where: whereClause,
          include: {
            customer: true,
            assignedTo: true,
            zone: true,
            asset: true
          }
        });
        
        // HER calculation helper functions
        const BUSINESS_START_HOUR = 9;
        const BUSINESS_END_HOUR = 17;
        const BUSINESS_END_MINUTE = 30;
        const WORKING_DAYS = [1, 2, 3, 4, 5, 6];
        const SLA_HOURS_BY_PRIORITY: Record<string, number> = {
          'CRITICAL': 4, 'HIGH': 8, 'MEDIUM': 24, 'LOW': 48
        };
        
        const calculateBusinessHours = (startDate: Date, endDate: Date): number => {
          let businessHours = 0;
          let currentDate = new Date(startDate);
          while (currentDate < endDate) {
            const dayOfWeek = currentDate.getDay();
            if (WORKING_DAYS.includes(dayOfWeek)) {
              const dayStart = new Date(currentDate);
              dayStart.setHours(BUSINESS_START_HOUR, 0, 0, 0);
              const dayEnd = new Date(currentDate);
              dayEnd.setHours(BUSINESS_END_HOUR, BUSINESS_END_MINUTE, 0, 0);
              const periodStart = new Date(Math.max(currentDate.getTime(), dayStart.getTime()));
              const periodEnd = new Date(Math.min(endDate.getTime(), dayEnd.getTime()));
              if (periodStart < periodEnd) {
                businessHours += (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60);
              }
            }
            currentDate.setDate(currentDate.getDate() + 1);
            currentDate.setHours(0, 0, 0, 0);
          }
          return businessHours;
        };
        
        data = herTickets.map((ticket: any) => {
          const priority = ticket.priority || 'LOW';
          const herHours = SLA_HOURS_BY_PRIORITY[priority] || SLA_HOURS_BY_PRIORITY['LOW'];
          let businessHoursUsed = 0;
          let isHerBreached = false;
          let resolvedAt = null;
          
          if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
            businessHoursUsed = calculateBusinessHours(ticket.createdAt, ticket.updatedAt);
            isHerBreached = businessHoursUsed > herHours;
            resolvedAt = ticket.updatedAt;
          } else {
            businessHoursUsed = calculateBusinessHours(ticket.createdAt, new Date());
          }
          
          return {
            id: ticket.id,
            title: ticket.title,
            customer: ticket.customer?.companyName || 'Unknown',
            serialNo: ticket.asset?.serialNo || 'N/A',
            address: ticket.customer?.address || 'N/A',
            status: ticket.status,
            priority: ticket.priority,
            assignedTo: ticket.assignedTo?.name || 'Unassigned',
            createdAt: ticket.createdAt,
            zone: ticket.zone?.name || 'No Zone',
            herHours,
            businessHoursUsed: Math.round(businessHoursUsed * 100) / 100,
            isHerBreached: isHerBreached ? 'Yes' : 'No',
            resolvedAt: resolvedAt
          };
        });
        
        const herCompliantTickets = data.filter((t: any) => t.isHerBreached === 'No').length;
        const herBreachedTickets = data.filter((t: any) => t.isHerBreached === 'Yes').length;
        const complianceRate = data.length > 0 ? (herCompliantTickets / data.length) * 100 : 100;
        
        summaryData = {
          'Total Tickets': data.length,
          'HER Compliant': herCompliantTickets,
          'HER Breached': herBreachedTickets,
          'Compliance Rate': `${Math.round(complianceRate * 100) / 100}%`
        };
        
        columns = [
          { key: 'id', header: 'Ticket ID', width: 12 },
          { key: 'title', header: 'Title', width: 30 },
          { key: 'customer', header: 'Customer', width: 25 },
          { key: 'serialNo', header: 'Serial No', width: 18 },
          { key: 'address', header: 'Address', width: 30 },
          { key: 'status', header: 'Status', width: 15 },
          { key: 'priority', header: 'Priority', width: 12 },
          { key: 'assignedTo', header: 'Assigned To', width: 20 },
          { key: 'createdAt', header: 'Created', width: 20, format: (date: string) => new Date(date).toLocaleString() },
          { key: 'zone', header: 'Zone', width: 20 },
          { key: 'herHours', header: 'SLA Hours', width: 15 },
          { key: 'businessHoursUsed', header: 'Hours Used', width: 15 },
          { key: 'isHerBreached', header: 'Breached', width: 15 },
          { key: 'resolvedAt', header: 'Resolved', width: 20, format: (date: string) => date ? new Date(date).toLocaleString() : 'N/A' }
        ];
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid report type for export.' });
    }

    if (format.toLowerCase() === 'pdf') {
      await generatePdf(res, data, columns, `Zone ${reportTitle}`, filters, summaryData);
    } else if (format.toLowerCase() === 'excel' || format.toLowerCase() === 'xlsx') {
      // Generate Excel with enhanced formatting and summary data
      const excelColumns = getExcelColumns(reportType);
      await generateExcel(res, data, excelColumns, `Zone ${reportTitle}`, filters, summaryData);
    } else {
      // Default to PDF export
      const pdfColumns = getPdfColumns(reportType);
      await generatePdf(res, data, pdfColumns, `Zone ${reportTitle}`, filters, summaryData);
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