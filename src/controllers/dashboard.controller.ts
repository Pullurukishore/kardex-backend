import { Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { subDays, startOfDay, endOfDay, differenceInMinutes, format, getDay, setHours, setMinutes, setSeconds, setMilliseconds, addDays, isBefore, isAfter } from 'date-fns';

import prisma from '../config/db';

interface DashboardStats {
  openTickets: { count: number; change: number };
  unassignedTickets: { count: number; critical: boolean };
  inProgressTickets: { count: number; change: number };
  avgResponseTime: { hours: number; minutes: number; change: number; isPositive: boolean };
  avgResolutionTime: { days: number; hours: number; change: number; isPositive: boolean };
  avgDowntime: { hours: number; minutes: number; change: number; isPositive: boolean };
  avgTravelTime: { hours: number; minutes: number; change: number; isPositive: boolean };
  avgOnsiteResolutionTime: { hours: number; minutes: number; change: number; isPositive: boolean };
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
      avgResolutionTimeHours: number;
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
      travelTimeData,
      onsiteResolutionTimeData,
      
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
      
      // Calculate average travel time
      calculateAverageTravelTime(currentPeriodStart, currentPeriodEnd),
      
      // Calculate average onsite resolution time
      calculateAverageOnsiteResolutionTime(currentPeriodStart, currentPeriodEnd),
      
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
        avgTravelTime: travelTimeData,
        avgOnsiteResolutionTime: onsiteResolutionTimeData,
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
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Helper function to calculate average response time
async function calculateAverageResponseTime(startDate: Date, endDate: Date) {
  try {
    // Get tickets that have moved from OPEN to ASSIGNED status within the time period
    const ticketsWithStatusHistory = await prisma.ticket.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        id: true,
        createdAt: true,
        statusHistory: {
          where: {
            status: {
              in: ['OPEN', 'ASSIGNED']
            }
          },
          orderBy: {
            changedAt: 'asc'
          },
          select: {
            status: true,
            changedAt: true
          }
        }
      }
    });
    
    // Calculate response times (time from OPEN to ASSIGNED)
    const responseTimes = ticketsWithStatusHistory
      .map((ticket: any) => {
        const statusHistory = ticket.statusHistory;
        
        // Find the OPEN status record (should be the first one)
        const openStatus = statusHistory.find((h: any) => h.status === 'OPEN');
        // Find the ASSIGNED status record
        const assignedStatus = statusHistory.find((h: any) => h.status === 'ASSIGNED');
        
        if (openStatus && assignedStatus) {
          // Calculate business hours from OPEN to ASSIGNED
          return calculateBusinessHoursInMinutes(openStatus.changedAt, assignedStatus.changedAt);
        } else if (statusHistory.length > 0) {
          // Fallback: if no clear OPEN->ASSIGNED transition, use creation time to first status change
          const firstStatusChange = statusHistory[0];
          if (firstStatusChange.status !== 'OPEN') {
            return calculateBusinessHoursInMinutes(ticket.createdAt, firstStatusChange.changedAt);
          }
        }
        
        return null;
      })
      .filter((time: number | null): time is number => time !== null && time > 0);
    
    if (responseTimes.length === 0) {
      // If no tickets with proper status transitions, return zeros
      return { hours: 0, minutes: 0, change: 0, isPositive: true };
    }
    
    // Calculate average in minutes
    const averageMinutes = responseTimes.reduce((sum: number, time: number) => sum + time, 0) / responseTimes.length;
    
    // Convert to hours and minutes
    const hours = Math.floor(averageMinutes / 60);
    const minutes = Math.round(averageMinutes % 60);
    
    const isPositive = averageMinutes < 120; // Positive if less than 2 hours
    
    return { hours, minutes, change: 0, isPositive };
  } catch (error) {
    console.error('Error calculating average response time:', error);
    return { hours: 0, minutes: 0, change: 0, isPositive: true }; // Return zeros on error
  }
}

