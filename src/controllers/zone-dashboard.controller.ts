import { Request, Response } from 'express';
import { PrismaClient, TicketStatus, Priority, Prisma, Ticket } from '@prisma/client';
import { JwtPayload } from '../middleware/auth.middleware';
import { serializeBigInts } from '../utils/bigint';

// Type for raw query results
interface QueryResult<T = any> {
  [key: string]: T;
}

// Extend the Express Request type to include user
interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

const prisma = new PrismaClient();

interface TicketCount {
  status: string;
  _count: number;
}

interface ServicePersonZoneWithCount {
  user: any;
  _count: {
    assignedTickets: number;
  };
}

interface TopIssue {
  priority: Priority | null;
  _count: number;
}

// Helper functions for zone metrics

async function calculateTechnicianEfficiency(zoneId: number): Promise<number> {
  try {
    const result = await prisma.$queryRaw<Array<{ avg_efficiency: number | null }>>`
      SELECT AVG(efficiency) as avg_efficiency
      FROM (
        SELECT 
          t.assigned_to_id,
          COUNT(DISTINCT CASE WHEN t.status = 'RESOLVED' THEN t.id END) * 100.0 / 
          NULLIF(COUNT(DISTINCT t.id), 0) as efficiency
        FROM "Ticket" t
        JOIN "Customer" c ON t."customerId" = c.id
        WHERE c."serviceZoneId" = ${zoneId}
        AND t."createdAt" >= NOW() - INTERVAL '30 days'
        GROUP BY t.assigned_to_id
      ) as tech_efficiency
    `;
    return result[0]?.avg_efficiency || 0;
  } catch (error) {
    console.error('Error calculating technician efficiency:', error);
    return 0;
  }
}

async function calculateAverageTravelTime(zoneId: number): Promise<number> {
  try {
    const result = await prisma.$queryRaw<Array<{ avg_travel_time: number | null }>>`
      SELECT AVG("travelTime") as avg_travel_time
      FROM "ServiceVisit" sv
      JOIN "Ticket" t ON sv."ticketId" = t.id
      JOIN "Customer" c ON t."customerId" = c.id
      WHERE c."serviceZoneId" = ${zoneId}
      AND sv."startTime" >= NOW() - INTERVAL '30 days'
    `;
    return result[0]?.avg_travel_time || 0;
  } catch (error) {
    console.error('Error calculating average travel time:', error);
    return 0;
  }
}

async function calculatePartsAvailability(zoneId: number): Promise<number> {
  try {
    const result = await prisma.$queryRaw<Array<{ parts_availability: number | null }>>`
      SELECT 
        COUNT(DISTINCT CASE WHEN "partsAvailable" = true THEN t.id END) * 100.0 /
        NULLIF(COUNT(DISTINCT t.id), 0) as parts_availability
      FROM "ServiceVisit" sv
      JOIN "Ticket" t ON sv."ticketId" = t.id
      JOIN "Customer" c ON t."customerId" = c.id
      WHERE c."serviceZoneId" = ${zoneId}
      AND sv."startTime" >= NOW() - INTERVAL '30 days'
    `;
    return result[0]?.parts_availability || 0;
  } catch (error) {
    console.error('Error calculating parts availability:', error);
    return 0;
  }
}

async function calculateEquipmentUptime(zoneId: number): Promise<number> {
  try {
    const result = await prisma.$queryRaw<Array<{ avg_uptime: number | null }>>`
      SELECT AVG("uptimePercentage") as avg_uptime
      FROM "Asset" a
      JOIN "Customer" c ON a."customerId" = c.id
      WHERE c."serviceZoneId" = ${zoneId}
    `;
    return result[0]?.avg_uptime || 0;
  } catch (error) {
    console.error('Error calculating equipment uptime:', error);
    return 0;
  }
}

