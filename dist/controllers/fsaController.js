"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportFSAData = exports.getServiceReports = exports.getResourceOptimization = exports.getCustomerSatisfactionMetrics = exports.getEquipmentAnalytics = exports.getAdvancedPerformanceMetrics = exports.getPredictiveAnalytics = exports.getRealTimeMetrics = exports.getServicePersonPerformance = exports.getUserPerformance = exports.getServiceZoneAnalytics = exports.getFSADashboard = void 0;
const db_1 = __importDefault(require("../config/db"));
const date_fns_1 = require("date-fns");
const bigint_1 = require("../utils/bigint");
// Get comprehensive FSA dashboard data
const getFSADashboard = async (req, res) => {
    try {
        const user = req.user;
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
        let dashboardData = {};
        if (user.role === 'ADMIN') {
            dashboardData = await getAdminFSAData(effectiveZoneIds, days);
        }
        else if (user.role === 'ZONE_USER') {
            dashboardData = await getZoneUserFSAData(user.id, effectiveZoneIds, days);
        }
        else if (user.role === 'SERVICE_PERSON') {
            dashboardData = await getServicePersonFSAData(user.id, effectiveZoneIds, days);
        }
        // Serialize BigInt values to numbers before sending response
        const serializedData = (0, bigint_1.serializeBigInts)(dashboardData);
        return res.json({
            success: true,
            data: {
                dashboard: serializedData,
                tickets: [], // Add tickets if needed
                userRole: user.role
            }
        });
    }
    catch (error) {
        console.error('Error fetching FSA dashboard data:', error);
        return res.status(500).json({ error: 'Failed to fetch FSA dashboard data' });
    }
};
exports.getFSADashboard = getFSADashboard;
// Get detailed service zone analytics
const getServiceZoneAnalytics = async (req, res) => {
    try {
        const user = req.user;
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
        }
        else if (user.role === 'ZONE_USER') {
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
                    const customer = await db_1.default.customer.findUnique({
                        where: { id: user.customer.id },
                        select: { serviceZoneId: true }
                    });
                    hasAccess = customer?.serviceZoneId === targetZoneId;
                }
                catch (error) {
                    console.error('Error checking customer zone:', error);
                }
            }
        }
        else if (user.role === 'SERVICE_PERSON') {
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
        const serializedData = (0, bigint_1.serializeBigInts)(zoneData);
        return res.json(serializedData);
    }
    catch (error) {
        console.error('Error fetching service zone analytics:', error);
        return res.status(500).json({ error: 'Failed to fetch service zone analytics' });
    }
};
exports.getServiceZoneAnalytics = getServiceZoneAnalytics;
// Get user performance analytics
const getUserPerformance = async (req, res) => {
    try {
        const user = req.user;
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
        const serializedData = (0, bigint_1.serializeBigInts)(userData);
        return res.json(serializedData);
    }
    catch (error) {
        console.error('Error fetching user performance:', error);
        return res.status(500).json({ error: 'Failed to fetch user performance' });
    }
};
exports.getUserPerformance = getUserPerformance;
// Get service person performance analytics
const getServicePersonPerformance = async (req, res) => {
    try {
        const user = req.user;
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
        const serializedData = (0, bigint_1.serializeBigInts)(servicePersonData);
        return res.json(serializedData);
    }
    catch (error) {
        console.error('Error fetching service person performance:', error);
        return res.status(500).json({ error: 'Failed to fetch service person performance' });
    }
};
exports.getServicePersonPerformance = getServicePersonPerformance;
// Helper functions
async function getAdminFSAData(zoneIds, days) {
    const startDate = (0, date_fns_1.subDays)(new Date(), days);
    const [serviceZones, ticketsByStatus, ticketsByPriority, ticketsTrend, slaCompliance, topPerformers, zonePerformance] = await Promise.all([
        // Get all service zones with stats
        db_1.default.serviceZone.findMany({
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
        db_1.default.ticket.groupBy({
            by: ['status'],
            _count: { id: true },
            where: {
                createdAt: { gte: startDate },
                ...buildTicketZoneFilter(zoneIds)
            }
        }),
        // Ticket distribution by priority
        db_1.default.ticket.groupBy({
            by: ['priority'],
            _count: { id: true },
            where: {
                createdAt: { gte: startDate },
                ...buildTicketZoneFilter(zoneIds)
            }
        }),
        // Ticket trend over time
        zoneIds?.length
            ? db_1.default.$queryRaw `
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
            : db_1.default.$queryRaw `
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
        db_1.default.user.findMany({
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
        db_1.default.serviceZone.findMany({
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
        .filter((item) => item.status === 'RESOLVED' || item.status === 'CLOSED')
        .reduce((sum, item) => sum + item._count.id, 0);
    const resolutionRate = totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0;
    // Calculate average resolution time
    const allResolvedTickets = serviceZones.flatMap((zone) => zone.tickets);
    const totalResolutionTime = allResolvedTickets.reduce((sum, ticket) => {
        if (!ticket.updatedAt)
            return sum;
        return sum + (0, date_fns_1.differenceInHours)(ticket.updatedAt, ticket.createdAt);
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
            byStatus: ticketsByStatus.map((item) => ({
                status: item.status,
                count: item._count.id,
                percentage: totalTickets > 0 ? (item._count.id / totalTickets) * 100 : 0
            })),
            byPriority: ticketsByPriority.map((item) => ({
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
            topPerformers: topPerformers.map((user) => ({
                id: user.id,
                name: user.name,
                email: user.email,
                resolvedTickets: user._count.assignedTickets,
                avgResolutionTime: user.assignedTickets.length > 0
                    ? (user.assignedTickets.reduce((sum, ticket) => {
                        if (!ticket.updatedAt)
                            return sum;
                        return sum + (0, date_fns_1.differenceInHours)(ticket.updatedAt, ticket.createdAt);
                    }, 0) / user.assignedTickets.length).toFixed(2)
                    : '0'
            })),
            zonePerformance: zonePerformance.map((zone) => {
                const resolvedTickets = zone.tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED');
                const totalResolutionTime = resolvedTickets.reduce((sum, ticket) => {
                    if (!ticket.updatedAt)
                        return sum;
                    return sum + (0, date_fns_1.differenceInHours)(ticket.updatedAt, ticket.createdAt);
                }, 0);
                const avgResolutionTime = resolvedTickets.length > 0
                    ? (totalResolutionTime / resolvedTickets.length).toFixed(2)
                    : '0';
                const criticalTickets = resolvedTickets.filter((t) => t.priority === 'CRITICAL').length;
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
                    activeCustomers: zone.customers.filter((c) => c._count.tickets > 0).length
                };
            })
        }
    };
}
async function getZoneUserFSAData(userId, zoneIds, days) {
    const startDate = (0, date_fns_1.subDays)(new Date(), days);
    const user = await db_1.default.user.findUnique({
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
        const openTickets = tickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED').length;
        const resolvedTickets = tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length;
        const resolutionRate = totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0;
        // Calculate average resolution time for resolved tickets
        const resolvedTicketsWithTime = tickets.filter((t) => (t.status === 'RESOLVED' || t.status === 'CLOSED') && t.updatedAt);
        const totalResolutionTime = resolvedTicketsWithTime.reduce((sum, ticket) => {
            return sum + (0, date_fns_1.differenceInHours)(ticket.updatedAt, ticket.createdAt);
        }, 0);
        const avgResolutionTime = resolvedTicketsWithTime.length > 0
            ? (totalResolutionTime / resolvedTicketsWithTime.length).toFixed(2)
            : '0';
        // Group tickets by status
        const statusCounts = tickets.reduce((acc, ticket) => {
            acc[ticket.status] = (acc[ticket.status] || 0) + 1;
            return acc;
        }, {});
        // Group tickets by priority
        const priorityCounts = tickets.reduce((acc, ticket) => {
            acc[ticket.priority] = (acc[ticket.priority] || 0) + 1;
            return acc;
        }, {});
        // Get recent activity
        const recentTickets = tickets
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, 10)
            .map((ticket) => ({
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
    // If user doesn't have a customer but has zone assignments, return zone-level data
    if (user.serviceZones && user.serviceZones.length > 0) {
        const allTickets = user.serviceZones.flatMap((sz) => sz.serviceZone.customers.flatMap((c) => c.tickets));
        const totalTickets = allTickets.length;
        const openTickets = allTickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED').length;
        const resolvedTickets = allTickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length;
        const resolutionRate = totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0;
        // Calculate average resolution time
        const resolvedTicketsWithTime = allTickets.filter((t) => (t.status === 'RESOLVED' || t.status === 'CLOSED') && t.updatedAt);
        const totalResolutionTime = resolvedTicketsWithTime.reduce((sum, ticket) => {
            return sum + (0, date_fns_1.differenceInHours)(ticket.updatedAt, ticket.createdAt);
        }, 0);
        const avgResolutionTime = resolvedTicketsWithTime.length > 0
            ? (totalResolutionTime / resolvedTicketsWithTime.length).toFixed(2)
            : '0';
        // Group tickets by status and priority
        const statusCounts = allTickets.reduce((acc, ticket) => {
            acc[ticket.status] = (acc[ticket.status] || 0) + 1;
            return acc;
        }, {});
        const priorityCounts = allTickets.reduce((acc, ticket) => {
            acc[ticket.priority] = (acc[ticket.priority] || 0) + 1;
            return acc;
        }, {});
        // Get recent tickets
        const recentTickets = allTickets
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, 10)
            .map((ticket) => ({
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
                serviceZone: user.serviceZones.map((sz) => sz.serviceZone.name).join(', '),
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
async function getServicePersonFSAData(userId, zoneIds, days) {
    const startDate = (0, date_fns_1.subDays)(new Date(), days);
    const user = await db_1.default.user.findUnique({
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
    const openTickets = tickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED').length;
    const resolvedTickets = tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length;
    const resolutionRate = totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0;
    // Calculate average resolution time for resolved tickets
    const resolvedTicketsWithTime = tickets.filter((t) => (t.status === 'RESOLVED' || t.status === 'CLOSED') && t.updatedAt);
    const totalResolutionTime = resolvedTicketsWithTime.reduce((sum, ticket) => {
        return sum + (0, date_fns_1.differenceInHours)(ticket.updatedAt, ticket.createdAt);
    }, 0);
    const avgResolutionTime = resolvedTicketsWithTime.length > 0
        ? (totalResolutionTime / resolvedTicketsWithTime.length).toFixed(2)
        : '0';
    // Group tickets by status
    const statusCounts = tickets.reduce((acc, ticket) => {
        acc[ticket.status] = (acc[ticket.status] || 0) + 1;
        return acc;
    }, {});
    // Group tickets by priority
    const priorityCounts = tickets.reduce((acc, ticket) => {
        acc[ticket.priority] = (acc[ticket.priority] || 0) + 1;
        return acc;
    }, {});
    // Group tickets by zone
    const zoneCounts = tickets.reduce((acc, ticket) => {
        const zoneName = ticket.customer?.serviceZone?.name || 'Unknown';
        acc[zoneName] = (acc[zoneName] || 0) + 1;
        return acc;
    }, {});
    // Get recent activity
    const recentTickets = tickets
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 10)
        .map((ticket) => ({
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
        assignedZones: user.serviceZones.map((sz) => ({
            id: sz.serviceZone.id,
            name: sz.serviceZone.name
        }))
    };
}
// Removed duplicate function - implementation exists at end of file
// Removed duplicate functions - implementations exist at end of file
// Advanced Analytics Controllers
// Get real-time metrics
const getRealTimeMetrics = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const now = new Date();
        const today = (0, date_fns_1.startOfDay)(now);
        // Get real-time metrics
        const [activeTickets, techniciansOnField, criticalAlerts, recentTickets] = await Promise.all([
            // Active tickets count
            db_1.default.ticket.count({
                where: {
                    status: { in: ['OPEN', 'IN_PROGRESS', 'ASSIGNED'] }
                }
            }),
            // Technicians currently on field (service persons with active tickets)
            db_1.default.user.count({
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
            db_1.default.ticket.count({
                where: {
                    priority: { in: ['CRITICAL', 'HIGH'] },
                    createdAt: { gte: today },
                    status: { notIn: ['RESOLVED', 'CLOSED'] }
                }
            }),
            // Recent tickets for response time calculation
            db_1.default.ticket.findMany({
                where: {
                    status: { in: ['RESOLVED', 'CLOSED'] },
                    updatedAt: { gte: (0, date_fns_1.subDays)(now, 1) }
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
                if (!ticket.updatedAt)
                    return sum;
                return sum + (0, date_fns_1.differenceInHours)(ticket.updatedAt, ticket.createdAt);
            }, 0) / recentTickets.length
            : 0;
        const realTimeMetrics = {
            activeTickets,
            techniciansOnField,
            avgResponseTime: Math.round(avgResponseTime * 100) / 100,
            criticalAlertsCount: criticalAlerts,
            equipmentUptime: 98.5, // Mock data - would come from equipment monitoring
            customerWaitTime: Math.round(avgResponseTime * 0.8 * 100) / 100
        };
        res.json({
            success: true,
            data: (0, bigint_1.serializeBigInts)(realTimeMetrics)
        });
    }
    catch (error) {
        console.error('Error fetching real-time metrics:', error);
        res.status(500).json({ error: 'Failed to fetch real-time metrics' });
    }
};
exports.getRealTimeMetrics = getRealTimeMetrics;
// Get predictive analytics
const getPredictiveAnalytics = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { timeframe = '90d' } = req.query;
        const days = parseInt(timeframe.toString().replace('d', '')) || 90;
        const startDate = (0, date_fns_1.subDays)(new Date(), days);
        // Get historical ticket data for forecasting
        const historicalData = await db_1.default.$queryRaw `
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
        const zones = await db_1.default.serviceZone.findMany({
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
        const resourceRequirements = zones.map((zone) => ({
            zone: zone.name,
            requiredPersons: Math.ceil(zone._count.tickets / 10), // 10 tickets per person
            currentPersons: zone._count.servicePersons
        }));
        // Mock seasonal trends (would be calculated from historical data)
        const seasonalTrends = [
            { month: 'Jan', averageTickets: 45, trend: 'stable' },
            { month: 'Feb', averageTickets: 38, trend: 'down' },
            { month: 'Mar', averageTickets: 52, trend: 'up' },
            { month: 'Apr', averageTickets: 48, trend: 'stable' },
            { month: 'May', averageTickets: 55, trend: 'up' },
            { month: 'Jun', averageTickets: 62, trend: 'up' }
        ];
        const predictiveAnalytics = {
            ticketVolumeForecast,
            resourceRequirements,
            maintenanceSchedule: [], // Would be populated from equipment data
            seasonalTrends
        };
        res.json({
            success: true,
            data: (0, bigint_1.serializeBigInts)(predictiveAnalytics)
        });
    }
    catch (error) {
        console.error('Error fetching predictive analytics:', error);
        res.status(500).json({ error: 'Failed to fetch predictive analytics' });
    }
};
exports.getPredictiveAnalytics = getPredictiveAnalytics;
// Get advanced performance metrics
const getAdvancedPerformanceMetrics = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { timeframe = '30d', userId } = req.query;
        const days = parseInt(timeframe.toString().replace('d', '')) || 30;
        const startDate = (0, date_fns_1.subDays)(new Date(), days);
        // Get performance data for service persons
        const servicePersons = await db_1.default.user.findMany({
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
        const performanceMetrics = servicePersons.map((person) => {
            const tickets = person.assignedTickets;
            const resolvedTickets = tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED');
            const criticalTickets = tickets.filter((t) => t.priority === 'CRITICAL');
            // Calculate metrics
            const efficiency = tickets.length > 0 ? (resolvedTickets.length / tickets.length) * 100 : 0;
            const productivity = resolvedTickets.length;
            const firstCallResolution = criticalTickets.length > 0
                ? (criticalTickets.filter((t) => t.status === 'RESOLVED').length / criticalTickets.length) * 100
                : 100;
            const avgResponseTime = resolvedTickets.length > 0
                ? resolvedTickets.reduce((sum, ticket) => {
                    if (!ticket.updatedAt)
                        return sum;
                    return sum + (0, date_fns_1.differenceInHours)(ticket.updatedAt, ticket.createdAt);
                }, 0) / resolvedTickets.length
                : 0;
            const metrics = {
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
            data: (0, bigint_1.serializeBigInts)(performanceMetrics)
        });
    }
    catch (error) {
        console.error('Error fetching performance metrics:', error);
        res.status(500).json({ error: 'Failed to fetch performance metrics' });
    }
};
exports.getAdvancedPerformanceMetrics = getAdvancedPerformanceMetrics;
// Get equipment analytics
const getEquipmentAnalytics = async (req, res) => {
    try {
        const user = req.user;
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
    }
    catch (error) {
        console.error('Error fetching equipment analytics:', error);
        res.status(500).json({ error: 'Failed to fetch equipment analytics' });
    }
};
exports.getEquipmentAnalytics = getEquipmentAnalytics;
// Get customer satisfaction metrics
const getCustomerSatisfactionMetrics = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { timeframe = '30d' } = req.query;
        const days = parseInt(timeframe.toString().replace('d', '')) || 30;
        const startDate = (0, date_fns_1.subDays)(new Date(), days);
        // Get customer data with ticket resolution metrics
        const customers = await db_1.default.customer.findMany({
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
        const satisfactionMetrics = customers.map((customer) => {
            const tickets = customer.tickets;
            const resolvedTickets = tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED');
            const resolutionRate = tickets.length > 0 ? (resolvedTickets.length / tickets.length) * 100 : 0;
            const avgResolutionTime = resolvedTickets.length > 0
                ? resolvedTickets.reduce((sum, ticket) => {
                    if (!ticket.updatedAt)
                        return sum;
                    return sum + (0, date_fns_1.differenceInHours)(ticket.updatedAt, ticket.createdAt);
                }, 0) / resolvedTickets.length
                : 0;
            // Mock satisfaction score based on resolution metrics
            const satisfactionScore = Math.min(100, Math.max(0, 85 - (avgResolutionTime * 2) + (resolutionRate * 0.1)));
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
            averageSatisfaction: Math.round(satisfactionMetrics.reduce((sum, m) => sum + m.satisfactionScore, 0) / satisfactionMetrics.length),
            totalCustomers: customers.length,
            activeCustomers: satisfactionMetrics.filter((m) => m.totalTickets > 0).length,
            highSatisfaction: satisfactionMetrics.filter((m) => m.satisfactionScore >= 85).length,
            lowSatisfaction: satisfactionMetrics.filter((m) => m.satisfactionScore < 60).length
        };
        res.json({
            success: true,
            data: (0, bigint_1.serializeBigInts)({
                overall: overallMetrics,
                customers: satisfactionMetrics.slice(0, 50) // Limit for performance
            })
        });
    }
    catch (error) {
        console.error('Error fetching customer satisfaction metrics:', error);
        res.status(500).json({ error: 'Failed to fetch customer satisfaction metrics' });
    }
};
exports.getCustomerSatisfactionMetrics = getCustomerSatisfactionMetrics;
// Get resource optimization recommendations
const getResourceOptimization = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { timeframe = '30d' } = req.query;
        const days = parseInt(timeframe.toString().replace('d', '')) || 30;
        const startDate = (0, date_fns_1.subDays)(new Date(), days);
        // Get zone workload data
        const zones = await db_1.default.serviceZone.findMany({
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
        const resourceOptimization = zones.map((zone) => {
            const totalTickets = zone._count.tickets;
            const servicePersons = zone._count.servicePersons;
            const workloadPerPerson = servicePersons > 0 ? totalTickets / servicePersons : 0;
            const criticalTickets = zone.tickets.filter((t) => t.priority === 'CRITICAL').length;
            const openTickets = zone.tickets.filter((t) => t.status !== 'RESOLVED' && t.status !== 'CLOSED').length;
            // Calculate optimization recommendations
            const recommendedPersons = Math.ceil(totalTickets / 8); // Target 8 tickets per person
            const efficiency = servicePersons > 0 ? Math.min(100, (8 / workloadPerPerson) * 100) : 0;
            let recommendation = 'optimal';
            if (workloadPerPerson > 12)
                recommendation = 'add_resources';
            else if (workloadPerPerson < 4 && servicePersons > 1)
                recommendation = 'reduce_resources';
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
            overloadedZones: resourceOptimization.filter((z) => z.recommendation === 'add_resources').length,
            underutilizedZones: resourceOptimization.filter((z) => z.recommendation === 'reduce_resources').length,
            optimalZones: resourceOptimization.filter((z) => z.recommendation === 'optimal').length,
            averageEfficiency: Math.round(resourceOptimization.reduce((sum, z) => sum + z.efficiency, 0) / resourceOptimization.length)
        };
        res.json({
            success: true,
            data: (0, bigint_1.serializeBigInts)({
                summary,
                zones: resourceOptimization
            })
        });
    }
    catch (error) {
        console.error('Error fetching resource optimization:', error);
        res.status(500).json({ error: 'Failed to fetch resource optimization' });
    }
};
exports.getResourceOptimization = getResourceOptimization;
// Get service reports
const getServiceReports = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { reportType = 'summary', timeframe = '30d', zoneId } = req.query;
        const days = parseInt(timeframe.toString().replace('d', '')) || 30;
        const startDate = (0, date_fns_1.subDays)(new Date(), days);
        let reportData = {};
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
        res.json((0, bigint_1.serializeBigInts)(reportData));
    }
    catch (error) {
        console.error('Error generating service reports:', error);
        res.status(500).json({ error: 'Failed to generate service reports' });
    }
};
exports.getServiceReports = getServiceReports;
// Export FSA data
const exportFSAData = async (req, res) => {
    try {
        const user = req.user;
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
        }
        else {
            // CSV export would be implemented here
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=fsa-export.csv');
            res.send('CSV export not implemented yet');
        }
    }
    catch (error) {
        console.error('Error exporting FSA data:', error);
        res.status(500).json({ error: 'Failed to export FSA data' });
    }
};
exports.exportFSAData = exportFSAData;
// Helper functions
function buildTicketZoneFilter(zoneIds) {
    if (!zoneIds || zoneIds.length === 0) {
        return {};
    }
    return {
        customer: {
            serviceZoneId: { in: zoneIds }
        }
    };
}
async function calculateSlaCompliance(zoneIds) {
    try {
        const whereClause = zoneIds?.length
            ? { customer: { serviceZoneId: { in: zoneIds } } }
            : {};
        const totalTickets = await db_1.default.ticket.count({
            where: {
                ...whereClause,
                status: { in: ['RESOLVED', 'CLOSED'] }
            }
        });
        if (totalTickets === 0)
            return 100;
        const slaCompliantTickets = await db_1.default.ticket.count({
            where: {
                ...whereClause,
                status: { in: ['RESOLVED', 'CLOSED'] },
                slaStatus: 'ON_TIME'
            }
        });
        return Math.round((slaCompliantTickets / totalTickets) * 100);
    }
    catch (error) {
        console.error('Error calculating SLA compliance:', error);
        return 0;
    }
}
async function getUserPerformanceAnalytics(userId, days) {
    const startDate = (0, date_fns_1.subDays)(new Date(), days);
    const user = await db_1.default.user.findUnique({
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
    const resolvedTickets = tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED');
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
async function getServicePersonPerformanceAnalytics(servicePersonId, days) {
    return getUserPerformanceAnalytics(servicePersonId, days);
}
async function getZoneDetailedAnalytics(zoneId, days) {
    const startDate = (0, date_fns_1.subDays)(new Date(), days);
    const zone = await db_1.default.serviceZone.findUnique({
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
    const openTickets = tickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED').length;
    const resolvedTickets = tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length;
    const resolutionRate = totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0;
    // Calculate average resolution time for resolved tickets
    const resolvedTicketsWithTime = tickets.filter((t) => (t.status === 'RESOLVED' || t.status === 'CLOSED') && t.updatedAt);
    const totalResolutionTime = resolvedTicketsWithTime.reduce((sum, ticket) => {
        return sum + (0, date_fns_1.differenceInHours)(ticket.updatedAt, ticket.createdAt);
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
    }, {});
    // Group tickets by priority
    const priorityCounts = tickets.reduce((acc, ticket) => {
        acc[ticket.priority] = (acc[ticket.priority] || 0) + 1;
        return acc;
    }, {});
    // Customer performance
    const customerPerformance = zone.customers.map((customer) => {
        const customerTickets = customer.tickets;
        const resolvedCustomerTickets = customerTickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED');
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
    const servicePersonPerformance = zone.servicePersons.map((sp) => {
        const user = sp.user;
        const userTickets = user.assignedTickets;
        const resolvedUserTickets = userTickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED');
        const userResolutionRate = userTickets.length > 0
            ? (resolvedUserTickets.length / userTickets.length) * 100
            : 0;
        // Calculate average resolution time
        const resolvedTicketsWithTime = userTickets.filter((t) => (t.status === 'RESOLVED' || t.status === 'CLOSED') && t.updatedAt);
        const totalResolutionTime = resolvedTicketsWithTime.reduce((sum, ticket) => {
            return sum + (0, date_fns_1.differenceInHours)(ticket.updatedAt, ticket.createdAt);
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
        .map((ticket) => ({
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
// Helper functions for advanced analytics
function generateTicketForecast(historicalData) {
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
        const forecastDate = (0, date_fns_1.addDays)(lastDate, i);
        const predicted = Math.max(0, Math.round(avgCount + (trend * i)));
        const confidence = Math.max(60, 95 - (i * 5)); // Decreasing confidence over time
        forecast.push({
            date: (0, date_fns_1.format)(forecastDate, 'yyyy-MM-dd'),
            predicted,
            confidence
        });
    }
    return forecast;
}
async function generateSummaryReport(startDate, zoneId) {
    const whereClause = zoneId ? { customer: { serviceZoneId: zoneId } } : {};
    const [totalTickets, resolvedTickets, avgResolutionTime] = await Promise.all([
        db_1.default.ticket.count({
            where: {
                ...whereClause,
                createdAt: { gte: startDate }
            }
        }),
        db_1.default.ticket.count({
            where: {
                ...whereClause,
                createdAt: { gte: startDate },
                status: { in: ['RESOLVED', 'CLOSED'] }
            }
        }),
        db_1.default.ticket.findMany({
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
            return sum + (0, date_fns_1.differenceInHours)(ticket.updatedAt, ticket.createdAt);
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
async function generatePerformanceReport(startDate, zoneId) {
    // Implementation would go here
    return {
        reportType: 'performance',
        message: 'Performance report generation not implemented yet'
    };
}
async function generateSLAReport(startDate, zoneId) {
    // Implementation would go here
    return {
        reportType: 'sla',
        message: 'SLA report generation not implemented yet'
    };
}
