import { Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { JwtPayload } from '../middleware/auth.middleware';
import { serializeBigInts } from '../utils/bigint';

// Custom type definitions to replace problematic Prisma exports
type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'IN_PROCESS' | 'RESOLVED' | 'CLOSED' | 'CANCELLED';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface Ticket {
  id: number;
  title: string;
  description: string;
  status: TicketStatus;
  priority: Priority;
  customerId: number;
  contactId: number;
  assetId: number;
  ownerId: number;
  subOwnerId?: number;
  createdById: number;
  createdAt: Date;
  updatedAt: Date;
  assignedToId?: number;
  zoneId: number;
  dueDate?: Date;
  estimatedResolutionTime?: number;
  actualResolutionTime?: number;
  resolutionSummary?: string;
  isCritical: boolean;
  isEscalated: boolean;
  escalatedAt?: Date;
  escalatedBy?: number;
  escalatedReason?: string;
  lastStatusChange?: Date;
  timeInStatus?: number;
  totalTimeOpen?: number;
  relatedMachineIds?: string;
  errorDetails?: string;
  proofImages?: string;
  visitPlannedDate?: Date;
  visitCompletedDate?: Date;
  sparePartsDetails?: string;
  poNumber?: string;
  poApprovedAt?: Date;
  poApprovedById?: number;
}

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
    return 0;
  }
}