async function calculateFirstCallResolutionRate(zoneId: number): Promise<number> {
  try {
    const result = await prisma.$queryRaw<Array<{ first_call_resolution_rate: number | null }>>`
      WITH resolved_tickets AS (
        SELECT 
          t.id,
          COUNT(DISTINCT CASE WHEN n.content ILIKE '%first time fix%' THEN n.id END) > 0 as first_time_fix
        FROM "Ticket" t
        JOIN "Customer" c ON t."customerId" = c.id
        LEFT JOIN "TicketNote" n ON t.id = n."ticketId"
        WHERE c."serviceZoneId" = ${zoneId}
        AND t.status = 'RESOLVED'
        AND t."createdAt" >= NOW() - INTERVAL '30 days'
        GROUP BY t.id
      )
      SELECT 
        COUNT(CASE WHEN first_time_fix = true THEN id END) * 100.0 /
        NULLIF(COUNT(*), 0) as first_call_resolution_rate
      FROM resolved_tickets
    `;
    return result[0]?.first_call_resolution_rate || 0;
  } catch (error) {
    console.error('Error calculating first call resolution rate:', error);
    return 0;
  }
}

async function calculateCustomerSatisfactionScore(zoneId: number): Promise<number> {
  try {
    const result = await prisma.$queryRaw<Array<{ avg_satisfaction_score: number | null }>>`
      SELECT AVG("rating") as avg_satisfaction_score
      FROM "ServiceFeedback" sf
      JOIN "Ticket" t ON sf."ticketId" = t.id
      JOIN "Customer" c ON t."customerId" = c.id
      WHERE c."serviceZoneId" = ${zoneId}
      AND sf."createdAt" >= NOW() - INTERVAL '30 days'
    `;
    // Convert to percentage (assuming rating is 1-5 scale)
    const score = result[0]?.avg_satisfaction_score;
    return score ? (Number(score) / 5) * 100 : 0;
  } catch (error) {
    console.error('Error calculating customer satisfaction score:', error);
    return 0;
  }
}

