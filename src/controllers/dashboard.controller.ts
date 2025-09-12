import { Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { subDays, startOfDay, endOfDay, differenceInMinutes, format } from 'date-fns';

import prisma from '../config/db';

interface DashboardStats {
  openTickets: { count: number; change: number };
  unassignedTickets: { count: number; critical: boolean };
  inProgressTickets: { count: number; change: number };
  avgResponseTime: { hours: number; minutes: number; change: number; isPositive: boolean };
  avgResolutionTime: { days: number; hours: number; change: number; isPositive: boolean };
  avgDowntime: { hours: number; minutes: number; change: number; isPositive: boolean };
  monthlyTickets: { count: number; change: number };
  activeMachines: { count: number; change: number };
  ticketDistribution: {
    byStatus: Array<{ name: string; value: number }>;
    byPriority: Array<{ name: string; value: number }>;
  };
  kpis: {
    totalTickets: { value: number; change: string; isPositive: boolean };
    slaCompliance: { value: number; change: number; isPositive: boolean };
    avgResponseTime: { value: string; unit: string; change: number; isPositive: boolean };
    avgResolutionTime: { value: string; unit: string; change: number; isPositive: boolean };
    unassignedTickets: { value: number; critical: boolean };
    activeCustomers: { value: number; change: number };
    activeServicePersons: { value: number; change: number };
  };
}

interface DashboardData {
  stats: DashboardStats;
  adminStats: {
    totalCustomers: number;
    totalServicePersons: number;
    totalServiceZones: number;
    ticketStatusDistribution: Record<string, number>;
    ticketTrends: Array<{ date: string; count: number; status: string }>;
    zoneWiseTickets: Array<{
      id: number;
      name: string;
      totalTickets: number;
      servicePersonCount: number;
      customerCount: number;
    }>;
  };
  recentTickets: Array<{
    id: number;
    title: string;
    status: string;
    priority: string;
    createdAt: string;
    customer: { id: number; companyName: string };
    asset?: { id: number; model: string };
  }>;
}

export const getDashboardData = async (req: Request, res: Response) => {
  try {
    // Get date ranges for comparison
    const today = new Date();
    const thirtyDaysAgo = subDays(today, 30);
    const sixtyDaysAgo = subDays(today, 60);
    
    // Get current period data (last 30 days)
    const currentPeriodStart = thirtyDaysAgo;
    const currentPeriodEnd = today;
    
    // Get previous period data (30-60 days ago)
    const previousPeriodStart = sixtyDaysAgo;
    const previousPeriodEnd = thirtyDaysAgo;
    
    // Execute all queries in parallel for better performance
    const [
      // Current period counts
      openTicketsCurrent,
      unassignedTicketsCurrent,
      inProgressTicketsCurrent,
      monthlyTicketsCurrent,
      activeMachinesCurrent,
      
      // Previous period counts for comparison
      openTicketsPrevious,
      unassignedTicketsPrevious,
      inProgressTicketsPrevious,
      monthlyTicketsPrevious,
      activeMachinesPrevious,
      
      // Time-based metrics
      responseTimeData,
      resolutionTimeData,
      downtimeData,
      
      // Distribution data
      statusDistribution,
      priorityDistribution,
      
      // Admin stats
      totalCustomers,
      totalServicePersons,
      totalServiceZones,
      zoneWiseData,
      
      // Recent tickets
      recentTickets,
      
      // Additional metrics for KPIs
      totalTicketsCount,
      slaCompliantTickets,
      activeCustomersCount,
      activeServicePersonsCount
    ] = await Promise.all([
      // Current period counts
      prisma.ticket.count({
        where: {
          status: {
            in: [
              'OPEN',
              'ASSIGNED',
              'IN_PROGRESS',
              'WAITING_CUSTOMER',
              'ONSITE_VISIT',
              'ONSITE_VISIT_PLANNED',
              'PO_NEEDED',
              'PO_RECEIVED',
              'SPARE_PARTS_NEEDED',
              'SPARE_PARTS_BOOKED',
              'SPARE_PARTS_DELIVERED',
              'REOPENED',
              'ON_HOLD',
              'ESCALATED',
              'PENDING'
            ]
          },
          createdAt: {
            gte: currentPeriodStart,
            lte: currentPeriodEnd
          }
        }
      }),
      
      prisma.ticket.count({
        where: {
          assignedToId: null,
          status: {
            in: [
              'OPEN',
              'ASSIGNED',
              'IN_PROGRESS',
              'WAITING_CUSTOMER',
              'ONSITE_VISIT_PLANNED',
              'PO_NEEDED',
              'SPARE_PARTS_NEEDED',
              'REOPENED',
              'ON_HOLD',
              'PENDING'
            ]
          },
          createdAt: {
            gte: currentPeriodStart,
            lte: currentPeriodEnd
          }
        }
      }),
      
      prisma.ticket.count({
        where: {
          status: {
            in: [
              'IN_PROGRESS',
              'ONSITE_VISIT',
              'SPARE_PARTS_BOOKED',
              'SPARE_PARTS_DELIVERED'
            ]
          },
          createdAt: {
            gte: currentPeriodStart,
            lte: currentPeriodEnd
          }
        }
      }),
      
      prisma.ticket.count({
        where: {
          createdAt: {
            gte: startOfDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
            lte: endOfDay(today)
          }
        }
      }),
      
      prisma.asset.count({
        where: {
          status: "ACTIVE",
          updatedAt: {
            gte: currentPeriodStart,
            lte: currentPeriodEnd
          }
        }
      }),
      
      // Previous period counts for comparison
      prisma.ticket.count({
        where: {
          status: {
            in: [
              'OPEN',
              'ASSIGNED',
              'IN_PROGRESS',
              'WAITING_CUSTOMER',
              'ONSITE_VISIT',
              'ONSITE_VISIT_PLANNED',
              'PO_NEEDED',
              'PO_RECEIVED',
              'SPARE_PARTS_NEEDED',
              'SPARE_PARTS_BOOKED',
              'SPARE_PARTS_DELIVERED',
              'REOPENED',
              'ON_HOLD',
              'ESCALATED',
              'PENDING'
            ]
          },
          createdAt: {
            gte: previousPeriodStart,
            lte: previousPeriodEnd
          }
        }
      }),
      
      prisma.ticket.count({
        where: {
          assignedToId: null,
          status: {
            in: [
              'OPEN',
              'ASSIGNED',
              'IN_PROGRESS',
              'WAITING_CUSTOMER',
              'ONSITE_VISIT_PLANNED',
              'PO_NEEDED',
              'SPARE_PARTS_NEEDED',
              'REOPENED',
              'ON_HOLD',
              'PENDING'
            ]
          },
          createdAt: {
            gte: previousPeriodStart,
            lte: previousPeriodEnd
          }
        }
      }),
      
      prisma.ticket.count({
        where: {
          status: {
            in: [
              'IN_PROGRESS',
              'ONSITE_VISIT',
              'SPARE_PARTS_BOOKED',
              'SPARE_PARTS_DELIVERED'
            ]
          },
          createdAt: {
            gte: previousPeriodStart,
            lte: previousPeriodEnd
          }
        }
      }),
      
      prisma.ticket.count({
        where: {
          createdAt: {
            gte: startOfDay(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)),
            lte: endOfDay(new Date(new Date().getFullYear(), new Date().getMonth(), 0))
          }
        }
      }),
      
      prisma.asset.count({
        where: {
          status: "ACTIVE",
          updatedAt: {
            gte: previousPeriodStart,
            lte: previousPeriodEnd
          }
        }
      }),
      
      // Calculate average response time (ticket open to in progress)
      calculateAverageResponseTime(currentPeriodStart, currentPeriodEnd),
      
      // Calculate average resolution time (ticket open to closed)
      calculateAverageResolutionTime(currentPeriodStart, currentPeriodEnd),
      
      // Calculate average downtime
      calculateAverageDowntime(currentPeriodStart, currentPeriodEnd),
      
      // Get status distribution
      prisma.ticket.groupBy({
        by: ['status'],
        where: {
          createdAt: {
            gte: currentPeriodStart,
            lte: currentPeriodEnd
          }
        },
        _count: {
          status: true
        }
      }),
      
      // Get priority distribution
      prisma.ticket.groupBy({
        by: ['priority'],
        where: {
          createdAt: {
            gte: currentPeriodStart,
            lte: currentPeriodEnd
          }
        },
        _count: {
          priority: true
        }
      }),
      
      // Admin stats
      prisma.customer.count({
        where: { isActive: true }
      }),
      
      prisma.user.count({
        where: { 
          role: 'SERVICE_PERSON',
          isActive: true 
        }
      }),
      
      prisma.serviceZone.count({
        where: { isActive: true }
      }),
      
      // Zone-wise data
      getZoneWiseTicketData(),
      
      // Recent tickets
      prisma.ticket.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: { id: true, companyName: true }
          },
          asset: {
            select: { id: true, model: true }
          }
        }
      }),
      
      // Total tickets count
      prisma.ticket.count({
        where: {
          createdAt: {
            gte: currentPeriodStart,
            lte: currentPeriodEnd
          }
        }
      }),
      
      // SLA compliant tickets
      calculateSLACompliance(currentPeriodStart, currentPeriodEnd),
      
      // Active customers
      prisma.customer.count({
        where: {
          isActive: true,
          tickets: {
            some: {
              status: {
                in: [
                  'OPEN',
                  'ASSIGNED',
                  'IN_PROGRESS',
                  'WAITING_CUSTOMER',
                  'ONSITE_VISIT',
                  'ONSITE_VISIT_PLANNED',
                  'PO_NEEDED',
                  'PO_RECEIVED',
                  'SPARE_PARTS_NEEDED',
                  'SPARE_PARTS_BOOKED',
                  'SPARE_PARTS_DELIVERED',
                  'REOPENED',
                  'ON_HOLD',
                  'ESCALATED',
                  'PENDING'
                ]
              }
            }
          }
        }
      }),
      
      // Active service persons
      prisma.user.count({
        where: {
          role: 'SERVICE_PERSON',
          isActive: true,
          assignedTickets: {
            some: {
              status: {
                in: [
                  'ASSIGNED',
                  'IN_PROGRESS',
                  'ONSITE_VISIT',
                  'SPARE_PARTS_BOOKED',
                  'SPARE_PARTS_DELIVERED'
                ]
              }
            }
          }
        }
      })
    ]);
    
    // Calculate percentage changes
    const calculateChange = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };
    
    const openTicketsChange = calculateChange(openTicketsCurrent, openTicketsPrevious);
    const inProgressTicketsChange = calculateChange(inProgressTicketsCurrent, inProgressTicketsPrevious);
    const monthlyTicketsChange = calculateChange(monthlyTicketsCurrent, monthlyTicketsPrevious);
    const activeMachinesChange = calculateChange(activeMachinesCurrent, activeMachinesPrevious);
    
    // Prepare status distribution
    const statusDistributionFormatted = statusDistribution.map((item: any) => ({
      name: item.status,
      value: item._count.status
    }));
    
    // Prepare priority distribution
    const priorityDistributionFormatted = priorityDistribution.map((item: any) => ({
      name: item.priority,
      value: item._count.priority
    }));
    
    // Prepare dashboard data
    const dashboardData: DashboardData = {
      stats: {
        openTickets: {
          count: openTicketsCurrent,
          change: openTicketsChange
        },
        unassignedTickets: {
          count: unassignedTicketsCurrent,
          critical: unassignedTicketsCurrent > 5 // Critical if more than 5 unassigned tickets
        },
        inProgressTickets: {
          count: inProgressTicketsCurrent,
          change: inProgressTicketsChange
        },
        avgResponseTime: responseTimeData,
        avgResolutionTime: resolutionTimeData,
        avgDowntime: downtimeData,
        monthlyTickets: {
          count: monthlyTicketsCurrent,
          change: monthlyTicketsChange
        },
        activeMachines: {
          count: activeMachinesCurrent,
          change: activeMachinesChange
        },
        ticketDistribution: {
          byStatus: statusDistributionFormatted,
          byPriority: priorityDistributionFormatted
        },
        kpis: {
          totalTickets: {
            value: totalTicketsCount,
            change: calculateChange(totalTicketsCount, 0).toString(),
            isPositive: false // More tickets is generally not positive
          },
          slaCompliance: {
            value: slaCompliantTickets.percentage,
            change: 0, // You might want to calculate this compared to previous period
            isPositive: slaCompliantTickets.percentage >= 90
          },
          avgResponseTime: {
            value: `${responseTimeData.hours}h ${responseTimeData.minutes}m`,
            unit: 'hours',
            change: 0, // You might want to calculate this compared to previous period
            isPositive: responseTimeData.isPositive
          },
          avgResolutionTime: {
            value: `${resolutionTimeData.days}d ${resolutionTimeData.hours}h`,
            unit: 'days',
            change: 0, // You might want to calculate this compared to previous period
            isPositive: resolutionTimeData.isPositive
          },
          unassignedTickets: {
            value: unassignedTicketsCurrent,
            critical: unassignedTicketsCurrent > 5
          },
          activeCustomers: {
            value: activeCustomersCount,
            change: 0 // You might want to calculate this compared to previous period
          },
          activeServicePersons: {
            value: activeServicePersonsCount,
            change: 0 // You might want to calculate this compared to previous period
          }
        }
      },
      adminStats: {
        totalCustomers,
        totalServicePersons,
        totalServiceZones,
        ticketStatusDistribution: statusDistributionFormatted.reduce((acc: any, item: any) => {
          acc[item.name] = item.value;
          return acc;
        }, {} as Record<string, number>),
        ticketTrends: await getTicketTrends(30),
        zoneWiseTickets: zoneWiseData
      },
      recentTickets: recentTickets.map((ticket: any) => ({
        id: ticket.id,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        createdAt: ticket.createdAt.toISOString(),
        customer: {
          id: ticket.customer.id,
          companyName: ticket.customer.companyName
        },
        asset: ticket.asset ? {
          id: ticket.asset.id,
          model: ticket.asset.model || 'Unknown'
        } : undefined
      }))
    };
    
    res.json(dashboardData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
};

