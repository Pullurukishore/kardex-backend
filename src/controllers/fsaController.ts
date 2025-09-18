// controllers/fsaController.ts
import { Request, Response } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';

// Define enum types based on Prisma schema
type UserRole = 'ADMIN' | 'ZONE_USER' | 'SERVICE_PERSON';
type TicketStatus = 'OPEN' | 'ASSIGNED' | 'IN_PROCESS' | 'WAITING_CUSTOMER' | 'ONSITE_VISIT' | 'ONSITE_VISIT_PLANNED' | 'PO_NEEDED' | 'PO_RECEIVED' | 'SPARE_PARTS_NEEDED' | 'SPARE_PARTS_BOOKED' | 'SPARE_PARTS_DELIVERED' | 'CLOSED_PENDING' | 'CLOSED' | 'CANCELLED' | 'REOPENED' | 'IN_PROGRESS' | 'ON_HOLD' | 'ESCALATED' | 'RESOLVED' | 'PENDING';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type SLAStatus = 'ON_TIME' | 'AT_RISK' | 'BREACHED' | 'NOT_APPLICABLE';
import { AuthUser } from '../types/express';
import prisma from '../config/db';
import { subDays, startOfDay, endOfDay, differenceInHours, differenceInDays, format, addDays, isWithinInterval } from 'date-fns';
import { serializeBigInts } from '../utils/bigint';

// Advanced analytics interfaces
interface PerformanceMetrics {
  efficiency: number;
  productivity: number;
  customerSatisfaction: number;
  firstCallResolution: number;
  averageResponseTime: number;
  technicalExpertise: number;
}

interface PredictiveAnalytics {
  ticketVolumeForecast: Array<{ date: string; predicted: number; confidence: number }>;
  resourceRequirements: Array<{ zone: string; requiredPersons: number; currentPersons: number }>;
  maintenanceSchedule: Array<{ equipmentId: string; nextMaintenance: string; priority: string }>;
  seasonalTrends: Array<{ month: string; averageTickets: number; trend: 'up' | 'down' | 'stable' }>;
}

interface RealTimeMetrics {
  activeTickets: number;
  techniciansOnField: number;
  avgResponseTime: number;
  criticalAlertsCount: number;
  equipmentUptime: number;
  customerWaitTime: number;
}

// Get comprehensive FSA dashboard data
export const getFSADashboard = async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { timeframe = '30d', zoneId, userId } = req.query;
    const days = parseInt(timeframe.toString().replace('d', '')) || 30;
    
    // For non-admin users, restrict to their accessible zones
    const userZoneIds = user.zoneIds || [];
    const targetZoneId = zoneId ? Number(zoneId) : null;
    
    // If a specific zone is requested, verify the user has access to it
    if (targetZoneId && !userZoneIds.includes(targetZoneId) && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Access denied to this zone' });
    }
    
    // Use the target zone ID if provided, otherwise use all user zones
    const effectiveZoneIds = targetZoneId ? [targetZoneId] : userZoneIds;
    
    // Get dashboard data based on user role
    let dashboardData: any = {};
    
    if (user.role === 'ADMIN') {
      dashboardData = await getAdminFSAData(effectiveZoneIds, days);
    } else if (user.role === 'ZONE_USER') {
      dashboardData = await getZoneUserFSAData(user.id, effectiveZoneIds, days);
    } else if (user.role === 'SERVICE_PERSON') {
      dashboardData = await getServicePersonFSAData(user.id, effectiveZoneIds, days);
    }

    // Serialize BigInt values to numbers before sending response
    const serializedData = serializeBigInts(dashboardData);
    return res.json({
      success: true,
      data: {
        dashboard: serializedData,
        tickets: [], // Add tickets if needed
        userRole: user.role
      }
    });
  } catch (error) {
    console.error('Error fetching FSA dashboard data:', error);
    return res.status(500).json({ error: 'Failed to fetch FSA dashboard data' });
  }
};

// Get detailed service zone analytics
export const getServiceZoneAnalytics = async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { zoneId } = req.params;
    const { timeframe = '30d' } = req.query;
    const days = parseInt(timeframe.toString().replace('d', '')) || 30;
    
    const targetZoneId = parseInt(zoneId);
    
    // Enhanced zone access control
    let hasAccess = false;
    
    if (user.role === 'ADMIN') {
      // Admins have access to all zones
      hasAccess = true;
    } else if (user.role === 'ZONE_USER') {
      // Zone users have access to their assigned zones
      const userZoneIds = user.zoneIds || [];
      hasAccess = userZoneIds.includes(targetZoneId);
      
      // If user has no zone assignments but is requesting zone 1, allow access (default zone)
      if (!hasAccess && userZoneIds.length === 0 && targetZoneId === 1) {
        hasAccess = true;
      }
      
      // Also check if user has a customer with this zone
      if (!hasAccess && user.customer) {
        try {
          const customer = await prisma.customer.findUnique({
            where: { id: user.customer.id },
            select: { serviceZoneId: true }
          });
          hasAccess = customer?.serviceZoneId === targetZoneId;
        } catch (error) {
          console.error('Error checking customer zone:', error);
        }
      }
    } else if (user.role === 'SERVICE_PERSON') {
      // Service persons have access to zones they're assigned to
      const userZoneIds = user.zoneIds || [];
      hasAccess = userZoneIds.includes(targetZoneId);
    }
    
    if (!hasAccess) {
      return res.status(403).json({ 
        error: 'Access denied to this zone',
        details: `User role: ${user.role}, Zone ID: ${targetZoneId}, User zones: ${user.zoneIds?.join(', ') || 'none'}`
      });
    }

    const zoneData = await getZoneDetailedAnalytics(targetZoneId, days);
    
    // Serialize BigInt values to numbers before sending response
    const serializedData = serializeBigInts(zoneData);
    return res.json(serializedData);
  } catch (error) {
    console.error('Error fetching service zone analytics:', error);
    return res.status(500).json({ error: 'Failed to fetch service zone analytics' });
  }
};

// Get user performance analytics
export const getUserPerformance = async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { userId } = req.params;
    const { timeframe = '30d' } = req.query;
    const days = parseInt(timeframe.toString().replace('d', '')) || 30;
    
    const targetUserId = parseInt(userId);
    
    // For non-admin users, they can only view their own performance
    if (user.role !== 'ADMIN' && user.id !== targetUserId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const userData = await getUserPerformanceAnalytics(targetUserId, days);
    
    // Serialize BigInt values to numbers before sending response
    const serializedData = serializeBigInts(userData);
    return res.json(serializedData);
  } catch (error) {
    console.error('Error fetching user performance:', error);
    return res.status(500).json({ error: 'Failed to fetch user performance' });
  }
};

