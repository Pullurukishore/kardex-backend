"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTicketTrendsData = exports.getStatusDistribution = exports.getDashboardData = void 0;
const date_fns_1 = require("date-fns");
const db_1 = __importDefault(require("../config/db"));
const getDashboardData = async (req, res) => {
    try {
        // Get date ranges for comparison
        const today = new Date();
        const thirtyDaysAgo = (0, date_fns_1.subDays)(today, 30);
        const sixtyDaysAgo = (0, date_fns_1.subDays)(today, 60);
        // Get current period data (last 30 days)
        const currentPeriodStart = thirtyDaysAgo;
        const currentPeriodEnd = today;
        // Get previous period data (30-60 days ago)
        const previousPeriodStart = sixtyDaysAgo;
        const previousPeriodEnd = thirtyDaysAgo;
        // Execute all queries in parallel for better performance
        const [
        // Current period counts
        openTicketsCurrent, unassignedTicketsCurrent, inProgressTicketsCurrent, monthlyTicketsCurrent, activeMachinesCurrent, 
        // Previous period counts for comparison
        openTicketsPrevious, unassignedTicketsPrevious, inProgressTicketsPrevious, monthlyTicketsPrevious, activeMachinesPrevious, 
        // Time-based metrics
        responseTimeData, resolutionTimeData, downtimeData, 
        // Distribution data
        statusDistribution, priorityDistribution, 
        // Admin stats
        totalCustomers, totalServicePersons, totalServiceZones, zoneWiseData, 
        // Recent tickets
        recentTickets, 
        // Additional metrics for KPIs
        totalTicketsCount, slaCompliantTickets, activeCustomersCount, activeServicePersonsCount] = await Promise.all([
            // Current period counts
            db_1.default.ticket.count({
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
            db_1.default.ticket.count({
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
            db_1.default.ticket.count({
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
            db_1.default.ticket.count({
                where: {
                    createdAt: {
                        gte: (0, date_fns_1.startOfDay)(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
                        lte: (0, date_fns_1.endOfDay)(today)
                    }
                }
            }),
            db_1.default.asset.count({
                where: {
                    status: "ACTIVE",
                    updatedAt: {
                        gte: currentPeriodStart,
                        lte: currentPeriodEnd
                    }
                }
            }),
            // Previous period counts for comparison
            db_1.default.ticket.count({
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
            db_1.default.ticket.count({
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
            db_1.default.ticket.count({
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
            db_1.default.ticket.count({
                where: {
                    createdAt: {
                        gte: (0, date_fns_1.startOfDay)(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)),
                        lte: (0, date_fns_1.endOfDay)(new Date(new Date().getFullYear(), new Date().getMonth(), 0))
                    }
                }
            }),
            db_1.default.asset.count({
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
            db_1.default.ticket.groupBy({
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
            db_1.default.ticket.groupBy({
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
            db_1.default.customer.count({
                where: { isActive: true }
            }),
            db_1.default.user.count({
                where: {
                    role: 'SERVICE_PERSON',
                    isActive: true
                }
            }),
            db_1.default.serviceZone.count({
                where: { isActive: true }
            }),
            // Zone-wise data
            getZoneWiseTicketData(),
            // Recent tickets
            db_1.default.ticket.findMany({
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
            db_1.default.ticket.count({
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
            db_1.default.customer.count({
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
            db_1.default.user.count({
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
        const calculateChange = (current, previous) => {
            if (previous === 0)
                return current > 0 ? 100 : 0;
            return Math.round(((current - previous) / previous) * 100);
        };
        const openTicketsChange = calculateChange(openTicketsCurrent, openTicketsPrevious);
        const inProgressTicketsChange = calculateChange(inProgressTicketsCurrent, inProgressTicketsPrevious);
        const monthlyTicketsChange = calculateChange(monthlyTicketsCurrent, monthlyTicketsPrevious);
        const activeMachinesChange = calculateChange(activeMachinesCurrent, activeMachinesPrevious);
        // Prepare status distribution
        const statusDistributionFormatted = statusDistribution.map((item) => ({
            name: item.status,
            value: item._count.status
        }));
        // Prepare priority distribution
        const priorityDistributionFormatted = priorityDistribution.map((item) => ({
            name: item.priority,
            value: item._count.priority
        }));
        // Prepare dashboard data
        const dashboardData = {
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
                ticketStatusDistribution: statusDistributionFormatted.reduce((acc, item) => {
                    acc[item.name] = item.value;
                    return acc;
                }, {}),
                ticketTrends: await getTicketTrends(30),
                zoneWiseTickets: zoneWiseData
            },
            recentTickets: recentTickets.map((ticket) => ({
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
    }
    catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getDashboardData = getDashboardData;
// Helper function to calculate average response time
async function calculateAverageResponseTime(startDate, endDate) {
    try {
        // Get tickets that have moved from OPEN to IN_PROCESS status within the time period
        const ticketsWithStatusHistory = await db_1.default.ticket.findMany({
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
                            in: ['OPEN', 'IN_PROCESS']
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
        // Calculate response times (time from OPEN to IN_PROCESS)
        const responseTimes = ticketsWithStatusHistory
            .map((ticket) => {
            const statusHistory = ticket.statusHistory;
            // Find the OPEN status record (should be the first one)
            const openStatus = statusHistory.find((h) => h.status === 'OPEN');
            // Find the IN_PROCESS status record
            const inProcessStatus = statusHistory.find((h) => h.status === 'IN_PROCESS');
            if (openStatus && inProcessStatus) {
                // Calculate time from OPEN to IN_PROCESS
                return (0, date_fns_1.differenceInMinutes)(inProcessStatus.changedAt, openStatus.changedAt);
            }
            else if (statusHistory.length > 0) {
                // Fallback: if no clear OPEN->IN_PROCESS transition, use creation time to first status change
                const firstStatusChange = statusHistory[0];
                if (firstStatusChange.status !== 'OPEN') {
                    return (0, date_fns_1.differenceInMinutes)(firstStatusChange.changedAt, ticket.createdAt);
                }
            }
            return null;
        })
            .filter((time) => time !== null && time > 0);
        if (responseTimes.length === 0) {
            // If no tickets with proper status transitions, return zeros
            return { hours: 0, minutes: 0, change: 0, isPositive: true };
        }
        // Calculate average in minutes
        const averageMinutes = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
        // Convert to hours and minutes
        const hours = Math.floor(averageMinutes / 60);
        const minutes = Math.round(averageMinutes % 60);
        const isPositive = averageMinutes < 120; // Positive if less than 2 hours
        return { hours, minutes, change: 0, isPositive };
    }
    catch (error) {
        console.error('Error calculating average response time:', error);
        return { hours: 0, minutes: 0, change: 0, isPositive: true }; // Return zeros on error
    }
}
// Helper function to calculate average resolution time
async function calculateAverageResolutionTime(startDate, endDate) {
    try {
        // Get resolved and closed tickets
        const resolvedTickets = await db_1.default.ticket.findMany({
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
            .map((ticket) => {
            return (0, date_fns_1.differenceInMinutes)(ticket.updatedAt, ticket.createdAt);
        })
            .filter((time) => time > 0); // Filter out negative times
        if (resolutionTimes.length === 0) {
            // If no resolved tickets, check for any tickets that might be resolved
            const allTickets = await db_1.default.ticket.findMany({
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
                const avgMinutes = allTickets.reduce((sum, ticket) => {
                    return sum + (0, date_fns_1.differenceInMinutes)(ticket.updatedAt, ticket.createdAt);
                }, 0) / allTickets.length;
                const days = Math.floor(avgMinutes / (60 * 24));
                const hours = Math.round((avgMinutes % (60 * 24)) / 60);
                const isPositive = avgMinutes < 2880; // Less than 2 days
                return { days, hours, change: 0, isPositive };
            }
            return { days: 0, hours: 0, change: 0, isPositive: true }; // Return zeros when no data
        }
        // Calculate average in minutes
        const averageMinutes = resolutionTimes.reduce((sum, time) => sum + time, 0) / resolutionTimes.length;
        // Convert to days and hours
        const days = Math.floor(averageMinutes / (60 * 24));
        const hours = Math.round((averageMinutes % (60 * 24)) / 60);
        const isPositive = averageMinutes < 2880; // Positive if less than 2 days
        return { days, hours, change: 0, isPositive };
    }
    catch (error) {
        return { days: 0, hours: 0, change: 0, isPositive: true };
    }
}
// Helper function to calculate average downtime
async function calculateAverageDowntime(startDate, endDate) {
    try {
        // Calculate downtime based on ticket open to closed time (simplified approach)
        const tickets = await db_1.default.ticket.findMany({
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
        if (tickets.length === 0) {
            // If no resolved tickets, estimate based on all tickets
            const allTickets = await db_1.default.ticket.findMany({
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
                // Use average age of all tickets as downtime estimate
                const avgDowntime = allTickets.reduce((sum, ticket) => {
                    return sum + (0, date_fns_1.differenceInMinutes)(ticket.updatedAt, ticket.createdAt);
                }, 0) / allTickets.length;
                const hours = Math.floor(avgDowntime / 60);
                const minutes = Math.round(avgDowntime % 60);
                const isPositive = avgDowntime < 240; // Less than 4 hours is positive
                return { hours, minutes, change: 0, isPositive };
            }
            return { hours: 0, minutes: 0, change: 0, isPositive: true }; // Return zeros when no data
        }
        // Calculate downtime as direct time from open to closed
        const downtimes = tickets.map((ticket) => {
            return (0, date_fns_1.differenceInMinutes)(ticket.updatedAt, ticket.createdAt);
        }).filter((time) => time > 0); // Filter out negative times
        if (downtimes.length === 0) {
            return { hours: 0, minutes: 0, change: 0, isPositive: true }; // Return zeros if no valid times
        }
        const averageMinutes = downtimes.reduce((sum, time) => sum + time, 0) / downtimes.length;
        // Convert to hours and minutes
        const hours = Math.floor(averageMinutes / 60);
        const minutes = Math.round(averageMinutes % 60);
        const isPositive = averageMinutes < 240; // Positive if less than 4 hours
        return { hours, minutes, change: 0, isPositive };
    }
    catch (error) {
        return { hours: 0, minutes: 0, change: 0, isPositive: true };
    }
}
// Helper function to calculate SLA compliance
async function calculateSLACompliance(startDate, endDate) {
    try {
        // Get all tickets in the period
        const tickets = await db_1.default.ticket.findMany({
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
        const compliantTickets = tickets.filter((ticket) => {
            if (ticket.status !== 'CLOSED')
                return false;
            const openedAt = ticket.createdAt;
            const closedAt = ticket.updatedAt;
            const resolutionTime = (0, date_fns_1.differenceInMinutes)(closedAt, openedAt);
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
    }
    catch (error) {
        return { count: 0, total: 0, percentage: 0 };
    }
}
// Helper function to get zone-wise ticket data with real average resolution time
async function getZoneWiseTicketData() {
    try {
        const zones = await db_1.default.serviceZone.findMany({
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
        const zoneDataWithResolutionTime = await Promise.all(zones.map(async (zone) => {
            // Get resolved/closed tickets for this zone to calculate average resolution time
            const resolvedTickets = await db_1.default.ticket.findMany({
                where: {
                    zoneId: zone.id,
                    status: {
                        in: ['RESOLVED', 'CLOSED']
                    },
                    // Get tickets from last 90 days for better average calculation
                    createdAt: {
                        gte: (0, date_fns_1.subDays)(new Date(), 90)
                    }
                },
                select: {
                    createdAt: true,
                    updatedAt: true
                }
            });
            let avgResolutionTimeHours = 0;
            if (resolvedTickets.length > 0) {
                // Calculate resolution times in minutes
                const resolutionTimes = resolvedTickets.map((ticket) => (0, date_fns_1.differenceInMinutes)(ticket.updatedAt, ticket.createdAt)).filter(time => time > 0); // Filter out negative times
                if (resolutionTimes.length > 0) {
                    const avgMinutes = resolutionTimes.reduce((sum, time) => sum + time, 0) / resolutionTimes.length;
                    // Convert to hours and round to avoid floating point precision issues
                    avgResolutionTimeHours = Math.round(avgMinutes / 60); // Round to nearest hour
                }
            }
            else {
                // If no resolved tickets, check if there are any tickets at all
                const allZoneTickets = await db_1.default.ticket.findMany({
                    where: {
                        zoneId: zone.id,
                        createdAt: {
                            gte: (0, date_fns_1.subDays)(new Date(), 90)
                        }
                    },
                    select: {
                        createdAt: true,
                        updatedAt: true
                    }
                });
                if (allZoneTickets.length > 0) {
                    // Use average age of all tickets as estimation
                    const avgAge = allZoneTickets.reduce((sum, ticket) => sum + (0, date_fns_1.differenceInMinutes)(ticket.updatedAt, ticket.createdAt), 0) / allZoneTickets.length;
                    // Convert to hours and round to avoid floating point precision issues
                    avgResolutionTimeHours = Math.round(avgAge / 60); // Round to nearest hour
                }
                else {
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
        }));
        return zoneDataWithResolutionTime;
    }
    catch (error) {
        console.error('Error fetching zone-wise data with resolution time:', error);
        return [];
    }
}
// Helper function to get ticket trends
async function getTicketTrends(days = 30) {
    try {
        const trends = [];
        const today = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const date = (0, date_fns_1.subDays)(today, i);
            const start = (0, date_fns_1.startOfDay)(date);
            const end = (0, date_fns_1.endOfDay)(date);
            const count = await db_1.default.ticket.count({
                where: {
                    createdAt: {
                        gte: start,
                        lte: end
                    }
                }
            });
            trends.push({
                date: (0, date_fns_1.format)(date, 'yyyy-MM-dd'),
                count,
                status: 'ALL' // You could break this down by status if needed
            });
        }
        return trends;
    }
    catch (error) {
        return [];
    }
}
// Additional endpoint for status distribution
const getStatusDistribution = async (req, res) => {
    try {
        const thirtyDaysAgo = (0, date_fns_1.subDays)(new Date(), 30);
        const distribution = await db_1.default.ticket.groupBy({
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
            distribution: distribution.map((item) => ({
                status: item.status,
                count: item._count.status
            }))
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch status distribution' });
    }
};
exports.getStatusDistribution = getStatusDistribution;
// Additional endpoint for ticket trends
const getTicketTrendsData = async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const trends = await getTicketTrends(days);
        res.json({ trends });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch ticket trends' });
    }
};
exports.getTicketTrendsData = getTicketTrendsData;
