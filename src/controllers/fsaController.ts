// controllers/fsaController.ts
import { Request, Response } from 'express';
import { Prisma, PrismaClient, UserRole, TicketStatus, Priority, SLAStatus } from '@prisma/client';
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
    
    // Verify user has access to this zone
    const userZoneIds = user.zoneIds || [];
    const targetZoneId = parseInt(zoneId);
    
    if (!userZoneIds.includes(targetZoneId) && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Access denied to this zone' });
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
    prisma.$queryRaw`
      SELECT 
        DATE("createdAt") as date,
        COUNT(*) as count
      FROM "Ticket"
      WHERE "createdAt" >= ${startDate}
      ${zoneIds?.length ? Prisma.sql`AND "zoneId" IN (${Prisma.join(zoneIds)})` : Prisma.empty}
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
  const totalTickets = ticketsByStatus.reduce((sum, item) => sum + item._count.id, 0);
  const resolvedTickets = ticketsByStatus
    .filter(item => item.status === 'RESOLVED' || item.status === 'CLOSED')
    .reduce((sum, item) => sum + item._count.id, 0);
  
  const resolutionRate = totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0;
  
  // Calculate average resolution time
  const allResolvedTickets = serviceZones.flatMap(zone => zone.tickets);
  const totalResolutionTime = allResolvedTickets.reduce((sum, ticket) => {
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
      byStatus: ticketsByStatus.map(item => ({
        status: item.status,
        count: item._count.id,
        percentage: totalTickets > 0 ? (item._count.id / totalTickets) * 100 : 0
      })),
      byPriority: ticketsByPriority.map(item => ({
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
      topPerformers: topPerformers.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        resolvedTickets: user._count.assignedTickets,
        avgResolutionTime: user.assignedTickets.length > 0
          ? (user.assignedTickets.reduce((sum, ticket) => {
              if (!ticket.updatedAt) return sum;
              return sum + differenceInHours(ticket.updatedAt, ticket.createdAt);
            }, 0) / user.assignedTickets.length).toFixed(2)
          : '0'
      })),
      zonePerformance: zonePerformance.map(zone => {
        const resolvedTickets = zone.tickets.filter(t => 
          t.status === 'RESOLVED' || t.status === 'CLOSED'
        );
        
        const totalResolutionTime = resolvedTickets.reduce((sum, ticket) => {
          if (!ticket.updatedAt) return sum;
          return sum + differenceInHours(ticket.updatedAt, ticket.createdAt);
        }, 0);
        
        const avgResolutionTime = resolvedTickets.length > 0 
          ? (totalResolutionTime / resolvedTickets.length).toFixed(2) 
          : '0';
          
        const criticalTickets = resolvedTickets.filter(t => t.priority === 'CRITICAL').length;
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
          activeCustomers: zone.customers.filter(c => c._count.tickets > 0).length
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
      }
    }
  });
  
  if (!user || !user.customer) {
    throw new Error('User or customer not found');
  }
  
  const customer = user.customer;
  const tickets = customer.tickets;
  
  // Calculate metrics
  const totalTickets = tickets.length;
  const openTickets = tickets.filter(t => 
    t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED'
  ).length;
  
  const resolvedTickets = tickets.filter(t => 
    t.status === 'RESOLVED' || t.status === 'CLOSED'
  ).length;
  
  const resolutionRate = totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0;
  
  // Calculate average resolution time for resolved tickets
  const resolvedTicketsWithTime = tickets.filter(t => 
    (t.status === 'RESOLVED' || t.status === 'CLOSED') && t.updatedAt
  );
  
  const totalResolutionTime = resolvedTicketsWithTime.reduce((sum, ticket) => {
    return sum + differenceInHours(ticket.updatedAt!, ticket.createdAt);
  }, 0);
  
  const avgResolutionTime = resolvedTicketsWithTime.length > 0 
    ? (totalResolutionTime / resolvedTicketsWithTime.length).toFixed(2) 
    : '0';
    
  // Group tickets by status
  const statusCounts = tickets.reduce((acc, ticket) => {
    acc[ticket.status] = (acc[ticket.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Group tickets by priority
  const priorityCounts = tickets.reduce((acc, ticket) => {
    acc[ticket.priority] = (acc[ticket.priority] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Get recent activity
  const recentTickets = tickets
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10)
    .map(ticket => ({
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
        percentage: totalTickets > 0 ? (count / totalTickets) * 100 : 0
      })),
      byPriority: Object.entries(priorityCounts).map(([priority, count]) => ({
        priority,
        count,
        percentage: totalTickets > 0 ? (count / totalTickets) * 100 : 0
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
  const openTickets = tickets.filter(t => 
    t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED'
  ).length;
  
  const resolvedTickets = tickets.filter(t => 
    t.status === 'RESOLVED' || t.status === 'CLOSED'
  ).length;
  
  const resolutionRate = totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0;
  
  // Calculate average resolution time for resolved tickets
  const resolvedTicketsWithTime = tickets.filter(t => 
    (t.status === 'RESOLVED' || t.status === 'CLOSED') && t.updatedAt
  );
  
  const totalResolutionTime = resolvedTicketsWithTime.reduce((sum, ticket) => {
    return sum + differenceInHours(ticket.updatedAt!, ticket.createdAt);
  }, 0);
  
  const avgResolutionTime = resolvedTicketsWithTime.length > 0 
    ? (totalResolutionTime / resolvedTicketsWithTime.length).toFixed(2) 
    : '0';
    
  // Group tickets by status
  const statusCounts = tickets.reduce((acc, ticket) => {
    acc[ticket.status] = (acc[ticket.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Group tickets by priority
  const priorityCounts = tickets.reduce((acc, ticket) => {
    acc[ticket.priority] = (acc[ticket.priority] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Group tickets by zone
  const zoneCounts = tickets.reduce((acc, ticket) => {
    const zoneName = ticket.customer.serviceZone.name;
    acc[zoneName] = (acc[zoneName] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Get recent activity
  const recentTickets = tickets
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10)
    .map(ticket => ({
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
        percentage: totalTickets > 0 ? (count / totalTickets) * 100 : 0
      })),
      byPriority: Object.entries(priorityCounts).map(([priority, count]) => ({
        priority,
        count,
        percentage: totalTickets > 0 ? (count / totalTickets) * 100 : 0
      })),
      byZone: Object.entries(zoneCounts).map(([zone, count]) => ({
        zone,
        count,
        percentage: totalTickets > 0 ? (count / totalTickets) * 100 : 0
      }))
    },
    recentActivity: {
      tickets: recentTickets
    },
    assignedZones: user.serviceZones.map(sz => ({
      id: sz.serviceZone.id,
      name: sz.serviceZone.name
    }))
  };
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
  const openTickets = tickets.filter(t => 
    t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED'
  ).length;
  
  const resolvedTickets = tickets.filter(t => 
    t.status === 'RESOLVED' || t.status === 'CLOSED'
  ).length;
  
  const resolutionRate = totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0;
  
  // Calculate average resolution time for resolved tickets
  const resolvedTicketsWithTime = tickets.filter(t => 
    (t.status === 'RESOLVED' || t.status === 'CLOSED') && t.updatedAt
  );
  
  const totalResolutionTime = resolvedTicketsWithTime.reduce((sum, ticket) => {
    return sum + differenceInHours(ticket.updatedAt!, ticket.createdAt);
  }, 0);
  
  const avgResolutionTime = resolvedTicketsWithTime.length > 0 
    ? (totalResolutionTime / resolvedTicketsWithTime.length).toFixed(2) 
    : '0';
  
  // Calculate SLA compliance
  const slaCompliance = await calculateSlaCompliance([zoneId]);
  
  // Group tickets by status
  const statusCounts = tickets.reduce((acc, ticket) => {
    acc[ticket.status] = (acc[ticket.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Group tickets by priority
  const priorityCounts = tickets.reduce((acc, ticket) => {
    acc[ticket.priority] = (acc[ticket.priority] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Customer performance
  const customerPerformance = zone.customers.map(customer => {
    const customerTickets = customer.tickets;
    const resolvedCustomerTickets = customerTickets.filter(t => 
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
  const servicePersonPerformance = zone.servicePersons.map(sp => {
    const user = sp.user;
    const userTickets = user.assignedTickets;
    const resolvedUserTickets = userTickets.filter(t => 
      t.status === 'RESOLVED' || t.status === 'CLOSED'
    );
    
    const userResolutionRate = userTickets.length > 0 
      ? (resolvedUserTickets.length / userTickets.length) * 100 
      : 0;
    
    // Calculate average resolution time
    const resolvedTicketsWithTime = userTickets.filter(t => 
      (t.status === 'RESOLVED' || t.status === 'CLOSED') && t.updatedAt
    );
    
    const totalResolutionTime = resolvedTicketsWithTime.reduce((sum, ticket) => {
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
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10)
    .map(ticket => ({
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
        percentage: totalTickets > 0 ? (count / totalTickets) * 100 : 0
      })),
      byPriority: Object.entries(priorityCounts).map(([priority, count]) => ({
        priority,
        count,
        percentage: totalTickets > 0 ? (count / totalTickets) * 100 : 0
      }))
    },
    performance: {
      customers: customerPerformance.sort((a, b) => b.ticketCount - a.ticketCount),
      servicePersons: servicePersonPerformance.sort((a, b) => b.resolvedTickets - a.resolvedTickets)
    },
    recentActivity: {
      tickets: recentTickets
    }
  };
}

async function getUserPerformanceAnalytics(userId: number, days: number) {
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
      }
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  let tickets = [];
  let userType = '';
  
  if (user.role === 'ZONE_USER' && user.customer) {
    tickets = user.customer.tickets;
    userType = 'ZONE_USER';
  } else if (user.role === 'SERVICE_PERSON') {
    tickets = user.assignedTickets;
    userType = 'SERVICE_PERSON';
  } else {
    throw new Error('User type not supported for performance analytics');
  }
  
  // Calculate metrics
  const totalTickets = tickets.length;
  const openTickets = tickets.filter(t => 
    t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED'
  ).length;
  
  const resolvedTickets = tickets.filter(t => 
    t.status === 'RESOLVED' || t.status === 'CLOSED'
  ).length;
  
  const resolutionRate = totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0;
  
  // Calculate average resolution time for resolved tickets
  const resolvedTicketsWithTime = tickets.filter(t => 
    (t.status === 'RESOLVED' || t.status === 'CLOSED') && t.updatedAt
  );
  
  const totalResolutionTime = resolvedTicketsWithTime.reduce((sum, ticket) => {
    return sum + differenceInHours(ticket.updatedAt!, ticket.createdAt);
  }, 0);
  
  const avgResolutionTime = resolvedTicketsWithTime.length > 0 
    ? (totalResolutionTime / resolvedTicketsWithTime.length).toFixed(2) 
    : '0';
  
  // Group tickets by status
  const statusCounts = tickets.reduce((acc, ticket) => {
    acc[ticket.status] = (acc[ticket.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Group tickets by priority
  const priorityCounts = tickets.reduce((acc, ticket) => {
    acc[ticket.priority] = (acc[ticket.priority] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // For service persons, group by zone
  let zoneCounts: Record<string, number> = {};
  if (user.role === 'SERVICE_PERSON') {
    zoneCounts = tickets.reduce((acc: Record<string, number>, ticket: any) => {
      const zoneName = ticket.customer?.serviceZone?.name || 'Unknown';
      acc[zoneName] = (acc[zoneName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
  
  // Recent activity
  const recentTickets = tickets
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10)
    .map(ticket => ({
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      ...(user.role === 'SERVICE_PERSON' && {
        customer: (ticket as any).customer?.companyName || 'Unknown',
        zone: (ticket as any).customer?.serviceZone?.name || 'Unknown'
      }),
      lastStatusChange: ticket.statusHistory[0]?.changedAt || ticket.createdAt
    }));
  
  return {
    userInfo: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      ...(user.role === 'ZONE_USER' && user.customer && {
        customer: user.customer.companyName,
        zone: user.customer.serviceZone.name
      })
    },
    overview: {
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
        percentage: totalTickets > 0 ? (count / totalTickets) * 100 : 0
      })),
      byPriority: Object.entries(priorityCounts).map(([priority, count]) => ({
        priority,
        count,
        percentage: totalTickets > 0 ? (count / totalTickets) * 100 : 0
      })),
      ...(user.role === 'SERVICE_PERSON' && {
        byZone: Object.entries(zoneCounts).map(([zone, count]) => ({
          zone,
          count,
          percentage: totalTickets > 0 ? (count / totalTickets) * 100 : 0
        }))
      })
    },
    recentActivity: {
      tickets: recentTickets
    }
  };
}

async function getServicePersonPerformanceAnalytics(servicePersonId: number, days: number) {
  // This is essentially the same as getUserPerformanceAnalytics for SERVICE_PERSON role
  return getUserPerformanceAnalytics(servicePersonId, days);
}

// Helper function to build zone filter for tickets
function buildTicketZoneFilter(zoneIds: number[] | null, includeAllZones: boolean = false) {
  if (includeAllZones || !zoneIds?.length) return {};
  
  return {
    customer: {
      serviceZoneId: { in: zoneIds }
    }
  };
}

// Helper function to calculate SLA compliance rate
async function calculateSlaCompliance(zoneIds: number[] | null = null) {
  const now = new Date();
  const thirtyDaysAgo = subDays(now, 30);
  
  // First, get the closed tickets
  const closedTickets = await prisma.ticket.findMany({
    where: {
      ...buildTicketZoneFilter(zoneIds),
      status: { in: ['RESOLVED', 'CLOSED'] },
      updatedAt: { gte: thirtyDaysAgo }
    },
    select: {
      priority: true,
      id: true,
      createdAt: true,
      updatedAt: true,
      customer: {
        select: {
          serviceZoneId: true
        }
      }
    }
  });

  // Calculate SLA compliance based on closed tickets
  const totalClosedTickets = closedTickets.length;
  if (totalClosedTickets === 0) return 100;

  // Count tickets that met SLA (assuming 24-hour SLA for all priorities for now)
  const metSlaCount = closedTickets.filter(ticket => {
    if (!ticket.updatedAt) return false;
    const resolutionTime = ticket.updatedAt.getTime() - ticket.createdAt.getTime();
    return resolutionTime <= 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  }).length;

  return Math.round((metSlaCount / totalClosedTickets) * 100);
}

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
      ? recentTickets.reduce((sum, ticket) => {
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

    res.json(serializeBigInts(realTimeMetrics));
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

    const resourceRequirements = zones.map(zone => ({
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

    res.json(serializeBigInts(predictiveAnalytics));
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

    const performanceMetrics = servicePersons.map(person => {
      const tickets = person.assignedTickets;
      const resolvedTickets = tickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED');
      const criticalTickets = tickets.filter(t => t.priority === 'CRITICAL');
      
      // Calculate metrics
      const efficiency = tickets.length > 0 ? (resolvedTickets.length / tickets.length) * 100 : 0;
      const productivity = resolvedTickets.length;
      const firstCallResolution = criticalTickets.length > 0 
        ? (criticalTickets.filter(t => t.status === 'RESOLVED').length / criticalTickets.length) * 100 
        : 100;

      const avgResponseTime = resolvedTickets.length > 0
        ? resolvedTickets.reduce((sum, ticket) => {
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

    res.json(serializeBigInts(performanceMetrics));
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

    res.json(equipmentAnalytics);
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

    const satisfactionMetrics = customers.map(customer => {
      const tickets = customer.tickets;
      const resolvedTickets = tickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED');
      
      const resolutionRate = tickets.length > 0 ? (resolvedTickets.length / tickets.length) * 100 : 0;
      const avgResolutionTime = resolvedTickets.length > 0
        ? resolvedTickets.reduce((sum, ticket) => {
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
        satisfactionMetrics.reduce((sum, m) => sum + m.satisfactionScore, 0) / satisfactionMetrics.length
      ),
      totalCustomers: customers.length,
      activeCustomers: satisfactionMetrics.filter(m => m.totalTickets > 0).length,
      highSatisfaction: satisfactionMetrics.filter(m => m.satisfactionScore >= 80).length,
      lowSatisfaction: satisfactionMetrics.filter(m => m.satisfactionScore < 60).length
    };

    res.json(serializeBigInts({
      overall: overallMetrics,
      customers: satisfactionMetrics.slice(0, 50) // Limit for performance
    }));
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

    const resourceOptimization = zones.map(zone => {
      const totalTickets = zone._count.tickets;
      const servicePersons = zone._count.servicePersons;
      const workloadPerPerson = servicePersons > 0 ? totalTickets / servicePersons : 0;
      
      const criticalTickets = zone.tickets.filter(t => t.priority === 'CRITICAL').length;
      const openTickets = zone.tickets.filter(t => t.status !== 'RESOLVED' && t.status !== 'CLOSED').length;
      
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
      overloadedZones: resourceOptimization.filter(z => z.recommendation === 'add_resources').length,
      underutilizedZones: resourceOptimization.filter(z => z.recommendation === 'reduce_resources').length,
      optimalZones: resourceOptimization.filter(z => z.recommendation === 'optimal').length,
      averageEfficiency: Math.round(
        resourceOptimization.reduce((sum, z) => sum + z.efficiency, 0) / resourceOptimization.length
      )
    };

    res.json(serializeBigInts({
      summary,
      zones: resourceOptimization
    }));
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
    ? avgResolutionTime.reduce((sum, ticket) => {
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