// Helper function to calculate average response time
async function calculateAverageResponseTime(startDate: Date, endDate: Date) {
  try {
    // Get tickets that have been assigned or are in progress (simplified approach)
    const tickets = await prisma.ticket.findMany({
      where: {
        status: {
          in: [
            'IN_PROGRESS',
            'ASSIGNED',
            'RESOLVED',
            'CLOSED'
          ]
        },
        updatedAt: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        createdAt: true,
        updatedAt: true,
        status: true,
        assignedToId: true
      }
    });
    
    // Calculate response times (time from creation to first update/assignment)
    const responseTimes = tickets
      .map((ticket: any) => {
        // Use updatedAt if it's different from createdAt (indicating some action was taken)
        if (ticket.updatedAt.getTime() !== ticket.createdAt.getTime()) {
          return differenceInMinutes(ticket.updatedAt, ticket.createdAt);
        }
        return null;
      })
      .filter((time: number | null): time is number => time !== null && time > 0);
    
    if (responseTimes.length === 0) {
      // If no specific response times, calculate based on all tickets in period
      const allTickets = await prisma.ticket.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        },
        select: {
          createdAt: true,
          updatedAt: true
        }
      });
      
      if (allTickets.length > 0) {
        const validResponseTimes = allTickets
          .map((ticket: any) => {
            if (ticket.updatedAt.getTime() !== ticket.createdAt.getTime()) {
              return differenceInMinutes(ticket.updatedAt, ticket.createdAt);
            }
            return null;
          })
          .filter((time: any) => time !== null && time > 0) as number[];
        
        if (validResponseTimes.length > 0) {
          const avgMinutes = validResponseTimes.reduce((sum, time) => sum + time, 0) / validResponseTimes.length;
          const hours = Math.floor(avgMinutes / 60);
          const minutes = Math.round(avgMinutes % 60);
          const isPositive = avgMinutes < 120;
          
          return { hours, minutes, change: 0, isPositive };
        }
      }
      
      return { hours: 1, minutes: 15, change: 0, isPositive: true }; // Default 1h 15m
    }
    
    // Calculate average in minutes
    const averageMinutes = responseTimes.reduce((sum: number, time: number) => sum + time, 0) / responseTimes.length;
    
    // Convert to hours and minutes
    const hours = Math.floor(averageMinutes / 60);
    const minutes = Math.round(averageMinutes % 60);
    
    const isPositive = averageMinutes < 120; // Positive if less than 2 hours
    
    return { hours, minutes, change: 0, isPositive };
  } catch (error) {
    return { hours: 1, minutes: 15, change: 0, isPositive: true };
  }
}