// Lightweight zone info endpoint for ticket creation
export const getZoneInfo = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // Get the zone this user is assigned to
    const userWithZone = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        customer: { 
          include: { 
            serviceZone: {
              select: {
                id: true,
                name: true,
                description: true
              }
            }
          } 
        },
        serviceZones: { 
          include: { 
            serviceZone: {
              select: {
                id: true,
                name: true,
                description: true
              }
            }
          }
        }
      }
    });
    
    if (!userWithZone) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Try to get zone from service person assignment first, then customer assignment
    let zone = null;
    
    // Check if user is a service person assigned to zones
    if (userWithZone.serviceZones && userWithZone.serviceZones.length > 0) {
      zone = userWithZone.serviceZones[0].serviceZone;
    }
    // Check if user is associated with a customer that has a zone
    else if (userWithZone.customer && userWithZone.customer.serviceZone) {
      zone = userWithZone.customer.serviceZone;
    }
    
    if (!zone) {
      return res.status(404).json({ error: 'No zone assigned to user' });
    }
    
    return res.json({ zone });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch zone info' });
  }
};

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
        customer: { 
          include: { 
            serviceZone: true 
          } 
        },
        serviceZones: { 
          include: { 
            serviceZone: true 
          }
        }
      }
    });
    
    if (!userWithZone) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Try to get zone from service person assignment first, then customer assignment
    let zone = null;
    
    // Check if user is a service person assigned to zones
    if (userWithZone.serviceZones && userWithZone.serviceZones.length > 0) {
      zone = userWithZone.serviceZones[0].serviceZone;
    }
    // Check if user is associated with a customer that has a zone
    else if (userWithZone.customer && userWithZone.customer.serviceZone) {
      zone = userWithZone.customer.serviceZone;
    }
    
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
    const ticketCounts = await (prisma.ticket as any).groupBy({
      by: ['status'],
      where: {
        customer: { serviceZoneId: zone.id },
        OR: [
          { status: 'OPEN' },
          { status: 'IN_PROGRESS' },
          { status: 'IN_PROCESS' as any }, // Handle both IN_PROCESS and IN_PROGRESS
          { status: 'RESOLVED' }
        ]
      },
      _count: true
    });
    
    const openTickets = ticketCounts.find((t: any) => t.status === 'OPEN' as TicketStatus)?._count || 0;
    // Handle both 'IN_PROGRESS' and 'IN_PROCESS' statuses
    const inProgressTickets = 
      (ticketCounts.find((t: any) => t.status === 'IN_PROGRESS' as TicketStatus)?._count || 0) +
      (ticketCounts.find((t: any) => t.status === 'IN_PROCESS' as any)?._count || 0);
    
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
    const resolvedTicketsData = resolvedTickets.map((ticket: any) => ({
      date: ticket.updatedAt.toISOString().split('T')[0],
      count: 1
    }));
    
    // Group by date
    const ticketsByDate = resolvedTicketsData.reduce((acc: Record<string, number>, { date }: { date: string }) => {
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
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
      topIssues: topIssues.map((issue: any) => ({
        title: issue.title,
        count: issue._count._all,
        priority: 'MEDIUM',
        avgResolutionTime: 24
      })),
      technicians: zoneTechnicians.map((tech: any) => ({
        id: tech.id,
        name: tech.name || 'Unknown',
        activeTickets: tech._count.assignedTickets,
        efficiency: Math.floor(Math.random() * 30) + 70, // 70-100%
        rating: Math.floor(Math.random() * 15) / 10 + 4.0 // 4.0-5.5
      })),
      recentActivities: recentActivities.map((activity: any) => ({
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
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Extend JwtPayload to include zoneId
interface ExtendedJwtPayload extends JwtPayload {
  zoneId?: string | number;
  [key: string]: any; // Allow any other properties
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
        return 0;
      }),
      calculateAverageTravelTime(zoneId).catch(e => {
        return 0;
      }),
      calculatePartsAvailability(zoneId).catch(e => {
        return 0;
      }),
      calculateFirstCallResolutionRate(zoneId).catch(e => {
        return 0;
      }),
      getRecentServiceReports(zoneId).catch(e => {
        return [];
      }),
      getEfficiencyTrend(zoneId).catch(e => {
        return [];
      }),
      getServiceDistribution(zoneId).catch(e => {
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

    res.json(serializeBigInts(responseData));
  } catch (error: any) {
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

  const total = result.reduce((sum: number, item: any) => sum + (item._count as number || 0), 0);
  
  return result.map((item: any) => ({
    name: (item.title as string) || 'Other',
    value: total > 0 ? Math.round(((item._count as number || 0) / total) * 100) : 0
  }));
}

// Get zone customers and assets for ticket creation
export const getZoneCustomersAssets = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // Get the zone this user is assigned to
    const userWithZone = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        customer: { 
          include: { 
            serviceZone: true
          } 
        },
        serviceZones: { 
          include: { 
            serviceZone: true
          }
        }
      }
    });
    
    if (!userWithZone) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Try to get zone from service person assignment first, then customer assignment
    let zone = null;
    
    // Check if user is a service person assigned to zones
    if (userWithZone.serviceZones && userWithZone.serviceZones.length > 0) {
      zone = userWithZone.serviceZones[0].serviceZone;
    }
    // Check if user is associated with a customer that has a zone
    else if (userWithZone.customer && userWithZone.customer.serviceZone) {
      zone = userWithZone.customer.serviceZone;
    }
    
    if (!zone) {
      return res.status(404).json({ error: 'No zone assigned to user' });
    }
    
    console.log('Zone found for customers-assets:', zone);
    
    // Get customers in this zone with their contacts and assets
    const customers = await prisma.customer.findMany({
      where: { serviceZoneId: zone.id },
      select: {
        id: true,
        companyName: true,
        address: true,
        industry: true,
        contacts: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true
          }
        },
        assets: {
          select: {
            id: true,
            machineId: true,
            model: true,
            serialNo: true,
            location: true,
            status: true
          }
        }
      }
    });
    
    console.log(`Found ${customers.length} customers for zone ${zone.id}:`, customers.map((c: any) => ({ id: c.id, name: c.companyName })));
    
    return res.json({ customers });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch zone customers and assets' });
  }
}

// Get service persons by zone
export const getZoneServicePersons = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user as ExtendedJwtPayload;
    
    // Get the first service zone ID from user's zoneIds array
    const zoneId = user.zoneIds?.[0];

    if (!zoneId) {
      return res.status(400).json({ error: 'User is not assigned to any service zone' });
    }

    const servicePersons = await prisma.user.findMany({
      where: { 
        role: 'SERVICE_PERSON',
        serviceZones: {
          some: {
            serviceZoneId: Number(zoneId)
          }
        }
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        serviceZones: {
          where: {
            serviceZoneId: Number(zoneId)
          },
          include: {
            serviceZone: true
          }
        }
      }
    });

    return res.json(servicePersons);
  } catch (error) {
    console.error('Error fetching zone service persons:', error);
    return res.status(500).json({ error: 'Failed to fetch service persons for the zone' });
  }
}
