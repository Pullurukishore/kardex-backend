"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCustomerSatisfaction = exports.getSlaMetrics = exports.getTicketStats = void 0;
const client_1 = require("@prisma/client");
// Map Prisma enums to string literals for type safety
// Use the actual TicketStatus enum values from Prisma
const ResolvedTicketStatuses = [
    'CLOSED'
];
const db_1 = __importDefault(require("../config/db"));
const date_fns_1 = require("date-fns");
// Helper to get date range based on period
function getDateRange(period) {
    const now = new Date();
    switch (period) {
        case 'today':
            return {
                startDate: (0, date_fns_1.startOfDay)(now),
                endDate: (0, date_fns_1.endOfDay)(now)
            };
        case 'yesterday':
            const yesterday = (0, date_fns_1.subDays)(now, 1);
            return {
                startDate: (0, date_fns_1.startOfDay)(yesterday),
                endDate: (0, date_fns_1.endOfDay)(yesterday)
            };
        case 'this_week':
            return {
                startDate: (0, date_fns_1.subDays)(now, 7),
                endDate: now
            };
        case 'this_month':
            return {
                startDate: (0, date_fns_1.startOfMonth)(now),
                endDate: now
            };
        case 'last_month':
            const lastMonth = (0, date_fns_1.subDays)((0, date_fns_1.startOfMonth)(now), 1);
            return {
                startDate: (0, date_fns_1.startOfMonth)(lastMonth),
                endDate: (0, date_fns_1.endOfMonth)(lastMonth)
            };
        default:
            return {
                startDate: (0, date_fns_1.subDays)(now, 30),
                endDate: now
            };
    }
}
// Get ticket statistics
const getTicketStats = async (req, res) => {
    try {
        const { period = '30d' } = req.query;
        const user = req.user;
        const dateRange = getDateRange(period);
        const { startDate, endDate } = dateRange;
        // Define base where clause with proper typing
        let where = {
            createdAt: {
                gte: startDate,
                lte: endDate
            }
        };
        // Apply role-based filtering with proper type checking
        const userRole = user.role;
        if (userRole === client_1.UserRole.CUSTOMER_ACCOUNT_OWNER && user.customerId) {
            where = {
                ...where,
                customerId: user.customerId
            };
        }
        else if (userRole === client_1.UserRole.SERVICE_PERSON) {
            where = {
                ...where,
                OR: [
                    { assignedToId: user.id },
                    { assignedTo: { serviceZones: { some: { userId: user.id } } } }
                ]
            };
        }
        const statusCounts = await db_1.default.ticket.groupBy({
            by: ['status'],
            _count: { id: true },
            where
        });
        const resolvedTickets = await db_1.default.ticket.findMany({
            where: {
                ...where,
                status: { in: ResolvedTicketStatuses },
                updatedAt: { not: undefined }
            },
            select: {
                id: true,
                createdAt: true,
                updatedAt: true,
                status: true
            }
        });
        // Calculate resolution times in hours
        const resolutionTimes = resolvedTickets
            .filter((ticket) => {
            return ticket.updatedAt !== null;
        })
            .map(ticket => {
            const diffMs = ticket.updatedAt.getTime() - ticket.createdAt.getTime();
            return diffMs / (1000 * 60 * 60); // Convert to hours
        });
        // Calculate average resolution time
        const avgResolutionTime = resolutionTimes.length > 0
            ? resolutionTimes.reduce((sum, time) => sum + time, 0) / resolutionTimes.length
            : 0;
        const ticketTrends = await db_1.default.$queryRaw `
      SELECT 
        DATE(createdAt) as date,
        COUNT(*) as count
      FROM Ticket
      WHERE createdAt BETWEEN ${startDate} AND ${endDate}
      ${user.role === client_1.UserRole.CUSTOMER_ACCOUNT_OWNER ? client_1.Prisma.sql `AND customerId = ${user.customerId}` : client_1.Prisma.empty}
      ${user.role === client_1.UserRole.SERVICE_PERSON ? client_1.Prisma.sql `AND (assignedToId = ${user.id} OR assignedToId IN (
        SELECT userId FROM ServiceZoneUser WHERE userId = ${user.id}
      ))` : client_1.Prisma.empty}
      GROUP BY DATE(createdAt)
      ORDER BY date ASC
    `;
        let topCustomers = [];
        if (user.role === client_1.UserRole.ADMIN) {
            topCustomers = await db_1.default.customer.findMany({
                take: 5,
                orderBy: {
                    tickets: {
                        _count: 'desc'
                    }
                },
                select: {
                    id: true,
                    companyName: true,
                    _count: {
                        select: { tickets: true }
                    }
                },
                where: {
                    tickets: {
                        some: {
                            createdAt: {
                                gte: startDate,
                                lte: endDate
                            }
                        }
                    }
                }
            });
        }
        let servicePersonStats = [];
        if (user.role === client_1.UserRole.ADMIN) {
            // First get all service persons with their ticket counts
            const servicePersons = await db_1.default.user.findMany({
                where: {
                    role: client_1.UserRole.SERVICE_PERSON,
                    isActive: true
                },
                select: {
                    id: true,
                    email: true
                }
            });
            // Get ticket counts for each service person
            const ticketCounts = await Promise.all(servicePersons.map(async (person) => {
                const [totalTickets, resolvedTickets] = await Promise.all([
                    db_1.default.ticket.count({
                        where: {
                            assignedToId: person.id,
                            createdAt: { gte: startDate, lte: endDate }
                        }
                    }),
                    db_1.default.ticket.count({
                        where: {
                            assignedToId: person.id,
                            status: 'CLOSED',
                            updatedAt: { not: undefined },
                            createdAt: { gte: startDate, lte: endDate }
                        }
                    })
                ]);
                // Get resolution times for closed tickets
                const resolvedTicketsData = await db_1.default.ticket.findMany({
                    where: {
                        assignedToId: person.id,
                        status: 'CLOSED',
                        updatedAt: { not: undefined },
                        createdAt: { gte: startDate, lte: endDate }
                    },
                    select: {
                        createdAt: true,
                        updatedAt: true
                    }
                });
                // Calculate average resolution time
                let avgResolutionTime = 0;
                if (resolvedTicketsData.length > 0) {
                    const totalHours = resolvedTicketsData.reduce((sum, ticket) => {
                        if (ticket.updatedAt) {
                            const hours = (ticket.updatedAt.getTime() - ticket.createdAt.getTime()) / (1000 * 60 * 60);
                            return sum + hours;
                        }
                        return sum;
                    }, 0);
                    avgResolutionTime = totalHours / resolvedTicketsData.length;
                }
                return {
                    id: person.id.toString(),
                    email: person.email,
                    totalTickets,
                    resolvedTickets,
                    avgResolutionTime: Math.round(avgResolutionTime * 10) / 10
                };
            }));
            // Sort by resolved tickets
            servicePersonStats = ticketCounts.sort((a, b) => b.resolvedTickets - a.resolvedTickets);
        }
        const statusCountsMap = statusCounts.reduce((acc, { status, _count }) => ({
            ...acc,
            [status.toLowerCase()]: _count.id
        }), {});
        const totalTickets = statusCounts.reduce((sum, { _count }) => sum + _count.id, 0);
        const openTickets = statusCounts
            .filter(({ status }) => [
            'OPEN',
            'IN_PROGRESS',
            'WAITING_FOR_RESPONSE',
            'SPARE_NEEDED',
            'WAITING_FOR_PO'
        ].includes(status))
            .reduce((sum, { _count }) => sum + _count.id, 0);
        return res.json({
            period: { startDate, endDate },
            summary: {
                totalTickets,
                openTickets,
                resolvedTickets: statusCountsMap['fixed_pending_closure'] || 0,
                closedTickets: statusCountsMap['closed'] || 0,
                avgResolutionTime: Math.round(avgResolutionTime * 10) / 10
            },
            statusDistribution: statusCountsMap,
            trends: ticketTrends,
            ...(user.role === client_1.UserRole.ADMIN && {
                topCustomers,
                servicePersonStats
            })
        });
    }
    catch (error) {
        console.error('Error getting ticket stats:', error);
        return res.status(500).json({ error: 'Failed to get ticket statistics' });
    }
};
exports.getTicketStats = getTicketStats;
// Get SLA metrics
const getSlaMetrics = async (req, res) => {
    try {
        const { period = '30d' } = req.query;
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { startDate, endDate } = getDateRange(period);
        const where = {
            createdAt: {
                gte: startDate,
                lte: endDate
            },
            status: { in: ['CLOSED'] },
            updatedAt: { not: undefined }
        };
        if (user.role === client_1.UserRole.CUSTOMER_ACCOUNT_OWNER || user.role === client_1.UserRole.CUSTOMER_CONTACT) {
            where.customerId = user.customerId;
        }
        else if (user.role === client_1.UserRole.SERVICE_PERSON) {
            where.OR = [
                { assignedToId: user.id },
                { assignedTo: { serviceZones: { some: { userId: user.id } } } }
            ];
        }
        const resolvedTickets = await db_1.default.ticket.findMany({
            where,
            select: {
                id: true,
                priority: true,
                createdAt: true,
                updatedAt: true,
                customer: {
                    select: {
                        id: true,
                        companyName: true
                    }
                },
                assignedTo: {
                    select: {
                        id: true,
                        // Remove name as it's not in UserSelect
                    }
                }
            },
            orderBy: {
                updatedAt: 'desc'
            }
        });
        const slaMetrics = resolvedTickets.map(ticket => {
            const resolutionTimeHours = (ticket.updatedAt.getTime() - ticket.createdAt.getTime()) / (1000 * 60 * 60);
            const slaThresholds = {
                'URGENT': 4,
                'HIGH': 8,
                'MEDIUM': 24,
                'LOW': 72
            };
            const threshold = slaThresholds[ticket.priority] || 24;
            const withinSla = resolutionTimeHours <= threshold;
            return {
                ...ticket,
                resolutionTimeHours: Math.round(resolutionTimeHours * 10) / 10,
                slaThreshold: threshold,
                withinSla
            };
        });
        const totalResolved = slaMetrics.length;
        const compliantTickets = slaMetrics.filter(ticket => ticket.withinSla).length;
        const complianceRate = totalResolved > 0
            ? Math.round((compliantTickets / totalResolved) * 100)
            : 0;
        const priorityMetrics = slaMetrics.reduce((acc, ticket) => {
            if (!acc[ticket.priority]) {
                acc[ticket.priority] = {
                    total: 0,
                    compliant: 0,
                    avgResolutionTime: 0,
                    tickets: []
                };
            }
            acc[ticket.priority].total++;
            if (ticket.withinSla)
                acc[ticket.priority].compliant++;
            acc[ticket.priority].tickets.push(ticket);
            return acc;
        }, {});
        Object.entries(priorityMetrics).forEach(([priority, data]) => {
            const totalTime = data.tickets.reduce((sum, t) => sum + t.resolutionTimeHours, 0);
            priorityMetrics[priority].avgResolutionTime = data.tickets.length > 0
                ? Math.round((totalTime / data.tickets.length) * 10) / 10
                : 0;
        });
        return res.json({
            period: { startDate, endDate },
            summary: {
                totalResolved,
                compliantTickets,
                complianceRate,
                avgResolutionTime: Math.round(slaMetrics.reduce((sum, t) => sum + t.resolutionTimeHours, 0) / (totalResolved || 1) * 10) / 10
            },
            byPriority: priorityMetrics,
            tickets: slaMetrics
        });
    }
    catch (error) {
        console.error('Error getting SLA metrics:', error);
        return res.status(500).json({ error: 'Failed to get SLA metrics' });
    }
};
exports.getSlaMetrics = getSlaMetrics;
// Get customer satisfaction metrics
const getCustomerSatisfaction = async (req, res) => {
    try {
        const { period = '30d' } = req.query;
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        // Since we don't have a feedback model, we'll return empty data for now
        // In a real implementation, you would need to:
        // 1. Create a feedback model in the Prisma schema
        // 2. Implement feedback collection in your application
        // 3. Update this function to query the actual feedback data
        const { startDate, endDate } = getDateRange(period);
        // Mock data structure - replace with actual implementation when feedback model is available
        const feedbackData = [];
        const totalRatings = feedbackData.length;
        const totalScore = feedbackData.reduce((sum, { rating }) => sum + rating, 0);
        const avgRating = totalRatings > 0 ? Math.round((totalScore / totalRatings) * 10) / 10 : 0;
        // Initialize rating distribution with all possible ratings (1-5)
        const ratingDistribution = feedbackData.reduce((acc, { rating }) => {
            // Ensure rating is between 1 and 5
            const validRating = Math.min(5, Math.max(1, Math.round(rating)));
            acc[validRating] = (acc[validRating] || 0) + 1;
            return acc;
        }, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
        const promoters = feedbackData.filter(f => f.rating >= 4).length;
        const detractors = feedbackData.filter(f => f.rating <= 2).length;
        const nps = totalRatings > 0
            ? Math.round(((promoters - detractors) / totalRatings) * 100)
            : 0;
        // Calculate service person ratings from feedback data
        const servicePersonRatings = feedbackData
            .filter(feedback => feedback.ticket.assignedTo)
            .reduce((acc, { rating, ticket }) => {
            if (!ticket.assignedTo)
                return acc;
            const { id } = ticket.assignedTo;
            if (!acc[id]) {
                acc[id] = {
                    totalRatings: 0,
                    totalScore: 0,
                    avgRating: 0
                };
            }
            acc[id].totalRatings += 1;
            acc[id].totalScore += rating;
            acc[id].avgRating = acc[id].totalScore / acc[id].totalRatings;
            return acc;
        }, {});
        // Convert to array and format
        const servicePersonRatingsArray = [];
        for (const [id, data] of Object.entries(servicePersonRatings)) {
            // Find the corresponding service person to get their name
            const servicePerson = feedbackData.find(f => f.ticket.assignedTo?.id === id)?.ticket.assignedTo;
            if (servicePerson) {
                servicePersonRatingsArray.push({
                    id,
                    name: servicePerson.name,
                    totalRatings: data.totalRatings,
                    totalScore: data.totalScore,
                    avgRating: parseFloat(data.avgRating.toFixed(1))
                });
            }
        }
        return res.json({
            period: { startDate, endDate },
            summary: {
                totalRatings,
                avgRating,
                nps,
                ratingDistribution,
                feedbackCount: feedbackData.length
            },
            ...(user.role === client_1.UserRole.ADMIN && { servicePersonRatings: servicePersonRatingsArray }),
            feedback: feedbackData
        });
    }
    catch (error) {
        console.error('Error getting customer satisfaction metrics:', error);
        return res.status(500).json({
            error: 'Customer satisfaction metrics are not yet implemented. Please implement a feedback system first.'
        });
    }
};
exports.getCustomerSatisfaction = getCustomerSatisfaction;