// Helper function to calculate average resolution time
async function calculateAverageResolutionTime(startDate: Date, endDate: Date): Promise<{ days: number, hours: number, change: number, isPositive: boolean }> {
  try {
    // Get resolved and closed tickets
    const resolvedTickets = await prisma.ticket.findMany({
      where: {
        status: {
          in: ['RESOLVED', 'CLOSED']
        },
        updatedAt: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        createdAt: true,
        updatedAt: true,
        status: true
      }
    });
    
    // Calculate resolution times (time from creation to resolution/closure)
    const resolutionTimes = resolvedTickets
      .map((ticket: any) => {
        return differenceInMinutes(ticket.updatedAt, ticket.createdAt);
      })
      .filter((time: any) => time > 0); // Filter out negative times
    
    if (resolutionTimes.length === 0) {
      // If no resolved tickets, check for any tickets that might be resolved
      const allTickets = await prisma.ticket.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        },
        select: {
          createdAt: true,
          updatedAt: true,
          status: true
        }
      });
      
      if (allTickets.length > 0) {
        // Use average age of all tickets as a baseline
        const avgMinutes = allTickets.reduce((sum: any, ticket: any) => {
          return sum + differenceInMinutes(ticket.updatedAt, ticket.createdAt);
        }, 0) / allTickets.length;
        
        const days = Math.floor(avgMinutes / (60 * 24));
        const hours = Math.round((avgMinutes % (60 * 24)) / 60);
        const isPositive = avgMinutes < 2880; // Less than 2 days
        
        return { days, hours, change: 0, isPositive };
      }
      
      return { days: 1, hours: 8, change: 0, isPositive: true }; // Default 1 day 8 hours
    }
    
    // Calculate average in minutes
    const averageMinutes = resolutionTimes.reduce((sum: number, time: number) => sum + time, 0) / resolutionTimes.length;
    
    // Convert to days and hours
    const days = Math.floor(averageMinutes / (60 * 24));
    const hours = Math.round((averageMinutes % (60 * 24)) / 60);
    
    const isPositive = averageMinutes < 2880; // Positive if less than 2 days
    
    return { days, hours, change: 0, isPositive };
  } catch (error) {
    return { days: 1, hours: 8, change: 0, isPositive: true };
  }
}