// Get service person performance analytics
export const getServicePersonPerformance = async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { servicePersonId } = req.params;
    const { timeframe = '30d' } = req.query;
    const days = parseInt(timeframe.toString().replace('d', '')) || 30;
    
    const targetServicePersonId = parseInt(servicePersonId);
    
    // For non-admin users, they can only view their own performance
    if (user.role !== 'ADMIN' && user.id !== targetServicePersonId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const servicePersonData = await getServicePersonPerformanceAnalytics(targetServicePersonId, days);
    
    // Serialize BigInt values to numbers before sending response
    const serializedData = serializeBigInts(servicePersonData);
    return res.json(serializedData);
  } catch (error) {
    console.error('Error fetching service person performance:', error);
    return res.status(500).json({ error: 'Failed to fetch service person performance' });
  }
};

// Helper functions

async function getAdminFSAData(zoneIds: number[] | null, days: number) {
  const startDate = subDays(new Date(), days);
  
  const [
    serviceZones,
    ticketsByStatus,
    ticketsByPriority,
    ticketsTrend,
    slaCompliance,
    topPerformers,
    zonePerformance
  ] = await Promise.all([
    // Get all service zones with stats
    prisma.serviceZone.findMany({
      where: zoneIds?.length ? { id: { in: zoneIds } } : {},
      include: {
        _count: {
          select: {
            customers: true,
            servicePersons: true,
            tickets: {
              where: {
                createdAt: { gte: startDate }
              }
            }
          }
        },
        tickets: {
          where: {
            createdAt: { gte: startDate },
            status: { in: ['RESOLVED', 'CLOSED'] }
          },
          select: {
            id: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    }),
    
    // Ticket distribution by status
    prisma.ticket.groupBy({
      by: ['status'],
      _count: { id: true },
      where: {
        createdAt: { gte: startDate },
        ...buildTicketZoneFilter(zoneIds)
      }
    }),
    
    // Ticket distribution by priority
    prisma.ticket.groupBy({
      by: ['priority'],
      _count: { id: true },
      where: {
        createdAt: { gte: startDate },
        ...buildTicketZoneFilter(zoneIds)
      }
    }),
    
    // Ticket trend over time
    zoneIds?.length 
      ? prisma.$queryRaw`
          SELECT 
            DATE(t."createdAt") as date,
            COUNT(*) as count
          FROM "Ticket" t
          JOIN "Customer" c ON t."customerId" = c.id
          WHERE t."createdAt" >= ${startDate}
            AND c."serviceZoneId" = ANY(${zoneIds})
          GROUP BY DATE(t."createdAt")
          ORDER BY date ASC
        `
      : prisma.$queryRaw`
          SELECT 
            DATE("createdAt") as date,
            COUNT(*) as count
          FROM "Ticket"
          WHERE "createdAt" >= ${startDate}
          GROUP BY DATE("createdAt")
          ORDER BY date ASC
        `,
    
    // SLA compliance rate
    calculateSlaCompliance(zoneIds),
    
    // Top performing service persons
    prisma.user.findMany({
      where: {
        role: 'SERVICE_PERSON',
        ...(zoneIds?.length ? { serviceZones: { some: { serviceZoneId: { in: zoneIds } } } } : {})
      },
      include: {
        _count: {
          select: {
            assignedTickets: {
              where: {
                status: { in: ['RESOLVED', 'CLOSED'] },
                updatedAt: { gte: startDate }
              }
            }
          }
        },
        assignedTickets: {
          where: {
            status: { in: ['RESOLVED', 'CLOSED'] },
            updatedAt: { gte: startDate }
          },
          select: {
            id: true,
            createdAt: true,
            updatedAt: true
          }
        }
      },
      orderBy: {
        assignedTickets: {
          _count: 'desc'
        }
      },
      take: 10
    }),
    
    // Zone performance metrics
    prisma.serviceZone.findMany({
      where: zoneIds?.length ? { id: { in: zoneIds } } : {},
      include: {
        _count: {
          select: {
            tickets: {
              where: {
                createdAt: { gte: startDate }
              }
            }
          }
        },
        tickets: {
          where: {
            createdAt: { gte: startDate },
            status: { in: ['RESOLVED', 'CLOSED'] }
          },
          select: {
            id: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            priority: true
          }
        },
        customers: {
          include: {
            _count: {
              select: {
                tickets: {
                  where: {
                    createdAt: { gte: startDate }
                  }
                }
              }
            }
          }
        }
      }
    })
  ]);

  // Calculate additional metrics
  const totalTickets = ticketsByStatus.reduce((sum: number, item: any) => sum + item._count.id, 0);
  const resolvedTickets = ticketsByStatus
    .filter((item: any) => item.status === 'RESOLVED' || item.status === 'CLOSED')
    .reduce((sum: number, item: any) => sum + item._count.id, 0);
  
  const resolutionRate = totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0;
  
  // Calculate average resolution time
  const allResolvedTickets = serviceZones.flatMap((zone: any) => zone.tickets);
  const totalResolutionTime = allResolvedTickets.reduce((sum: number, ticket: any) => {
    if (!ticket.updatedAt) return sum;
    return sum + differenceInHours(ticket.updatedAt, ticket.createdAt);
  }, 0);
  
  const avgResolutionTime = allResolvedTickets.length > 0 
    ? (totalResolutionTime / allResolvedTickets.length).toFixed(2) 
    : '0';

  return {
    overview: {
      totalZones: serviceZones.length,
      totalTickets,
      resolvedTickets,
      resolutionRate: Math.round(resolutionRate),
      slaCompliance,
      avgResolutionTime
    },
    distribution: {
      byStatus: ticketsByStatus.map((item: any) => ({
        status: item.status,
        count: item._count.id,
        percentage: totalTickets > 0 ? (item._count.id / totalTickets) * 100 : 0
      })),
      byPriority: ticketsByPriority.map((item: any) => ({
        priority: item.priority,
        count: item._count.id,
        percentage: totalTickets > 0 ? (item._count.id / totalTickets) * 100 : 0
      }))
    },
    trends: {
      tickets: ticketsTrend,
      timeFrame: days
    },
    performance: {
      topPerformers: topPerformers.map((user: any) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        resolvedTickets: user._count.assignedTickets,
        avgResolutionTime: user.assignedTickets.length > 0
          ? (user.assignedTickets.reduce((sum: number, ticket: any) => {
              if (!ticket.updatedAt) return sum;
              return sum + differenceInHours(ticket.updatedAt, ticket.createdAt);
            }, 0) / user.assignedTickets.length).toFixed(2)
          : '0'
      })),
      zonePerformance: zonePerformance.map((zone: any) => {
        const resolvedTickets = zone.tickets.filter((t: any) => 
          t.status === 'RESOLVED' || t.status === 'CLOSED'
        );
        
        const totalResolutionTime = resolvedTickets.reduce((sum: number, ticket: any) => {
          if (!ticket.updatedAt) return sum;
          return sum + differenceInHours(ticket.updatedAt, ticket.createdAt);
        }, 0);
        
        const avgResolutionTime = resolvedTickets.length > 0 
          ? (totalResolutionTime / resolvedTickets.length).toFixed(2) 
          : '0';
          
        const criticalTickets = resolvedTickets.filter((t: any) => t.priority === 'CRITICAL').length;
        const criticalResolutionRate = criticalTickets > 0 
          ? (criticalTickets / resolvedTickets.length) * 100 
          : 0;
          
        return {
          id: zone.id,
          name: zone.name,
          totalTickets: zone._count.tickets,
          resolvedTickets: resolvedTickets.length,
          avgResolutionTime,
          criticalResolutionRate: Math.round(criticalResolutionRate),
          customerCount: zone.customers.length,
          activeCustomers: zone.customers.filter((c: any) => c._count.tickets > 0).length
        };
      })
    }
  };
}

async function getZoneUserFSAData(userId: number, zoneIds: number[] | null, days: number) {
  const startDate = subDays(new Date(), days);
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      customer: {
        include: {
          serviceZone: true,
          tickets: {
            where: {
              createdAt: { gte: startDate }
            },
            include: {
              assignedTo: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              },
              statusHistory: {
                orderBy: {
                  changedAt: 'desc'
                },
                take: 1
              }
            }
          }
        }
      },
      serviceZones: {
        include: {
          serviceZone: {
            include: {
              customers: {
                include: {
                  tickets: {
                    where: {
                      createdAt: { gte: startDate }
                    },
                    include: {
                      assignedTo: {
                        select: {
                          id: true,
                          name: true,
                          email: true
                        }
                      },
                      statusHistory: {
                        orderBy: {
                          changedAt: 'desc'
                        },
                        take: 1
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }

  // If user has a customer, return customer-specific data
  if (user.customer) {
  
  const customer = user.customer;
  const tickets = customer.tickets;
  
  // Calculate metrics
  const totalTickets = tickets.length;
  const openTickets = tickets.filter((t: any) => 
    t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED'
  ).length;
  
  const resolvedTickets = tickets.filter((t: any) => 
    t.status === 'RESOLVED' || t.status === 'CLOSED'
  ).length;
  
  const resolutionRate = totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0;
  
  // Calculate average resolution time for resolved tickets
  const resolvedTicketsWithTime = tickets.filter((t: any) => 
    (t.status === 'RESOLVED' || t.status === 'CLOSED') && t.updatedAt
  );
  
  const totalResolutionTime = resolvedTicketsWithTime.reduce((sum: number, ticket: any) => {
    return sum + differenceInHours(ticket.updatedAt!, ticket.createdAt);
  }, 0);
  
  const avgResolutionTime = resolvedTicketsWithTime.length > 0 
    ? (totalResolutionTime / resolvedTicketsWithTime.length).toFixed(2) 
    : '0';
    
  // Group tickets by status
  const statusCounts = tickets.reduce((acc: Record<string, number>, ticket: any) => {
    acc[ticket.status] = (acc[ticket.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Group tickets by priority
  const priorityCounts = tickets.reduce((acc: Record<string, number>, ticket: any) => {
    acc[ticket.priority] = (acc[ticket.priority] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Get recent activity
  const recentTickets = tickets
    .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10)
    .map((ticket: any) => ({
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      assignedTo: ticket.assignedTo,
      lastStatusChange: ticket.statusHistory[0]?.changedAt || ticket.createdAt
    }));
  
  return {
    overview: {
      customerName: customer.companyName,
      serviceZone: customer.serviceZone.name,
      totalTickets,
      openTickets,
      resolvedTickets,
      resolutionRate: Math.round(resolutionRate),
      avgResolutionTime
    },
    distribution: {
      byStatus: Object.entries(statusCounts).map(([status, count]) => ({
        status,
        count,
        percentage: totalTickets > 0 ? ((count as number) / totalTickets) * 100 : 0
      })),
      byPriority: Object.entries(priorityCounts).map(([priority, count]) => ({
        priority,
        count,
        percentage: totalTickets > 0 ? ((count as number) / totalTickets) * 100 : 0
      }))
    },
    recentActivity: {
      tickets: recentTickets
    },
    performance: {
      // Add any customer-specific performance metrics here
    }
  };
  }

  // If user doesn't have a customer but has zone assignments, return zone-level data
  if (user.serviceZones && user.serviceZones.length > 0) {
    const allTickets = user.serviceZones.flatMap((sz: any) => 
      sz.serviceZone.customers.flatMap((c: any) => c.tickets)
    );
    
    const totalTickets = allTickets.length;
    const openTickets = allTickets.filter((t: any) => 
      t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED'
    ).length;
    
    const resolvedTickets = allTickets.filter((t: any) => 
      t.status === 'RESOLVED' || t.status === 'CLOSED'
    ).length;
    
    const resolutionRate = totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0;
    
    // Calculate average resolution time
    const resolvedTicketsWithTime = allTickets.filter((t: any) => 
      (t.status === 'RESOLVED' || t.status === 'CLOSED') && t.updatedAt
    );
    
    const totalResolutionTime = resolvedTicketsWithTime.reduce((sum: number, ticket: any) => {
      return sum + differenceInHours(ticket.updatedAt!, ticket.createdAt);
    }, 0);
    
    const avgResolutionTime = resolvedTicketsWithTime.length > 0 
      ? (totalResolutionTime / resolvedTicketsWithTime.length).toFixed(2) 
      : '0';
    
    // Group tickets by status and priority
    const statusCounts = allTickets.reduce((acc: Record<string, number>, ticket: any) => {
      acc[ticket.status] = (acc[ticket.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const priorityCounts = allTickets.reduce((acc: Record<string, number>, ticket: any) => {
      acc[ticket.priority] = (acc[ticket.priority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Get recent tickets
    const recentTickets = allTickets
      .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10)
      .map((ticket: any) => ({
        id: ticket.id,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        createdAt: ticket.createdAt,
        assignedTo: ticket.assignedTo,
        lastStatusChange: ticket.statusHistory[0]?.changedAt || ticket.createdAt
      }));
    
    return {
      overview: {
        customerName: `Zone Manager - ${user.name}`,
        serviceZone: user.serviceZones.map((sz: any) => sz.serviceZone.name).join(', '),
        totalTickets,
        openTickets,
        resolvedTickets,
        resolutionRate: Math.round(resolutionRate),
        avgResolutionTime
      },
      distribution: {
        byStatus: Object.entries(statusCounts).map(([status, count]) => ({
          status,
          count,
          percentage: totalTickets > 0 ? ((count as number) / totalTickets) * 100 : 0
        })),
        byPriority: Object.entries(priorityCounts).map(([priority, count]) => ({
          priority,
          count,
          percentage: totalTickets > 0 ? ((count as number) / totalTickets) * 100 : 0
        }))
      },
      recentActivity: {
        tickets: recentTickets
      },
      performance: {}
    };
  }

  // Fallback for users with no customer or zone assignments
  return {
    overview: {
      customerName: user.name || 'Zone User',
      serviceZone: 'No Zone Assigned',
      totalTickets: 0,
      openTickets: 0,
      resolvedTickets: 0,
      resolutionRate: 0,
      avgResolutionTime: '0'
    },
    distribution: {
      byStatus: [],
      byPriority: []
    },
    recentActivity: {
      tickets: []
    },
    performance: {}
  };
}

async function getServicePersonFSAData(userId: number, zoneIds: number[] | null, days: number) {
  const startDate = subDays(new Date(), days);
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      assignedTickets: {
        where: {
          createdAt: { gte: startDate }
        },
        include: {
          customer: {
            include: {
              serviceZone: true
            }
          },
          statusHistory: {
            orderBy: {
              changedAt: 'desc'
            },
            take: 1
          }
        }
      },
      serviceZones: {
        include: {
          serviceZone: true
        }
      }
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  const tickets = user.assignedTickets;
  
  // Calculate metrics
  const totalTickets = tickets.length;
  const openTickets = tickets.filter((t: any) => 
    t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED'
  ).length;
  
  const resolvedTickets = tickets.filter((t: any) => 
    t.status === 'RESOLVED' || t.status === 'CLOSED'
  ).length;
  
  const resolutionRate = totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0;
  
  // Calculate average resolution time for resolved tickets
  const resolvedTicketsWithTime = tickets.filter((t: any) => 
    (t.status === 'RESOLVED' || t.status === 'CLOSED') && t.updatedAt
  );
  
  const totalResolutionTime = resolvedTicketsWithTime.reduce((sum: number, ticket: any) => {
    return sum + differenceInHours(ticket.updatedAt!, ticket.createdAt);
  }, 0);
  
  const avgResolutionTime = resolvedTicketsWithTime.length > 0 
    ? (totalResolutionTime / resolvedTicketsWithTime.length).toFixed(2) 
    : '0';
    
  // Group tickets by status
  const statusCounts = tickets.reduce((acc: Record<string, number>, ticket: any) => {
    acc[ticket.status] = (acc[ticket.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Group tickets by priority
  const priorityCounts = tickets.reduce((acc: Record<string, number>, ticket: any) => {
    acc[ticket.priority] = (acc[ticket.priority] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Group tickets by zone
  const zoneCounts = tickets.reduce((acc: Record<string, number>, ticket: any) => {
    const zoneName = ticket.customer?.serviceZone?.name || 'Unknown';
    acc[zoneName] = (acc[zoneName] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Get recent activity
  const recentTickets = tickets
    .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10)
    .map((ticket: any) => ({
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      customer: ticket.customer.companyName,
      zone: ticket.customer.serviceZone.name,
      lastStatusChange: ticket.statusHistory[0]?.changedAt || ticket.createdAt
    }));
  
  return {
    overview: {
      userName: user.name,
      email: user.email,
      totalTickets,
      openTickets,
      resolvedTickets,
      resolutionRate: Math.round(resolutionRate),
      avgResolutionTime
    },
    distribution: {
      byStatus: Object.entries(statusCounts).map(([status, count]) => ({
        status,
        count,
        percentage: totalTickets > 0 ? ((count as number) / totalTickets) * 100 : 0
      })),
      byPriority: Object.entries(priorityCounts).map(([priority, count]) => ({
        priority,
        count,
        percentage: totalTickets > 0 ? ((count as number) / totalTickets) * 100 : 0
      })),
      byZone: Object.entries(zoneCounts).map(([zone, count]) => ({
        zone,
        count,
        percentage: totalTickets > 0 ? ((count as number) / totalTickets) * 100 : 0
      }))
    },
    recentActivity: {
      tickets: recentTickets
    },
    assignedZones: user.serviceZones.map((sz: any) => ({
      id: sz.serviceZone.id,
      name: sz.serviceZone.name
    }))
  };
}

// Removed duplicate function - implementation exists at end of file

// Removed duplicate functions - implementations exist at end of file

// Advanced Analytics Controllers

// Get real-time metrics
export const getRealTimeMetrics = async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const now = new Date();
    const today = startOfDay(now);
    
    // Get real-time metrics
    const [activeTickets, techniciansOnField, criticalAlerts, recentTickets] = await Promise.all([
      // Active tickets count
      prisma.ticket.count({
        where: {
          status: { in: ['OPEN', 'IN_PROGRESS', 'ASSIGNED'] }
        }
      }),
      
      // Technicians currently on field (service persons with active tickets)
      prisma.user.count({
        where: {
          role: 'SERVICE_PERSON',
          assignedTickets: {
            some: {
              status: { in: ['IN_PROGRESS', 'ASSIGNED'] }
            }
          }
        }
      }),
      
      // Critical alerts (high priority tickets created today)
      prisma.ticket.count({
        where: {
          priority: { in: ['CRITICAL', 'HIGH'] },
          createdAt: { gte: today },
          status: { notIn: ['RESOLVED', 'CLOSED'] }
        }
      }),
      
      // Recent tickets for response time calculation
      prisma.ticket.findMany({
        where: {
          status: { in: ['RESOLVED', 'CLOSED'] },
          updatedAt: { gte: subDays(now, 1) }
        },
        select: {
          createdAt: true,
          updatedAt: true
        }
      })
    ]);

    // Calculate average response time
    const avgResponseTime = recentTickets.length > 0 
      ? recentTickets.reduce((sum: any, ticket: any) => {
          if (!ticket.updatedAt) return sum;
          return sum + differenceInHours(ticket.updatedAt, ticket.createdAt);
        }, 0) / recentTickets.length
      : 0;

    const realTimeMetrics: RealTimeMetrics = {
      activeTickets,
      techniciansOnField,
      avgResponseTime: Math.round(avgResponseTime * 100) / 100,
      criticalAlertsCount: criticalAlerts,
      equipmentUptime: 98.5, // Mock data - would come from equipment monitoring
      customerWaitTime: Math.round(avgResponseTime * 0.8 * 100) / 100
    };

    res.json({
      success: true,
      data: serializeBigInts(realTimeMetrics)
    });
  } catch (error) {
    console.error('Error fetching real-time metrics:', error);
    res.status(500).json({ error: 'Failed to fetch real-time metrics' });
  }
};

// Get predictive analytics
export const getPredictiveAnalytics = async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { timeframe = '90d' } = req.query;
    const days = parseInt(timeframe.toString().replace('d', '')) || 90;
    const startDate = subDays(new Date(), days);

    // Get historical ticket data for forecasting
    const historicalData = await prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT 
        DATE("createdAt") as date,
        COUNT(*) as count
      FROM "Ticket"
      WHERE "createdAt" >= ${startDate}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `;

    // Simple linear regression for ticket volume prediction
    const ticketVolumeForecast = generateTicketForecast(historicalData);
    
    // Get zone data for resource requirements
    const zones = await prisma.serviceZone.findMany({
      include: {
        _count: {
          select: {
            servicePersons: true,
            tickets: {
              where: {
                createdAt: { gte: startDate },
                status: { notIn: ['RESOLVED', 'CLOSED'] }
              }
            }
          }
        }
      }
    });

    const resourceRequirements = zones.map((zone: any) => ({
      zone: zone.name,
      requiredPersons: Math.ceil(zone._count.tickets / 10), // 10 tickets per person
      currentPersons: zone._count.servicePersons
    }));

    // Mock seasonal trends (would be calculated from historical data)
    const seasonalTrends = [
      { month: 'Jan', averageTickets: 45, trend: 'stable' as const },
      { month: 'Feb', averageTickets: 38, trend: 'down' as const },
      { month: 'Mar', averageTickets: 52, trend: 'up' as const },
      { month: 'Apr', averageTickets: 48, trend: 'stable' as const },
      { month: 'May', averageTickets: 55, trend: 'up' as const },
      { month: 'Jun', averageTickets: 62, trend: 'up' as const }
    ];

    const predictiveAnalytics: PredictiveAnalytics = {
      ticketVolumeForecast,
      resourceRequirements,
      maintenanceSchedule: [], // Would be populated from equipment data
      seasonalTrends
    };

    res.json({
      success: true,
      data: serializeBigInts(predictiveAnalytics)
    });
  } catch (error) {
    console.error('Error fetching predictive analytics:', error);
    res.status(500).json({ error: 'Failed to fetch predictive analytics' });
  }
};

// Get advanced performance metrics
export const getAdvancedPerformanceMetrics = async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { timeframe = '30d', userId } = req.query;
    const days = parseInt(timeframe.toString().replace('d', '')) || 30;
    const startDate = subDays(new Date(), days);

    // Get performance data for service persons
    const servicePersons = await prisma.user.findMany({
      where: {
        role: 'SERVICE_PERSON',
        ...(userId && { id: parseInt(userId.toString()) })
      },
      include: {
        assignedTickets: {
          where: {
            createdAt: { gte: startDate }
          },
          select: {
            id: true,
            status: true,
            priority: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });

    const performanceMetrics = servicePersons.map((person: any) => {
      const tickets = person.assignedTickets;
      const resolvedTickets = tickets.filter((t: any) => t.status === 'RESOLVED' || t.status === 'CLOSED');
      const criticalTickets = tickets.filter((t: any) => t.priority === 'CRITICAL');
      
      // Calculate metrics
      const efficiency = tickets.length > 0 ? (resolvedTickets.length / tickets.length) * 100 : 0;
      const productivity = resolvedTickets.length;
      const firstCallResolution = criticalTickets.length > 0 
        ? (criticalTickets.filter((t: any) => t.status === 'RESOLVED').length / criticalTickets.length) * 100 
        : 100;

      const avgResponseTime = resolvedTickets.length > 0
        ? resolvedTickets.reduce((sum: number, ticket: any) => {
            if (!ticket.updatedAt) return sum;
            return sum + differenceInHours(ticket.updatedAt, ticket.createdAt);
          }, 0) / resolvedTickets.length
        : 0;

      const metrics: PerformanceMetrics = {
        efficiency: Math.round(efficiency),
        productivity,
        customerSatisfaction: Math.round(85 + Math.random() * 10), // Mock data
        firstCallResolution: Math.round(firstCallResolution),
        averageResponseTime: Math.round(avgResponseTime * 100) / 100,
        technicalExpertise: Math.round(75 + Math.random() * 20) // Mock data
      };

      return {
        userId: person.id,
        name: person.name,
        email: person.email,
        metrics
      };
    });

    res.json({
      success: true,
      data: serializeBigInts(performanceMetrics)
    });
  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    res.status(500).json({ error: 'Failed to fetch performance metrics' });
  }
};

// Get equipment analytics
export const getEquipmentAnalytics = async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Mock equipment data - in real implementation, this would come from equipment monitoring systems
    const equipmentAnalytics = {
      totalEquipment: 156,
      operationalEquipment: 148,
      underMaintenance: 5,
      outOfService: 3,
      uptimePercentage: 94.8,
      maintenanceScheduled: 12,
      criticalAlerts: 2,
      equipmentByZone: [
        { zone: 'North Zone', total: 45, operational: 42, uptime: 93.3 },
        { zone: 'South Zone', total: 38, operational: 36, uptime: 94.7 },
        { zone: 'East Zone', total: 41, operational: 40, uptime: 97.6 },
        { zone: 'West Zone', total: 32, operational: 30, uptime: 93.8 }
      ],
      maintenanceHistory: [
        { equipmentId: 'EQ001', lastMaintenance: '2024-01-15', nextDue: '2024-04-15', status: 'scheduled' },
        { equipmentId: 'EQ002', lastMaintenance: '2024-01-10', nextDue: '2024-04-10', status: 'overdue' },
        { equipmentId: 'EQ003', lastMaintenance: '2024-01-20', nextDue: '2024-04-20', status: 'scheduled' }
      ]
    };

    res.json({
      success: true,
      data: equipmentAnalytics
    });
  } catch (error) {
    console.error('Error fetching equipment analytics:', error);
    res.status(500).json({ error: 'Failed to fetch equipment analytics' });
  }
};

// Get customer satisfaction metrics
export const getCustomerSatisfactionMetrics = async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { timeframe = '30d' } = req.query;
    const days = parseInt(timeframe.toString().replace('d', '')) || 30;
    const startDate = subDays(new Date(), days);

    // Get customer data with ticket resolution metrics
    const customers = await prisma.customer.findMany({
      include: {
        tickets: {
          where: {
            createdAt: { gte: startDate }
          },
          select: {
            id: true,
            status: true,
            priority: true,
            createdAt: true,
            updatedAt: true
          }
        },
        serviceZone: {
          select: {
            name: true
          }
        }
      }
    });

    const satisfactionMetrics = customers.map((customer: any) => {
      const tickets = customer.tickets;
      const resolvedTickets = tickets.filter((t: any) => t.status === 'RESOLVED' || t.status === 'CLOSED');
      
      const resolutionRate = tickets.length > 0 ? (resolvedTickets.length / tickets.length) * 100 : 0;
      const avgResolutionTime = resolvedTickets.length > 0
        ? resolvedTickets.reduce((sum: number, ticket: any) => {
            if (!ticket.updatedAt) return sum;
            return sum + differenceInHours(ticket.updatedAt, ticket.createdAt);
          }, 0) / resolvedTickets.length
        : 0;

      // Mock satisfaction score based on resolution metrics
      const satisfactionScore = Math.min(100, Math.max(0, 
        85 - (avgResolutionTime * 2) + (resolutionRate * 0.1)
      ));

      return {
        customerId: customer.id,
        companyName: customer.companyName,
        zone: customer.serviceZone.name,
        totalTickets: tickets.length,
        resolvedTickets: resolvedTickets.length,
        resolutionRate: Math.round(resolutionRate),
        avgResolutionTime: Math.round(avgResolutionTime * 100) / 100,
        satisfactionScore: Math.round(satisfactionScore),
        lastInteraction: tickets.length > 0 ? tickets[0].createdAt : null
      };
    });

    const overallMetrics = {
      averageSatisfaction: Math.round(
        satisfactionMetrics.reduce((sum: number, m: any) => sum + m.satisfactionScore, 0) / satisfactionMetrics.length
      ),
      totalCustomers: customers.length,
      activeCustomers: satisfactionMetrics.filter((m: any) => m.totalTickets > 0).length,
      highSatisfaction: satisfactionMetrics.filter((m: any) => m.satisfactionScore >= 85).length,
      lowSatisfaction: satisfactionMetrics.filter((m: any) => m.satisfactionScore < 60).length
    };

    res.json({
      success: true,
      data: serializeBigInts({
        overall: overallMetrics,
        customers: satisfactionMetrics.slice(0, 50) // Limit for performance
      })
    });
  } catch (error) {
    console.error('Error fetching customer satisfaction metrics:', error);
    res.status(500).json({ error: 'Failed to fetch customer satisfaction metrics' });
  }
};

// Get resource optimization recommendations
export const getResourceOptimization = async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { timeframe = '30d' } = req.query;
    const days = parseInt(timeframe.toString().replace('d', '')) || 30;
    const startDate = subDays(new Date(), days);

    // Get zone workload data
    const zones = await prisma.serviceZone.findMany({
      include: {
        _count: {
          select: {
            servicePersons: true,
            tickets: {
              where: {
                createdAt: { gte: startDate }
              }
            }
          }
        },
        tickets: {
          where: {
            createdAt: { gte: startDate }
          },
          select: {
            status: true,
            priority: true
          }
        }
      }
    });

    const resourceOptimization = zones.map((zone: any) => {
      const totalTickets = zone._count.tickets;
      const servicePersons = zone._count.servicePersons;
      const workloadPerPerson = servicePersons > 0 ? totalTickets / servicePersons : 0;
      
      const criticalTickets = zone.tickets.filter((t: any) => t.priority === 'CRITICAL').length;
      const openTickets = zone.tickets.filter((t: any) => t.status !== 'RESOLVED' && t.status !== 'CLOSED').length;
      
      // Calculate optimization recommendations
      const recommendedPersons = Math.ceil(totalTickets / 8); // Target 8 tickets per person
      const efficiency = servicePersons > 0 ? Math.min(100, (8 / workloadPerPerson) * 100) : 0;
      
      let recommendation = 'optimal';
      if (workloadPerPerson > 12) recommendation = 'add_resources';
      else if (workloadPerPerson < 4 && servicePersons > 1) recommendation = 'reduce_resources';
      
      return {
        zoneId: zone.id,
        zoneName: zone.name,
        currentPersons: servicePersons,
        recommendedPersons,
        totalTickets,
        workloadPerPerson: Math.round(workloadPerPerson * 100) / 100,
        efficiency: Math.round(efficiency),
        criticalTickets,
        openTickets,
        recommendation,
        priority: criticalTickets > 5 ? 'high' : openTickets > 20 ? 'medium' : 'low'
      };
    });

    const summary = {
      totalZones: zones.length,
      overloadedZones: resourceOptimization.filter((z: any) => z.recommendation === 'add_resources').length,
      underutilizedZones: resourceOptimization.filter((z: any) => z.recommendation === 'reduce_resources').length,
      optimalZones: resourceOptimization.filter((z: any) => z.recommendation === 'optimal').length,
      averageEfficiency: Math.round(
        resourceOptimization.reduce((sum: number, z: any) => sum + z.efficiency, 0) / resourceOptimization.length
      )
    };

    res.json({
      success: true,
      data: serializeBigInts({
        summary,
        zones: resourceOptimization
      })
    });
  } catch (error) {
    console.error('Error fetching resource optimization:', error);
    res.status(500).json({ error: 'Failed to fetch resource optimization' });
  }
};

// Get service reports
export const getServiceReports = async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { reportType = 'summary', timeframe = '30d', zoneId } = req.query;
    const days = parseInt(timeframe.toString().replace('d', '')) || 30;
    const startDate = subDays(new Date(), days);

    let reportData: any = {};

    switch (reportType) {
      case 'summary':
        reportData = await generateSummaryReport(startDate, zoneId ? parseInt(zoneId.toString()) : null);
        break;
      case 'performance':
        reportData = await generatePerformanceReport(startDate, zoneId ? parseInt(zoneId.toString()) : null);
        break;
      case 'sla':
        reportData = await generateSLAReport(startDate, zoneId ? parseInt(zoneId.toString()) : null);
        break;
      default:
        return res.status(400).json({ error: 'Invalid report type' });
    }

    res.json(serializeBigInts(reportData));
  } catch (error) {
    console.error('Error generating service reports:', error);
    res.status(500).json({ error: 'Failed to generate service reports' });
  }
};

// Export FSA data
export const exportFSAData = async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { format } = req.params;
    const { timeframe = '30d', dataType = 'tickets' } = req.query;

    if (!['json', 'csv'].includes(format)) {
      return res.status(400).json({ error: 'Invalid export format' });
    }

    // For now, return a simple JSON export
    const exportData = {
      exportedAt: new Date().toISOString(),
      format,
      dataType,
      timeframe,
      message: 'Export functionality would be implemented here'
    };

    if (format === 'json') {
      res.json(exportData);
    } else {
      // CSV export would be implemented here
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=fsa-export.csv');
      res.send('CSV export not implemented yet');
    }
  } catch (error) {
    console.error('Error exporting FSA data:', error);
    res.status(500).json({ error: 'Failed to export FSA data' });
  }
};

// Helper functions
function buildTicketZoneFilter(zoneIds: number[] | null) {
  if (!zoneIds || zoneIds.length === 0) {
    return {};
  }
  
  return {
    customer: {
      serviceZoneId: { in: zoneIds }
    }
  };
}

async function calculateSlaCompliance(zoneIds: number[] | null): Promise<number> {
  try {
    const whereClause = zoneIds?.length 
      ? { customer: { serviceZoneId: { in: zoneIds } } }
      : {};
    
    const totalTickets = await prisma.ticket.count({
      where: {
        ...whereClause,
        status: { in: ['RESOLVED', 'CLOSED'] }
      }
    });
    
    if (totalTickets === 0) return 100;
    
    const slaCompliantTickets = await prisma.ticket.count({
      where: {
        ...whereClause,
        status: { in: ['RESOLVED', 'CLOSED'] },
        slaStatus: 'ON_TIME'
      }
    });
    
    return Math.round((slaCompliantTickets / totalTickets) * 100);
  } catch (error) {
    console.error('Error calculating SLA compliance:', error);
    return 0;
  }
}

async function getUserPerformanceAnalytics(userId: number, days: number) {
  const startDate = subDays(new Date(), days);
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      assignedTickets: {
        where: {
          createdAt: { gte: startDate }
        }
      }
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  const tickets = user.assignedTickets;
  const resolvedTickets = tickets.filter((t: any) => 
    t.status === 'RESOLVED' || t.status === 'CLOSED'
  );
  
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email
    },
    metrics: {
      totalTickets: tickets.length,
      resolvedTickets: resolvedTickets.length,
      resolutionRate: tickets.length > 0 ? (resolvedTickets.length / tickets.length) * 100 : 0
    }
  };
}

async function getServicePersonPerformanceAnalytics(servicePersonId: number, days: number) {
  return getUserPerformanceAnalytics(servicePersonId, days);
}

async function getZoneDetailedAnalytics(zoneId: number, days: number) {
  const startDate = subDays(new Date(), days);
  
  const zone = await prisma.serviceZone.findUnique({
    where: { id: zoneId },
    include: {
      customers: {
        include: {
          _count: {
            select: {
              tickets: {
                where: {
                  createdAt: { gte: startDate }
                }
              }
            }
          },
          tickets: {
            where: {
              createdAt: { gte: startDate }
            },
            include: {
              assignedTo: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              },
              statusHistory: {
                orderBy: {
                  changedAt: 'desc'
                },
                take: 1
              }
            }
          }
        }
      },
      servicePersons: {
        include: {
          user: {
            include: {
              _count: {
                select: {
                  assignedTickets: {
                    where: {
                      createdAt: { gte: startDate },
                      customer: {
                        serviceZoneId: zoneId
                      }
                    }
                  }
                }
              },
              assignedTickets: {
                where: {
                  createdAt: { gte: startDate },
                  customer: {
                    serviceZoneId: zoneId
                  }
                },
                include: {
                  customer: true,
                  statusHistory: {
                    orderBy: {
                      changedAt: 'desc'
                    },
                    take: 1
                  }
                }
              }
            }
          }
        }
      },
      tickets: {
        where: {
          createdAt: { gte: startDate }
        },
        include: {
          customer: true,
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          statusHistory: {
            orderBy: {
              changedAt: 'desc'
            },
            take: 1
          }
        }
      }
    }
  });
  
  if (!zone) {
    throw new Error('Service zone not found');
  }
  
  const tickets = zone.tickets;
  
  // Calculate zone metrics
  const totalTickets = tickets.length;
  const openTickets = tickets.filter((t: any) => 
    t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED'
  ).length;
  
  const resolvedTickets = tickets.filter((t: any) => 
    t.status === 'RESOLVED' || t.status === 'CLOSED'
  ).length;
  
  const resolutionRate = totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0;
  
  // Calculate average resolution time for resolved tickets
  const resolvedTicketsWithTime = tickets.filter((t: any) => 
    (t.status === 'RESOLVED' || t.status === 'CLOSED') && t.updatedAt
  );
  
  const totalResolutionTime = resolvedTicketsWithTime.reduce((sum: number, ticket: any) => {
    return sum + differenceInHours(ticket.updatedAt!, ticket.createdAt);
  }, 0);
  
  const avgResolutionTime = resolvedTicketsWithTime.length > 0 
    ? (totalResolutionTime / resolvedTicketsWithTime.length).toFixed(2) 
    : '0';
  
  // Calculate SLA compliance
  const slaCompliance = await calculateSlaCompliance([zoneId]);
  
  // Group tickets by status
  const statusCounts = tickets.reduce((acc: Record<string, number>, ticket: any) => {
    acc[ticket.status] = (acc[ticket.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Group tickets by priority
  const priorityCounts = tickets.reduce((acc: Record<string, number>, ticket: any) => {
    acc[ticket.priority] = (acc[ticket.priority] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Customer performance
  const customerPerformance = zone.customers.map((customer: any) => {
    const customerTickets = customer.tickets;
    const resolvedCustomerTickets = customerTickets.filter((t: any) => 
      t.status === 'RESOLVED' || t.status === 'CLOSED'
    );
    
    const customerResolutionRate = customerTickets.length > 0 
      ? (resolvedCustomerTickets.length / customerTickets.length) * 100 
      : 0;
    
    return {
      id: customer.id,
      name: customer.companyName,
      ticketCount: customerTickets.length,
      resolvedTickets: resolvedCustomerTickets.length,
      resolutionRate: Math.round(customerResolutionRate)
    };
  });
  
  // Service person performance
  const servicePersonPerformance = zone.servicePersons.map((sp: any) => {
    const user = sp.user;
    const userTickets = user.assignedTickets;
    const resolvedUserTickets = userTickets.filter((t: any) => 
      t.status === 'RESOLVED' || t.status === 'CLOSED'
    );
    
    const userResolutionRate = userTickets.length > 0 
      ? (resolvedUserTickets.length / userTickets.length) * 100 
      : 0;
    
    // Calculate average resolution time
    const resolvedTicketsWithTime = userTickets.filter((t: any) => 
      (t.status === 'RESOLVED' || t.status === 'CLOSED') && t.updatedAt
    );
    
    const totalResolutionTime = resolvedTicketsWithTime.reduce((sum: number, ticket: any) => {
      return sum + differenceInHours(ticket.updatedAt!, ticket.createdAt);
    }, 0);
    
    const avgResolutionTime = resolvedTicketsWithTime.length > 0 
      ? (totalResolutionTime / resolvedTicketsWithTime.length).toFixed(2) 
      : '0';
    
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      ticketCount: userTickets.length,
      resolvedTickets: resolvedUserTickets.length,
      resolutionRate: Math.round(userResolutionRate),
      avgResolutionTime
    };
  });
  
  // Recent tickets
  const recentTickets = tickets
    .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10)
    .map((ticket: any) => ({
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      customer: ticket.customer.companyName,
      assignedTo: ticket.assignedTo,
      lastStatusChange: ticket.statusHistory[0]?.changedAt || ticket.createdAt
    }));
  
  return {
    zoneInfo: {
      id: zone.id,
      name: zone.name,
      description: zone.description,
      isActive: zone.isActive
    },
    overview: {
      totalCustomers: zone.customers.length,
      totalServicePersons: zone.servicePersons.length,
      totalTickets,
      openTickets,
      resolvedTickets,
      resolutionRate: Math.round(resolutionRate),
      avgResolutionTime,
      slaCompliance
    },
    distribution: {
      byStatus: Object.entries(statusCounts).map(([status, count]) => ({
        status,
        count,
        percentage: totalTickets > 0 ? ((count as number) / totalTickets) * 100 : 0
      })),
      byPriority: Object.entries(priorityCounts).map(([priority, count]) => ({
        priority,
        count,
        percentage: totalTickets > 0 ? ((count as number) / totalTickets) * 100 : 0
      }))
    },
    performance: {
      customers: customerPerformance.sort((a: any, b: any) => b.ticketCount - a.ticketCount),
      servicePersons: servicePersonPerformance.sort((a: any, b: any) => b.resolvedTickets - a.resolvedTickets)
    },
    recentActivity: {
      tickets: recentTickets
    }
  };
}

// Helper functions for advanced analytics

function generateTicketForecast(historicalData: Array<{ date: string; count: bigint }>): Array<{ date: string; predicted: number; confidence: number }> {
  // Simple linear regression for demonstration
  const data = historicalData.map(d => ({ date: d.date, count: Number(d.count) }));
  
  if (data.length < 7) {
    return []; // Need at least a week of data
  }

  // Calculate trend
  const avgCount = data.reduce((sum, d) => sum + d.count, 0) / data.length;
  const trend = (data[data.length - 1].count - data[0].count) / data.length;

  // Generate 7-day forecast
  const forecast = [];
  const lastDate = new Date(data[data.length - 1].date);
  
  for (let i = 1; i <= 7; i++) {
    const forecastDate = addDays(lastDate, i);
    const predicted = Math.max(0, Math.round(avgCount + (trend * i)));
    const confidence = Math.max(60, 95 - (i * 5)); // Decreasing confidence over time
    
    forecast.push({
      date: format(forecastDate, 'yyyy-MM-dd'),
      predicted,
      confidence
    });
  }

  return forecast;
}

async function generateSummaryReport(startDate: Date, zoneId: number | null) {
  const whereClause = zoneId ? { customer: { serviceZoneId: zoneId } } : {};
  
  const [totalTickets, resolvedTickets, avgResolutionTime] = await Promise.all([
    prisma.ticket.count({
      where: {
        ...whereClause,
        createdAt: { gte: startDate }
      }
    }),
    prisma.ticket.count({
      where: {
        ...whereClause,
        createdAt: { gte: startDate },
        status: { in: ['RESOLVED', 'CLOSED'] }
      }
    }),
    prisma.ticket.findMany({
      where: {
        ...whereClause,
        createdAt: { gte: startDate },
        status: { in: ['RESOLVED', 'CLOSED'] }
      },
      select: {
        createdAt: true,
        updatedAt: true
      }
    })
  ]);

  const avgTime = avgResolutionTime.length > 0
    ? avgResolutionTime.reduce((sum: number, ticket: any) => {
        return sum + differenceInHours(ticket.updatedAt!, ticket.createdAt);
      }, 0) / avgResolutionTime.length
    : 0;

  return {
    reportType: 'summary',
    period: { startDate, endDate: new Date() },
    metrics: {
      totalTickets,
      resolvedTickets,
      resolutionRate: totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0,
      avgResolutionTime: Math.round(avgTime * 100) / 100
    }
  };
}

async function generatePerformanceReport(startDate: Date, zoneId: number | null) {
  // Implementation would go here
  return {
    reportType: 'performance',
    message: 'Performance report generation not implemented yet'
  };
}

async function generateSLAReport(startDate: Date, zoneId: number | null) {
  // Implementation would go here
  return {
    reportType: 'sla',
    message: 'SLA report generation not implemented yet'
  };
}