export const getZoneDashboardData = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // Get the zone this user is assigned to (either through customer or direct assignment)
    const userWithZone = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        customer: { include: { serviceZone: true } },
        serviceZones: { include: { serviceZone: true }, take: 1 }
      }
    });
    
    if (!userWithZone) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const zone = userWithZone.serviceZones?.[0]?.serviceZone || userWithZone.customer?.serviceZone;
    
    if (!zone) {
      return res.status(404).json({ error: 'No service zone found for this user' });
    }
    
    // Calculate all metrics in parallel
    const [
      technicianEfficiency,
      avgTravelTime,
      partsAvailability,
      equipmentUptime,
      firstCallResolutionRate,
      customerSatisfactionScore
    ] = await Promise.all([
      calculateTechnicianEfficiency(zone.id),
      calculateAverageTravelTime(zone.id),
      calculatePartsAvailability(zone.id),
      calculateEquipmentUptime(zone.id),
      calculateFirstCallResolutionRate(zone.id),
      calculateCustomerSatisfactionScore(zone.id)
    ]);
    
    // Get ticket counts by status
    const ticketCounts = await prisma.ticket.groupBy({
      by: ['status'],
      where: {
        zoneId: zone.id,
        OR: [
          { status: 'OPEN' },
          { status: 'IN_PROGRESS' },
          { status: 'IN_PROCESS' as any }, // Handle both IN_PROCESS and IN_PROGRESS
          { status: 'RESOLVED' }
        ]
      },
      _count: true
    });
    
    const openTickets = ticketCounts.find(t => t.status === 'OPEN' as TicketStatus)?._count || 0;
    // Handle both 'IN_PROGRESS' and 'IN_PROCESS' statuses
    const inProgressTickets = 
      (ticketCounts.find(t => t.status === 'IN_PROGRESS' as TicketStatus)?._count || 0) +
      (ticketCounts.find(t => t.status === 'IN_PROCESS' as any)?._count || 0);
    
    // Get resolved tickets for trends
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const resolvedTickets = await prisma.ticket.findMany({
      where: {
        customer: { serviceZoneId: zone.id },
        status: 'RESOLVED' as TicketStatus,
        updatedAt: { gte: thirtyDaysAgo }
      },
      orderBy: { updatedAt: 'asc' },
      include: {
        customer: true,
        assignedTo: true
      }
    });
    
    // Calculate trends
    const resolvedTicketsData = resolvedTickets.map(ticket => ({
      date: ticket.updatedAt.toISOString().split('T')[0],
      count: 1
    }));
    
    // Group by date
    const ticketsByDate = resolvedTicketsData.reduce<Record<string, number>>((acc, { date }) => {
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});
    
    // Format for chart
    const resolvedTicketsTrend = Object.entries(ticketsByDate).map(([date, count]) => ({
      date,
      count: count as number
    }));
    
    // Get zone technicians
    const zoneTechnicians = await prisma.user.findMany({
      where: {
        serviceZones: {
          some: {
            serviceZoneId: zone.id
          }
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        _count: {
          select: {
            assignedTickets: true
          }
        }
      },
      take: 10
    });

    // Get recent activities
    const recentActivities = await prisma.ticket.findMany({
      where: {
        customer: { serviceZoneId: zone.id },
        updatedAt: { gte: thirtyDaysAgo }
      },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        updatedAt: true,
        assignedTo: {
          select: { name: true }
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: 10
    });

    // Get top issues
    const topIssues = await prisma.ticket.groupBy({
      by: ['title'],
      where: {
        customer: { serviceZoneId: zone.id },
        status: 'RESOLVED' as TicketStatus,
        updatedAt: { gte: thirtyDaysAgo }
      },
      _count: {
        _all: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      },
      take: 5
    });
    
    // Format response with comprehensive data like admin dashboard
    const response = {
      zone: {
        id: zone.id,
        name: zone.name,
        description: zone.description || '',
        totalCustomers: await prisma.customer.count({ where: { serviceZoneId: zone.id } }),
        totalTechnicians: zoneTechnicians.length,
        totalAssets: await prisma.asset.count({ 
          where: { customer: { serviceZoneId: zone.id } } 
        })
      },
      stats: {
        openTickets: { count: openTickets, change: 0 },
        unassignedTickets: { 
          count: await prisma.ticket.count({ 
            where: { 
              customer: { serviceZoneId: zone.id },
              assignedToId: null,
              status: { in: ['OPEN', 'IN_PROGRESS'] }
            } 
          }), 
          critical: false 
        },
        inProgressTickets: { count: inProgressTickets, change: 0 },
        avgResponseTime: { hours: 2, minutes: 30, change: -5, isPositive: true },
        avgResolutionTime: { days: 1, hours: 4, change: -10, isPositive: true },
        avgDowntime: { hours: 0, minutes: 45, change: -15, isPositive: true },
        monthlyTickets: { count: resolvedTickets.length, change: 8 },
        activeMachines: { 
          count: await prisma.asset.count({ 
            where: { 
              customer: { serviceZoneId: zone.id },
              status: 'ACTIVE'
            } 
          }), 
          change: 2 
        }
      },
      metrics: {
        openTickets,
        inProgressTickets,
        resolvedTickets: resolvedTickets.length,
        technicianEfficiency: technicianEfficiency || 0,
        avgTravelTime: avgTravelTime || 0,
        partsAvailability: partsAvailability || 0,
        equipmentUptime: equipmentUptime || 0,
        firstCallResolutionRate: firstCallResolutionRate || 0,
        customerSatisfactionScore: (customerSatisfactionScore || 0) / 20, // Convert to 5.0 scale
        avgResponseTime: 2.5,
        avgResolutionTime: 28
      },
      trends: {
        resolvedTickets: resolvedTicketsTrend
      },
      topIssues: topIssues.map(issue => ({
        title: issue.title,
        count: issue._count._all,
        priority: 'MEDIUM',
        avgResolutionTime: 24
      })),
      technicians: zoneTechnicians.map(tech => ({
        id: tech.id,
        name: tech.name || 'Unknown',
        activeTickets: tech._count.assignedTickets,
        efficiency: Math.floor(Math.random() * 30) + 70, // 70-100%
        rating: Math.floor(Math.random() * 15) / 10 + 4.0 // 4.0-5.5
      })),
      recentActivities: recentActivities.map(activity => ({
        id: activity.id,
        type: 'ticket_update',
        description: `${activity.title} - ${activity.status}`,
        timestamp: activity.updatedAt.toISOString(),
        priority: activity.priority,
        technician: activity.assignedTo?.name
      }))
    };
    
    return res.json(serializeBigInts(response));
  } catch (error) {
    console.error('Error getting zone dashboard data:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Extend JwtPayload to include zoneId
interface ExtendedJwtPayload extends JwtPayload {
  zoneId?: string | number;
}

// Get FSA (Field Service Analytics) data
export const getFSAData = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user as ExtendedJwtPayload;
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get zone ID from request params first, then fall back to user's zone ID
    const zoneId = Number(req.params.zoneId) || Number(user.zoneId);
    if (!zoneId || isNaN(zoneId)) {
      return res.status(400).json({ message: 'Zone ID is required and must be a number' });
    }

    console.log(`[FSA] Fetching data for zone ${zoneId}`);
    
    // Calculate all metrics in parallel
    const [
      efficiency,
      travelTime,
      partsAvailability,
      firstCallResolution,
      serviceReports,
      efficiencyTrend,
      serviceDistribution
    ] = await Promise.all([
      calculateTechnicianEfficiency(zoneId).catch(e => {
        console.error('Error in calculateTechnicianEfficiency:', e);
        return 0;
      }),
      calculateAverageTravelTime(zoneId).catch(e => {
        console.error('Error in calculateAverageTravelTime:', e);
        return 0;
      }),
      calculatePartsAvailability(zoneId).catch(e => {
        console.error('Error in calculatePartsAvailability:', e);
        return 0;
      }),
      calculateFirstCallResolutionRate(zoneId).catch(e => {
        console.error('Error in calculateFirstCallResolutionRate:', e);
        return 0;
      }),
      getRecentServiceReports(zoneId).catch(e => {
        console.error('Error in getRecentServiceReports:', e);
        return [];
      }),
      getEfficiencyTrend(zoneId).catch(e => {
        console.error('Error in getEfficiencyTrend:', e);
        return [];
      }),
      getServiceDistribution(zoneId).catch(e => {
        console.error('Error in getServiceDistribution:', e);
        return [];
      })
    ]);

    const responseData = {
      kpis: {
        efficiency: Math.round(efficiency * 10) / 10, // 1 decimal place
        travelTime: Math.round(travelTime * 10) / 10,
        partsAvailability: Math.round(partsAvailability * 10) / 10,
        firstCallResolution: Math.round(firstCallResolution * 10) / 10,
      },
      serviceReports,
      efficiencyTrend,
      serviceDistribution
    };

    console.log('[FSA] Response data:', JSON.stringify(responseData, null, 2));
    res.json(serializeBigInts(responseData));
  } catch (error: any) {
    console.error('Error fetching FSA data:', error);
    res.status(500).json({ 
      message: 'Error fetching FSA data', 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
};

// Helper function to get recent service reports
async function getRecentServiceReports(zoneId: number) {
  return await prisma.ticket.findMany({
    where: { 
      customer: { 
        serviceZone: { id: zoneId }
      },
      status: { in: ['CLOSED', 'RESOLVED'] }
    },
    select: {
      id: true,
      title: true,
      assignedTo: {
        select: { name: true }
      },
      status: true,
      priority: true,
      createdAt: true,
      updatedAt: true,
      customer: {
        select: { 
          companyName: true,
          address: true
        }
      },
      _count: true
    },
    orderBy: { updatedAt: 'desc' },
    take: 10
  });
}

// Helper function to get efficiency trend data
async function getEfficiencyTrend(zoneId: number) {
  const result = await prisma.$queryRaw<Array<{ month: string; efficiency: string }>>`
    SELECT 
      TO_CHAR(t."updatedAt", 'Mon') as month,
      AVG(CASE 
        WHEN t.status = 'CLOSED' AND t."actualResolutionTime" IS NOT NULL 
        THEN 100 
        ELSE 0 
      END) as efficiency
    FROM "Ticket" t
    JOIN "Customer" c ON t."customerId" = c.id
    WHERE c."serviceZoneId" = ${zoneId}
      AND t."updatedAt" >= NOW() - INTERVAL '6 months'
      AND t.status IN ('CLOSED', 'RESOLVED')
    GROUP BY TO_CHAR(t."updatedAt", 'Mon'), EXTRACT(MONTH FROM t."updatedAt")
    ORDER BY EXTRACT(MONTH FROM t."updatedAt")
  `;

  return result.map((r: any) => ({
    month: r.month,
    efficiency: parseFloat(r.efficiency) || 0
  }));
}

// Helper function to get service distribution
async function getServiceDistribution(zoneId: number) {
  const result = await prisma.ticket.groupBy({
    by: ['title'],
    where: {
      customer: { 
        serviceZone: { id: zoneId }
      },
      status: { in: ['CLOSED', 'RESOLVED'] },
      title: { not: '' }
    },
    _count: true
  });

  const total = result.reduce((sum, item) => sum + (item._count as number || 0), 0);
  
  return result.map((item) => ({
    name: (item.title as string) || 'Other',
    value: total > 0 ? Math.round(((item._count as number || 0) / total) * 100) : 0
  }));
}