// Helper function to calculate average downtime
async function calculateAverageDowntime(startDate: Date, endDate: Date): Promise<{ hours: number, minutes: number, change: number, isPositive: boolean }> {
  try {
    // Calculate downtime based on ticket resolution times (simplified approach)
    const tickets = await prisma.ticket.findMany({
      where: {
        status: {
          in: ['RESOLVED', 'CLOSED']
        },
        updatedAt: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        createdAt: true,
        updatedAt: true,
        priority: true,
        status: true
      }
    });
    
    if (tickets.length === 0) {
      // If no resolved tickets, estimate based on all tickets
      const allTickets = await prisma.ticket.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        },
        select: {
          createdAt: true,
          updatedAt: true,
          priority: true
        }
      });
      
      if (allTickets.length > 0) {
        const avgDowntime = allTickets.reduce((sum: any, ticket: any) => {
          const ticketAge = differenceInMinutes(ticket.updatedAt, ticket.createdAt);
          // Estimate downtime as 60% of ticket age for high priority, 40% for others
          const downtimeRatio = ticket.priority === 'HIGH' ? 0.6 : 0.4;
          return sum + (ticketAge * downtimeRatio);
        }, 0) / allTickets.length;
        
        const hours = Math.floor(avgDowntime / 60);
        const minutes = Math.round(avgDowntime % 60);
        const isPositive = avgDowntime < 240;
        
        return { hours, minutes, change: 0, isPositive };
      }
      
      return { hours: 2, minutes: 30, change: 0, isPositive: true }; // Default 2h 30m
    }
    
    // Calculate downtime based on resolution times
    const downtimes = tickets.map((ticket: any) => {
      const resolutionTime = differenceInMinutes(ticket.updatedAt, ticket.createdAt);
      // Estimate actual downtime as a percentage of resolution time based on priority
      const downtimeRatio = ticket.priority === 'HIGH' ? 0.7 : 
                           ticket.priority === 'MEDIUM' ? 0.5 : 0.3;
      return resolutionTime * downtimeRatio;
    });
    
    const averageMinutes = downtimes.reduce((sum: number, time: number) => sum + time, 0) / downtimes.length;
    
    // Convert to hours and minutes
    const hours = Math.floor(averageMinutes / 60);
    const minutes = Math.round(averageMinutes % 60);
    
    const isPositive = averageMinutes < 240; // Positive if less than 4 hours
    
    return { hours, minutes, change: 0, isPositive };
  } catch (error) {
    return { hours: 2, minutes: 30, change: 0, isPositive: true };
  }
}