// Helper function to calculate average resolution time
async function calculateAverageResolutionTime(startDate: Date, endDate: Date): Promise<{ days: number, hours: number, minutes: number, change: number, isPositive: boolean }> {
  try {
    // Get tickets that are CLOSED (final resolution)
    const closedTickets = await prisma.ticket.findMany({
      where: {
        status: 'CLOSED',
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
    
    // Calculate resolution times (business hours from ticket open to CLOSED)
    const resolutionTimes = closedTickets
      .map((ticket: any) => {
        return calculateBusinessHoursInMinutes(ticket.createdAt, ticket.updatedAt);
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
        // Use average age of all tickets as a baseline (business hours)
        const avgMinutes = allTickets.reduce((sum: any, ticket: any) => {
          return sum + calculateBusinessHoursInMinutes(ticket.createdAt, ticket.updatedAt);
        }, 0) / allTickets.length;
        
        // Convert business minutes to business days (8 hours per business day)
        const businessHoursPerDay = 8 * 60; // 480 minutes per business day
        const days = Math.floor(avgMinutes / businessHoursPerDay);
        const remainingMinutesAfterDays = avgMinutes % businessHoursPerDay;
        const hours = Math.floor(remainingMinutesAfterDays / 60);
        const minutes = Math.round(remainingMinutesAfterDays % 60);
        const isPositive = avgMinutes < (2 * businessHoursPerDay); // Less than 2 business days
        
        return { days, hours, minutes, change: 0, isPositive };
      }
      
      return { days: 0, hours: 0, minutes: 0, change: 0, isPositive: true }; // Return zeros when no data
    }
    
    // Calculate average in minutes
    const averageMinutes = resolutionTimes.reduce((sum: number, time: number) => sum + time, 0) / resolutionTimes.length;
    
    // Convert business minutes to business days (8 hours per business day)
    const businessHoursPerDay = 8 * 60; // 480 minutes per business day
    const days = Math.floor(averageMinutes / businessHoursPerDay);
    const remainingMinutesAfterDays = averageMinutes % businessHoursPerDay;
    const hours = Math.floor(remainingMinutesAfterDays / 60);
    const minutes = Math.round(remainingMinutesAfterDays % 60);
    
    const isPositive = averageMinutes < (2 * businessHoursPerDay); // Positive if less than 2 business days
    
    return { days, hours, minutes, change: 0, isPositive };
  } catch (error) {
    return { days: 0, hours: 0, minutes: 0, change: 0, isPositive: true };
  }
}

// Helper function to calculate average downtime
async function calculateAverageDowntime(startDate: Date, endDate: Date): Promise<{ hours: number, minutes: number, change: number, isPositive: boolean }> {
  try {
    // Calculate machine downtime (ticket open to CLOSED_PENDING)
    const closedPendingTickets = await prisma.ticket.findMany({
      where: {
        status: 'CLOSED_PENDING',
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
    
    if (closedPendingTickets.length === 0) {
      // If no closed pending tickets, estimate based on all tickets
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
        // Use average age of all tickets as downtime estimate (business hours)
        const avgDowntime = allTickets.reduce((sum: any, ticket: any) => {
          return sum + calculateBusinessHoursInMinutes(ticket.createdAt, ticket.updatedAt);
        }, 0) / allTickets.length;
        
        const hours = Math.floor(avgDowntime / 60);
        const minutes = Math.round(avgDowntime % 60);
        const isPositive = avgDowntime < 240; // Less than 4 hours is positive
        
        return { hours, minutes, change: 0, isPositive };
      }
      
      return { hours: 0, minutes: 0, change: 0, isPositive: true }; // Return zeros when no data
    }
    
    // Calculate machine downtime as business hours from open to closed pending
    const downtimes = closedPendingTickets.map((ticket: any) => {
      return calculateBusinessHoursInMinutes(ticket.createdAt, ticket.updatedAt);
    }).filter((time: number) => time > 0); // Filter out negative times
    
    if (downtimes.length === 0) {
      return { hours: 0, minutes: 0, change: 0, isPositive: true }; // Return zeros if no valid times
    }
    
    const averageMinutes = downtimes.reduce((sum: number, time: number) => sum + time, 0) / downtimes.length;
    
    // Convert to hours and minutes
    const hours = Math.floor(averageMinutes / 60);
    const minutes = Math.round(averageMinutes % 60);
    
    const isPositive = averageMinutes < 240; // Positive if less than 4 hours
    
    return { hours, minutes, change: 0, isPositive };
  } catch (error) {
    return { hours: 0, minutes: 0, change: 0, isPositive: true };
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
    
    // For simplicity, we'll consider a ticket SLA compliant if it was resolved within 48 business hours
    // In a real scenario, you would check against SLA policies based on priority
    const compliantTickets = tickets.filter((ticket: any) => {
      if (ticket.status !== 'CLOSED') return false;
      
      const openedAt = ticket.createdAt;
      const closedAt = ticket.updatedAt;
      const resolutionTime = calculateBusinessHoursInMinutes(openedAt, closedAt);
      
      return resolutionTime <= (48 * 60); // 48 business hours in minutes (6 business days)
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

// Helper function to get zone-wise ticket data with real average resolution time
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
    
    // Calculate average resolution time for each zone
    const zoneDataWithResolutionTime = await Promise.all(
      zones.map(async (zone: any) => {
        // Get CLOSED tickets for this zone to calculate average resolution time (consistent with main dashboard)
        const closedTickets = await prisma.ticket.findMany({
          where: {
            zoneId: zone.id,
            status: 'CLOSED',
            // Get tickets from last 90 days for better average calculation
            createdAt: {
              gte: subDays(new Date(), 90)
            }
          },
          select: {
            createdAt: true,
            updatedAt: true
          }
        });
        
        let avgResolutionTimeHours = 0;
        
        if (closedTickets.length > 0) {
          // Calculate resolution times in business hours (time from creation to CLOSED)
          const resolutionTimes = closedTickets.map((ticket: any) => 
            calculateBusinessHoursInMinutes(ticket.createdAt, ticket.updatedAt)
          ).filter(time => time > 0); // Filter out negative times
          
          if (resolutionTimes.length > 0) {
            const avgMinutes = resolutionTimes.reduce((sum, time) => sum + time, 0) / resolutionTimes.length;
            // Convert to hours and round to avoid floating point precision issues
            avgResolutionTimeHours = Math.round(avgMinutes / 60); // Round to nearest hour
          }
        } else {
          // If no closed tickets, check if there are any tickets at all
          const allZoneTickets = await prisma.ticket.findMany({
            where: {
              zoneId: zone.id,
              createdAt: {
                gte: subDays(new Date(), 90)
              }
            },
            select: {
              createdAt: true,
              updatedAt: true
            }
          });
          
          if (allZoneTickets.length > 0) {
            // Use average age of all tickets as estimation (business hours)
            const avgAge = allZoneTickets.reduce((sum, ticket) => 
              sum + calculateBusinessHoursInMinutes(ticket.createdAt, ticket.updatedAt), 0
            ) / allZoneTickets.length;
            // Convert to hours and round to avoid floating point precision issues
            avgResolutionTimeHours = Math.round(avgAge / 60); // Round to nearest hour
          } else {
            // Default to 0 hours if no data available
            avgResolutionTimeHours = 0;
          }
        }
        
        return {
          id: zone.id,
          name: zone.name,
          totalTickets: zone.tickets.length,
          servicePersonCount: zone.servicePersons.length,
          customerCount: zone.customers.length,
          avgResolutionTimeHours
        };
      })
    );
    
    return zoneDataWithResolutionTime;
  } catch (error) {
    console.error('Error fetching zone-wise data with resolution time:', error);
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

// Helper function to calculate average travel time (ONSITE_VISIT_STARTED to ONSITE_VISIT_REACHED + ONSITE_VISIT_RESOLVED to ONSITE_VISIT_COMPLETED)
async function calculateAverageTravelTime(startDate: Date, endDate: Date) {
  try {
    // Get tickets that have status history entries for both travel segments
    const statusHistoryEntries = await prisma.ticketStatusHistory.findMany({
      where: {
        status: {
          in: ['ONSITE_VISIT_STARTED', 'ONSITE_VISIT_REACHED', 'ONSITE_VISIT_RESOLVED', 'ONSITE_VISIT_COMPLETED']
        },
        changedAt: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        ticket: true
      },
      orderBy: {
        changedAt: 'asc'
      }
    });

    if (statusHistoryEntries.length === 0) {
      return {
        hours: 0,
        minutes: 50, // Default fallback for total travel (going + returning)
        change: 0,
        isPositive: true
      };
    }

    // Group by ticket ID to analyze status transitions
    const ticketStatusMap = new Map();
    
    for (const entry of statusHistoryEntries) {
      if (!ticketStatusMap.has(entry.ticketId)) {
        ticketStatusMap.set(entry.ticketId, []);
      }
      ticketStatusMap.get(entry.ticketId).push(entry);
    }

    let totalMinutes = 0;
    let validTickets = 0;

    for (const [ticketId, statusHistory] of ticketStatusMap) {
      // Sort by changedAt to ensure chronological order
      statusHistory.sort((a: any, b: any) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());
      
      // Calculate going travel time (STARTED → REACHED)
      const goingStart = statusHistory.find((h: any) => h.status === 'ONSITE_VISIT_STARTED');
      const goingEnd = statusHistory.find((h: any) => h.status === 'ONSITE_VISIT_REACHED');
      
      // Calculate return travel time (RESOLVED → COMPLETED)
      const returnStart = statusHistory.find((h: any) => h.status === 'ONSITE_VISIT_RESOLVED');
      const returnEnd = statusHistory.find((h: any) => h.status === 'ONSITE_VISIT_COMPLETED');

      let ticketTotalTravelMinutes = 0;
      let hasValidTravel = false;

      // Add going travel time (keep as real elapsed time since travel happens in real-time)
      if (goingStart && goingEnd && goingStart.changedAt < goingEnd.changedAt) {
        const goingMinutes = differenceInMinutes(
          new Date(goingEnd.changedAt),
          new Date(goingStart.changedAt)
        );
        if (goingMinutes > 0 && goingMinutes <= 120) { // Max 2 hours for one-way travel
          ticketTotalTravelMinutes += goingMinutes;
          hasValidTravel = true;
        }
      }

      // Add return travel time (keep as real elapsed time since travel happens in real-time)
      if (returnStart && returnEnd && returnStart.changedAt < returnEnd.changedAt) {
        const returnMinutes = differenceInMinutes(
          new Date(returnEnd.changedAt),
          new Date(returnStart.changedAt)
        );
        if (returnMinutes > 0 && returnMinutes <= 120) { // Max 2 hours for one-way travel
          ticketTotalTravelMinutes += returnMinutes;
          hasValidTravel = true;
        }
      }

      // Only include tickets with at least one valid travel segment
      if (hasValidTravel && ticketTotalTravelMinutes <= 240) { // Max 4 hours total travel
        totalMinutes += ticketTotalTravelMinutes;
        validTickets++;
      }
    }

    if (validTickets === 0) {
      return {
        hours: 0,
        minutes: 50, // Default fallback for total travel
        change: 0,
        isPositive: true
      };
    }

    const avgMinutes = Math.round(totalMinutes / validTickets);
    const hours = Math.floor(avgMinutes / 60);
    const minutes = avgMinutes % 60;

    return {
      hours,
      minutes,
      change: 0, // You could calculate this compared to previous period
      isPositive: true // Lower travel time is better
    };
  } catch (error) {
    console.error('Error calculating average travel time:', error);
    return {
      hours: 0,
      minutes: 50, // Default fallback for total travel
      change: 0,
      isPositive: true
    };
  }
}

// Helper function to calculate average onsite resolution time (ONSITE_VISIT_IN_PROGRESS to ONSITE_VISIT_RESOLVED)
async function calculateAverageOnsiteResolutionTime(startDate: Date, endDate: Date) {
  try {
    // Get tickets that have status history entries for onsite work resolution
    const statusHistoryEntries = await prisma.ticketStatusHistory.findMany({
      where: {
        status: {
          in: ['ONSITE_VISIT_IN_PROGRESS', 'ONSITE_VISIT_RESOLVED']
        },
        changedAt: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        ticket: true
      },
      orderBy: {
        changedAt: 'asc'
      }
    });

    if (statusHistoryEntries.length === 0) {
      return {
        hours: 1,
        minutes: 30, // Default fallback for work time
        change: 0,
        isPositive: true
      };
    }

    // Group by ticket ID to analyze status transitions
    const ticketStatusMap = new Map();
    
    for (const entry of statusHistoryEntries) {
      if (!ticketStatusMap.has(entry.ticketId)) {
        ticketStatusMap.set(entry.ticketId, []);
      }
      ticketStatusMap.get(entry.ticketId).push(entry);
    }

    let totalMinutes = 0;
    let validTickets = 0;

    for (const [ticketId, statusHistory] of ticketStatusMap) {
      // Sort by changedAt to ensure chronological order
      statusHistory.sort((a: any, b: any) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());
      
      // Find ONSITE_VISIT_IN_PROGRESS status
      const startStatus = statusHistory.find((h: any) => 
        h.status === 'ONSITE_VISIT_IN_PROGRESS'
      );
      
      // Find ONSITE_VISIT_RESOLVED status
      const endStatus = statusHistory.find((h: any) => 
        h.status === 'ONSITE_VISIT_RESOLVED'
      );

      if (startStatus && endStatus && startStatus.changedAt < endStatus.changedAt) {
        const durationMinutes = calculateBusinessHoursInMinutes(
          new Date(startStatus.changedAt),
          new Date(endStatus.changedAt)
        );

        // Filter out unrealistic durations (more than 8 hours for onsite work)
        if (durationMinutes > 0 && durationMinutes <= 480) {
          totalMinutes += durationMinutes;
          validTickets++;
        }
      }
    }

    if (validTickets === 0) {
      return {
        hours: 1,
        minutes: 30, // Default fallback for work time
        change: 0,
        isPositive: true
      };
    }

    const avgMinutes = Math.round(totalMinutes / validTickets);
    const hours = Math.floor(avgMinutes / 60);
    const minutes = avgMinutes % 60;

    return {
      hours,
      minutes,
      change: 0, // You could calculate this compared to previous period
      isPositive: true // Lower resolution time is better
    };
  } catch (error) {
    console.error('Error calculating average onsite resolution time:', error);
    return {
      hours: 1,
      minutes: 30, // Default fallback for work time
      change: 0,
      isPositive: true
    };
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