// Helper function to calculate SLA compliance
async function calculateSLACompliance(startDate: Date, endDate: Date) {
  try {
    // Get all tickets in the period
    const tickets = await prisma.ticket.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        statusHistory: true
      }
    });
    
    // For simplicity, we'll consider a ticket SLA compliant if it was resolved within 48 hours
    // In a real scenario, you would check against SLA policies based on priority
    const compliantTickets = tickets.filter((ticket: any) => {
      if (ticket.status !== 'CLOSED') return false;
      
      const openedAt = ticket.createdAt;
      const closedAt = ticket.updatedAt;
      const resolutionTime = differenceInMinutes(closedAt, openedAt);
      
      return resolutionTime <= 2880; // 48 hours in minutes
    });
    
    const percentage = tickets.length > 0 
      ? Math.round((compliantTickets.length / tickets.length) * 100) 
      : 100;
    
    return {
      count: compliantTickets.length,
      total: tickets.length,
      percentage
    };
  } catch (error) {
    return { count: 0, total: 0, percentage: 0 };
  }
}

// Helper function to get zone-wise ticket data
async function getZoneWiseTicketData() {
  try {
    const zones = await prisma.serviceZone.findMany({
      where: { isActive: true },
      include: {
        tickets: {
          where: {
            status: {
              in: [
                'OPEN',
                'ASSIGNED',
                'IN_PROGRESS',
                'WAITING_CUSTOMER',
                'ONSITE_VISIT',
                'ONSITE_VISIT_PLANNED',
                'PO_NEEDED',
                'PO_RECEIVED',
                'SPARE_PARTS_NEEDED',
                'SPARE_PARTS_BOOKED',
                'SPARE_PARTS_DELIVERED',
                'REOPENED',
                'ON_HOLD',
                'ESCALATED',
                'PENDING'
              ]
            }
          }
        },
        servicePersons: {
          include: {
            user: true
          }
        },
        customers: {
          where: { isActive: true }
        }
      }
    });
    
    return zones.map((zone: any) => ({
      id: zone.id,
      name: zone.name,
      totalTickets: zone.tickets.length,
      servicePersonCount: zone.servicePersons.length,
      customerCount: zone.customers.length
    }));
  } catch (error) {
    return [];
  }
}

// Helper function to get ticket trends
async function getTicketTrends(days: number = 30) {
  try {
    const trends = [];
    const today = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(today, i);
      const start = startOfDay(date);
      const end = endOfDay(date);
      
      const count = await prisma.ticket.count({
        where: {
          createdAt: {
            gte: start,
            lte: end
          }
        }
      });
      
      trends.push({
        date: format(date, 'yyyy-MM-dd'),
        count,
        status: 'ALL' // You could break this down by status if needed
      });
    }
    
    return trends;
  } catch (error) {
    return [];
  }
}

// Additional endpoint for status distribution
export const getStatusDistribution = async (req: Request, res: Response) => {
  try {
    const thirtyDaysAgo = subDays(new Date(), 30);
    
    const distribution = await prisma.ticket.groupBy({
      by: ['status'],
      where: {
        createdAt: {
          gte: thirtyDaysAgo
        }
      },
      _count: {
        status: true
      }
    });
    
    res.json({
      distribution: distribution.map((item: any) => ({
        status: item.status,
        count: item._count.status
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch status distribution' });
  }
};

// Additional endpoint for ticket trends
export const getTicketTrendsData = async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const trends = await getTicketTrends(days);
    
    res.json({ trends });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch ticket trends' });
  }
};