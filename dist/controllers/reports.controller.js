"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportZoneReport = exports.generateZoneReport = exports.exportReport = exports.generateReport = void 0;
const client_1 = require("@prisma/client");
const date_fns_1 = require("date-fns");
const pdfGenerator_1 = require("../utils/pdfGenerator");
const excelGenerator_1 = require("../utils/excelGenerator");
// Define enums since they're not exported from Prisma client
var TicketStatus;
(function (TicketStatus) {
    TicketStatus["OPEN"] = "OPEN";
    TicketStatus["IN_PROGRESS"] = "IN_PROGRESS";
    TicketStatus["RESOLVED"] = "RESOLVED";
    TicketStatus["CLOSED"] = "CLOSED";
    TicketStatus["CANCELLED"] = "CANCELLED";
    TicketStatus["ASSIGNED"] = "ASSIGNED";
    TicketStatus["PENDING"] = "PENDING";
})(TicketStatus || (TicketStatus = {}));
var Priority;
(function (Priority) {
    Priority["LOW"] = "LOW";
    Priority["MEDIUM"] = "MEDIUM";
    Priority["HIGH"] = "HIGH";
    Priority["CRITICAL"] = "CRITICAL";
})(Priority || (Priority = {}));
var SLAStatus;
(function (SLAStatus) {
    SLAStatus["ON_TIME"] = "ON_TIME";
    SLAStatus["BREACHED"] = "BREACHED";
    SLAStatus["AT_RISK"] = "AT_RISK";
})(SLAStatus || (SLAStatus = {}));
var UserRole;
(function (UserRole) {
    UserRole["ADMIN"] = "ADMIN";
    UserRole["ZONE_USER"] = "ZONE_USER";
    UserRole["SERVICE_PERSON"] = "SERVICE_PERSON";
})(UserRole || (UserRole = {}));
const prisma = new client_1.PrismaClient();
const generateReport = async (req, res) => {
    try {
        const { from, to, zoneId, reportType, customerId, assetId } = req.query;
        const startDate = from ? new Date(from) : (0, date_fns_1.subDays)(new Date(), 30);
        const endDate = to ? new Date(to) : new Date();
        // Set end date to end of day
        endDate.setHours(23, 59, 59, 999);
        const whereClause = {
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
    }
    catch (error) {
        console.error('Error generating report:', error);
        return res.status(500).json({ error: 'Failed to generate report' });
    }
};
exports.generateReport = generateReport;
;
// Helper functions for different report types
async function generateTicketSummaryReport(res, whereClause, startDate, endDate) {
    // Comprehensive data fetching with all necessary relations
    const [tickets, statusDistribution, priorityDistribution, slaDistribution, zoneDistribution, customerDistribution, assigneeDistribution] = await Promise.all([
        // Main tickets with all relations
        prisma.ticket.findMany({
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
                rating: true
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
    const dateRange = (0, date_fns_1.eachDayOfInterval)({ start: startDate, end: endDate });
    const dailyTrends = await Promise.all(dateRange.map(async (date) => {
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
            date: (0, date_fns_1.format)(date, 'yyyy-MM-dd'),
            created,
            resolved,
            escalated,
            assigned
        };
    }));
    // Calculate average resolution time
    const resolvedTickets = tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED');
    let avgResolutionTime = 0;
    if (resolvedTickets.length > 0) {
        // Get tickets with status history to find actual resolution time
        const ticketsWithHistory = await prisma.ticket.findMany({
            where: {
                id: { in: resolvedTickets.map((t) => t.id) }
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
            let resolutionTime = null;
            // First try to get resolution time from status history
            if (ticket.statusHistory && ticket.statusHistory.length > 0) {
                resolutionTime = ticket.statusHistory[0].changedAt;
            }
            // Fallback to updatedAt if no status history
            else if (ticket.updatedAt && ticket.createdAt) {
                // Only use updatedAt if it's significantly different from createdAt (more than 1 minute)
                const timeDiff = (0, date_fns_1.differenceInMinutes)(ticket.updatedAt, ticket.createdAt);
                if (timeDiff > 1) {
                    resolutionTime = ticket.updatedAt;
                }
            }
            if (resolutionTime && ticket.createdAt) {
                const resolutionMinutes = (0, date_fns_1.differenceInMinutes)(resolutionTime, ticket.createdAt);
                // Only include reasonable resolution times (between 1 minute and 30 days)
                if (resolutionMinutes >= 1 && resolutionMinutes <= 43200) { // 30 days = 43200 minutes
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
    const criticalTickets = tickets.filter((t) => t.priority === 'CRITICAL');
    const highPriorityTickets = tickets.filter((t) => t.priority === 'HIGH');
    const unassignedTickets = tickets.filter((t) => !t.assignedToId);
    const overdueTickets = tickets.filter((t) => t.slaDueAt && now > new Date(t.slaDueAt));
    const ticketsWithFeedback = tickets.filter((t) => t.feedbacks?.length > 0 || t.rating);
    // Calculate customer satisfaction metrics
    const ratingsData = tickets.filter((t) => t.rating?.rating).map((t) => t.rating.rating);
    const avgCustomerRating = ratingsData.length > 0
        ? Math.round((ratingsData.reduce((sum, rating) => sum + rating, 0) / ratingsData.length) * 100) / 100
        : 0;
    // Calculate first response time
    const ticketsWithHistory = tickets.filter((t) => t.statusHistory?.length > 0);
    let avgFirstResponseTime = 0;
    if (ticketsWithHistory.length > 0) {
        const firstResponseTimes = ticketsWithHistory
            .map((t) => {
            const firstResponse = t.statusHistory.find((h) => h.status !== 'OPEN');
            if (firstResponse) {
                return (0, date_fns_1.differenceInMinutes)(new Date(firstResponse.changedAt), new Date(t.createdAt));
            }
            return null;
        })
            .filter((time) => time !== null && time > 0 && time <= 1440); // Max 24 hours
        if (firstResponseTimes.length > 0) {
            avgFirstResponseTime = Math.round(firstResponseTimes.reduce((sum, time) => sum + time, 0) / firstResponseTimes.length);
        }
    }
    // Get zone names for distribution
    const zoneNames = await prisma.serviceZone.findMany({
        where: { id: { in: zoneDistribution.map((z) => z.zoneId) } },
        select: { id: true, name: true }
    });
    // Get customer names for distribution
    const customerNames = await prisma.customer.findMany({
        where: { id: { in: customerDistribution.map((c) => c.customerId) } },
        select: { id: true, companyName: true }
    });
    // Get assignee names for distribution
    const assigneeNames = await prisma.user.findMany({
        where: { id: { in: assigneeDistribution.filter((a) => a.assignedToId).map((a) => a.assignedToId) } },
        select: { id: true, name: true, email: true }
    });
    // Calculate resolution rate
    const resolutionRate = tickets.length > 0
        ? Math.round((resolvedTickets.length / tickets.length) * 100 * 100) / 100
        : 0;
    // Calculate escalation rate
    const escalationRate = tickets.length > 0
        ? Math.round((tickets.filter((t) => t.isEscalated).length / tickets.length) * 100 * 100) / 100
        : 0;
    // Calculate customer performance metrics (more tickets = machine issues)
    const customerPerformanceMetrics = customerDistribution.map((c) => {
        const customerTickets = tickets.filter((t) => t.customerId === c.customerId);
        const customerName = customerNames.find((cn) => cn.id === c.customerId)?.companyName || 'Unknown Customer';
        // Calculate machine issue indicators
        const criticalIssues = customerTickets.filter((t) => t.priority === 'CRITICAL').length;
        const highPriorityIssues = customerTickets.filter((t) => t.priority === 'HIGH').length;
        const escalatedIssues = customerTickets.filter((t) => t.isEscalated).length;
        const repeatIssues = customerTickets.filter((t) => {
            // Check if customer has multiple tickets for same asset
            const assetTickets = customerTickets.filter((at) => at.assetId === t.assetId);
            return assetTickets.length > 1;
        }).length;
        // Calculate average resolution time for this customer
        const customerResolvedTickets = customerTickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED');
        let avgCustomerResolutionTime = 0;
        if (customerResolvedTickets.length > 0) {
            const customerResolutionTimes = customerResolvedTickets
                .map((t) => {
                const resolutionHistory = t.statusHistory?.find((h) => h.status === 'RESOLVED' || h.status === 'CLOSED');
                if (resolutionHistory) {
                    return (0, date_fns_1.differenceInMinutes)(new Date(resolutionHistory.changedAt), new Date(t.createdAt));
                }
                return null;
            })
                .filter((time) => time !== null && time > 0 && time <= 43200);
            if (customerResolutionTimes.length > 0) {
                avgCustomerResolutionTime = Math.round(customerResolutionTimes.reduce((sum, time) => sum + time, 0) / customerResolutionTimes.length);
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
    }).sort((a, b) => b.totalTickets - a.totalTickets); // Sort by ticket count (most issues first)
    // Calculate onsite visit traveling time
    const onsiteTickets = tickets.filter((t) => t.visitStartedAt && (t.visitReachedAt || t.visitInProgressAt));
    let avgOnsiteTravelTime = 0;
    let avgOnsiteTravelTimeHours = 0;
    if (onsiteTickets.length > 0) {
        const travelTimes = onsiteTickets
            .map((t) => {
            const startTime = new Date(t.visitStartedAt);
            const reachTime = new Date(t.visitReachedAt || t.visitInProgressAt);
            const travelMinutes = (0, date_fns_1.differenceInMinutes)(reachTime, startTime);
            // Validate travel time (should be between 1 minute and 8 hours)
            if (travelMinutes > 0 && travelMinutes <= 480) {
                return travelMinutes;
            }
            return null;
        })
            .filter((time) => time !== null);
        if (travelTimes.length > 0) {
            avgOnsiteTravelTime = Math.round(travelTimes.reduce((sum, time) => sum + time, 0) / travelTimes.length);
            avgOnsiteTravelTimeHours = Math.round((avgOnsiteTravelTime / 60) * 100) / 100;
        }
    }
    res.json({
        summary: {
            // Basic counts
            totalTickets: tickets.length,
            openTickets: tickets.filter((t) => t.status === 'OPEN').length,
            inProgressTickets: tickets.filter((t) => ['IN_PROGRESS', 'ASSIGNED', 'IN_PROCESS', 'ONSITE_VISIT', 'ONSITE_VISIT_IN_PROGRESS'].includes(t.status)).length,
            resolvedTickets: resolvedTickets.length,
            closedTickets: tickets.filter((t) => t.status === 'CLOSED').length,
            // Priority-based metrics
            criticalTickets: criticalTickets.length,
            highPriorityTickets: highPriorityTickets.length,
            unassignedTickets: unassignedTickets.length,
            // SLA and performance metrics
            overdueTickets: overdueTickets.length,
            escalatedTickets: tickets.filter((t) => t.isEscalated).length,
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
        statusDistribution: statusDistribution.reduce((acc, curr) => ({
            ...acc,
            [curr.status]: curr._count
        }), {}),
        priorityDistribution: priorityDistribution.reduce((acc, curr) => ({
            ...acc,
            [curr.priority]: curr._count
        }), {}),
        slaDistribution: slaDistribution.reduce((acc, curr) => ({
            ...acc,
            [curr.slaStatus || 'NOT_SET']: curr._count
        }), {}),
        zoneDistribution: zoneDistribution.map((z) => ({
            zoneId: z.zoneId,
            zoneName: zoneNames.find((zn) => zn.id === z.zoneId)?.name || 'Unknown Zone',
            count: z._count
        })),
        customerDistribution: customerDistribution.map((c) => ({
            customerId: c.customerId,
            customerName: customerNames.find((cn) => cn.id === c.customerId)?.companyName || 'Unknown Customer',
            count: c._count
        })),
        assigneeDistribution: assigneeDistribution
            .filter((a) => a.assignedToId)
            .map((a) => ({
            assigneeId: a.assignedToId,
            assigneeName: assigneeNames.find((an) => an.id === a.assignedToId)?.name ||
                assigneeNames.find((an) => an.id === a.assignedToId)?.email || 'Unknown Assignee',
            count: a._count
        })),
        // Enhanced daily trends
        dailyTrends,
        // Recent tickets with full details
        recentTickets: tickets
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, 20)
            .map((ticket) => ({
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
                ? zoneNames.find((zn) => zn.id === zoneDistribution[0].zoneId)?.name || 'N/A'
                : 'N/A',
            mostActiveCustomer: customerDistribution.length > 0
                ? customerNames.find((cn) => cn.id === customerDistribution[0].customerId)?.companyName || 'N/A'
                : 'N/A',
            topAssignee: assigneeDistribution.length > 0 && assigneeDistribution[0].assignedToId
                ? assigneeNames.find((an) => an.id === assigneeDistribution[0].assignedToId)?.name || 'N/A'
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
async function generateSlaPerformanceReport(res, whereClause, startDate, endDate) {
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
    const slaBreaches = tickets.filter((t) => t.slaDueAt && now > t.slaDueAt);
    const slaOnTime = tickets.filter((t) => t.slaDueAt && now <= t.slaDueAt);
    // Calculate SLA compliance by priority
    const prioritySla = Object.values(Priority).reduce((acc, priority) => {
        const priorityTickets = tickets.filter((t) => t.priority === priority);
        const priorityBreaches = priorityTickets.filter((t) => t.slaDueAt && now > t.slaDueAt);
        acc[priority] = {
            total: priorityTickets.length,
            breaches: priorityBreaches.length,
            compliance: priorityTickets.length > 0
                ? ((priorityTickets.length - priorityBreaches.length) / priorityTickets.length) * 100
                : 100
        };
        return acc;
    }, {});
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
        breachedTickets: slaBreaches.map((t) => ({
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
async function generateCustomerSatisfactionReport(res, whereClause, startDate, endDate) {
    const data = await getCustomerSatisfactionData(whereClause, startDate, endDate);
    res.json(data);
}
async function getCustomerSatisfactionData(whereClause, startDate, endDate) {
    // Build where for feedback with optional zone restriction via ticket relation
    const feedbackWhere = {
        submittedAt: { gte: startDate, lte: endDate },
    };
    if (whereClause?.zoneId !== undefined) {
        if (typeof whereClause.zoneId === 'number' || typeof whereClause.zoneId === 'string') {
            feedbackWhere.ticket = { zoneId: parseInt(whereClause.zoneId) };
        }
        else if (typeof whereClause.zoneId === 'object' && whereClause.zoneId !== null) {
            if (Array.isArray(whereClause.zoneId.in)) {
                feedbackWhere.ticket = { zoneId: { in: whereClause.zoneId.in } };
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
    const ratingWhere = {
        createdAt: { gte: startDate, lte: endDate },
    };
    if (whereClause?.zoneId !== undefined) {
        if (typeof whereClause.zoneId === 'number' || typeof whereClause.zoneId === 'string') {
            ratingWhere.ticket = { zoneId: parseInt(whereClause.zoneId) };
        }
        else if (typeof whereClause.zoneId === 'object' && whereClause.zoneId !== null) {
            if (Array.isArray(whereClause.zoneId.in)) {
                ratingWhere.ticket = { zoneId: { in: whereClause.zoneId.in } };
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
    const ratingDistribution = {};
    for (let i = 1; i <= 5; i++) {
        ratingDistribution[i] = 0;
    }
    allFeedbacks.forEach((fb) => {
        if (fb.rating >= 1 && fb.rating <= 5) {
            ratingDistribution[fb.rating]++;
        }
    });
    // Calculate average rating
    const totalRating = allFeedbacks.reduce((sum, fb) => sum + fb.rating, 0);
    const averageRating = allFeedbacks.length > 0 ? totalRating / allFeedbacks.length : 0;
    // Group by customer
    const customerRatings = {};
    allFeedbacks.forEach((fb) => {
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
            positiveFeedbacks: allFeedbacks.filter((fb) => fb.rating >= 4).length,
            negativeFeedbacks: allFeedbacks.filter((fb) => fb.rating <= 2).length
        },
        ratingDistribution,
        customerRatings,
        recentFeedbacks: allFeedbacks
            .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())
            .slice(0, 20)
    };
}
async function generateZonePerformanceReport(res, whereClause, startDate, endDate) {
    // Create a clean where clause for the zone query
    const zoneWhere = {};
    // If a specific zone is selected, only fetch that zone
    if (whereClause.zoneId !== undefined) {
        if (typeof whereClause.zoneId === 'number' || typeof whereClause.zoneId === 'string') {
            zoneWhere.id = parseInt(whereClause.zoneId);
        }
        else if (typeof whereClause.zoneId === 'object' && whereClause.zoneId !== null) {
            // Support shape: { in: number[] }
            if (Array.isArray(whereClause.zoneId.in)) {
                zoneWhere.id = { in: whereClause.zoneId.in };
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
    const zoneStats = zones.map((zone) => {
        const tickets = zone.tickets;
        const resolvedTickets = tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED');
        const openTickets = tickets.filter((t) => ['OPEN', 'IN_PROGRESS', 'ASSIGNED'].includes(t.status));
        // Calculate average resolution time for this zone
        let avgResolutionTime = 0;
        if (resolvedTickets.length > 0) {
            const totalTime = resolvedTickets.reduce((sum, ticket) => {
                if (ticket.createdAt && ticket.updatedAt) {
                    return sum + (0, date_fns_1.differenceInMinutes)(ticket.updatedAt, ticket.createdAt);
                }
                return sum;
            }, 0);
            avgResolutionTime = Math.round(totalTime / resolvedTickets.length);
        }
        // Count customers and assets in this zone
        const customerCount = zone.customers.length;
        const assetCount = zone.customers.reduce((sum, customer) => sum + customer.assets.length, 0);
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
            escalatedTickets: tickets.filter((t) => t.isEscalated).length
        };
    });
    res.json({
        zones: zoneStats.sort((a, b) => b.resolutionRate - a.resolutionRate),
        totalZones: zones.length,
        overallStats: {
            totalTickets: zoneStats.reduce((sum, zone) => sum + (zone.totalTickets || 0), 0),
            totalResolved: zoneStats.reduce((sum, zone) => sum + (zone.resolvedTickets || 0), 0),
            averageResolutionRate: zoneStats.length > 0
                ? zoneStats.reduce((sum, zone) => sum + zone.resolutionRate, 0) / zoneStats.length
                : 0
        }
    });
}
async function generateAgentProductivityReport(res, whereClause, startDate, endDate) {
    // Build filter for agents: service persons that have assigned tickets in allowed zones/date
    const assignedTicketsWhere = { ...whereClause };
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
    const agentStats = agents.map((agent) => {
        const tickets = agent.assignedTickets || [];
        const resolvedTickets = tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED');
        // Calculate average resolution time in minutes
        const resolvedWithTime = resolvedTickets.filter((t) => t.createdAt && t.updatedAt);
        const totalResolutionTime = resolvedWithTime.reduce((sum, t) => {
            return sum + (0, date_fns_1.differenceInMinutes)(t.updatedAt, t.createdAt);
        }, 0);
        const avgResolutionTime = resolvedWithTime.length > 0
            ? Math.round(totalResolutionTime / resolvedWithTime.length)
            : 0;
        // Calculate first response time (simplified)
        const ticketsWithResponse = tickets.filter((t) => t.updatedAt !== t.createdAt);
        const avgFirstResponseTime = ticketsWithResponse.length > 0
            ? Math.round(ticketsWithResponse.reduce((sum, t) => {
                return sum + (0, date_fns_1.differenceInMinutes)(t.updatedAt, t.createdAt);
            }, 0) / ticketsWithResponse.length)
            : 0;
        return {
            agentId: agent.id,
            agentName: agent.name || agent.email || `Agent ${agent.id}`,
            email: agent.email,
            zones: agent.serviceZones.map((sz) => sz.serviceZone.name),
            totalTickets: tickets.length,
            resolvedTickets: resolvedTickets.length,
            openTickets: tickets.filter((t) => ['OPEN', 'IN_PROGRESS', 'ASSIGNED'].includes(t.status)).length,
            resolutionRate: tickets.length > 0
                ? parseFloat(((resolvedTickets.length / tickets.length) * 100).toFixed(2))
                : 0,
            averageResolutionTime: avgResolutionTime,
            averageFirstResponseTime: avgFirstResponseTime,
            escalatedTickets: tickets.filter((t) => t.isEscalated).length
        };
    });
    res.json({
        agents: agentStats.sort((a, b) => b.resolutionRate - a.resolutionRate),
        totalAgents: agents.length,
        performanceMetrics: {
            topPerformer: agentStats.length > 0
                ? agentStats.reduce((max, agent) => agent.resolutionRate > max.resolutionRate ? agent : max, agentStats[0])
                : null,
            averageResolutionRate: agentStats.length > 0
                ? agentStats.reduce((sum, agent) => sum + agent.resolutionRate, 0) / agentStats.length
                : 0
        }
    });
}
async function generateIndustrialDataReport(res, whereClause, startDate, endDate, filters) {
    // Build base query for zone users and service persons
    const baseUserWhere = {
        isActive: true,
        ...((() => {
            // Support zoneId as single value or { in: [...] }
            if (whereClause?.zoneId === undefined)
                return {};
            if (typeof whereClause.zoneId === 'number' || typeof whereClause.zoneId === 'string') {
                return { serviceZones: { some: { serviceZoneId: parseInt(whereClause.zoneId) } } };
            }
            if (typeof whereClause.zoneId === 'object' && whereClause.zoneId !== null && Array.isArray(whereClause.zoneId.in)) {
                return { serviceZones: { some: { serviceZoneId: { in: whereClause.zoneId.in } } } };
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
    const ticketFilters = {
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
    const machineDowntime = ticketsWithDowntime.map((ticket) => {
        let downtimeMinutes = 0;
        if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
            // For resolved tickets, calculate the time between creation and resolution
            downtimeMinutes = (0, date_fns_1.differenceInMinutes)(ticket.updatedAt, ticket.createdAt);
        }
        else {
            // For open tickets, calculate time from creation to now
            downtimeMinutes = (0, date_fns_1.differenceInMinutes)(new Date(), ticket.createdAt);
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
    const machineDowntimeSummary = machineDowntime.reduce((acc, curr) => {
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
        }
        else {
            acc[machineKey].openIncidents += 1;
        }
        return acc;
    }, {});
    // Since we've already filtered tickets at the query level, we don't need additional filtering
    // Zone users are not filtered by customer as they manage zones, not specific customers
    const filteredZoneUsers = zoneUsers;
    // Machine downtime is already filtered by the ticket query with customerId and assetId
    const filteredMachineDowntime = Object.values(machineDowntimeSummary);
    // Prepare response
    const response = {
        zoneUsers: filteredZoneUsers.map((user) => ({
            id: user.id,
            name: user.name || user.email,
            email: user.email,
            phone: user.phone,
            zones: user.serviceZones.map((sz) => sz.serviceZone.name),
            customerId: user.customerId
        })),
        servicePersons: servicePersons.map((sp) => ({
            id: sp.id,
            name: sp.name,
            email: sp.email,
            phone: sp.phone,
            zones: sp.serviceZones.map((sz) => sz.serviceZone.name),
            assignedTickets: sp.assignedTickets.length,
            activeTickets: sp.assignedTickets.filter((t) => ['OPEN', 'IN_PROGRESS', 'ASSIGNED'].includes(t.status)).length
        })),
        machineDowntime: filteredMachineDowntime,
        detailedDowntime: machineDowntime,
        summary: {
            totalZoneUsers: zoneUsers.length,
            totalServicePersons: servicePersons.length,
            totalMachinesWithDowntime: filteredMachineDowntime.length,
            totalDowntimeHours: filteredMachineDowntime.reduce((sum, machine) => sum + Math.round((machine.totalDowntimeMinutes || 0) / 60 * 100) / 100, 0),
            averageDowntimePerMachine: filteredMachineDowntime.length > 0
                ? Math.round(filteredMachineDowntime.reduce((sum, machine) => sum + (machine.totalDowntimeMinutes || 0), 0) / filteredMachineDowntime.length)
                : 0
        }
    };
    return res.json(response);
}
const exportReport = async (req, res) => {
    try {
        const { from, to, zoneId, reportType, format = 'pdf', ...otherFilters } = req.query;
        console.log('Export request received:', { from, to, zoneId, reportType, format, otherFilters });
        // Validate required parameters
        if (!reportType) {
            console.error('Export failed: Report type is required');
            return res.status(400).json({ error: 'Report type is required' });
        }
        const startDate = from ? new Date(from) : (0, date_fns_1.subDays)(new Date(), 30);
        const endDate = to ? new Date(to) : new Date();
        // Set end date to end of day
        endDate.setHours(23, 59, 59, 999);
        const whereClause = {
            createdAt: {
                gte: startDate,
                lte: endDate,
            },
        };
        if (zoneId) {
            whereClause.zoneId = parseInt(zoneId);
        }
        console.log('Export whereClause:', whereClause);
        let data = [];
        let columns = [];
        let summaryData = null;
        // Custom title mapping for better report names
        const titleMap = {
            'industrial-data': 'Machine Report',
            'ticket-summary': 'Ticket Summary Report',
            'customer-satisfaction': 'Customer Satisfaction Report',
            'zone-performance': 'Zone Performance Report',
            'agent-productivity': 'Performance Report of All Service Persons and Zone Users',
            'sla-performance': 'SLA Performance Report',
            'executive-summary': 'Executive Summary Report',
            'her-analysis': 'Business Hours SLA Report'
        };
        const reportTitle = titleMap[reportType] || reportType.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        const filename = `${reportTitle.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}`;
        const filters = {
            from: startDate.toISOString(),
            to: endDate.toISOString(),
            ...Object.fromEntries(Object.entries(otherFilters).filter(([_, v]) => v !== undefined && v !== ''))
        };
        // Get data based on report type
        switch (reportType) {
            case 'ticket-summary':
                const ticketData = await getTicketSummaryData(whereClause, startDate, endDate);
                data = ticketData.tickets || [];
                summaryData = ticketData.summary;
                columns = (0, pdfGenerator_1.getPdfColumns)('ticket-summary');
                break;
            case 'sla-performance':
                const slaData = await getSlaPerformanceData(whereClause, startDate, endDate);
                data = slaData.breachedTickets || [];
                summaryData = slaData.summary;
                columns = (0, pdfGenerator_1.getPdfColumns)('sla-performance');
                break;
            case 'executive-summary':
                const executiveData = await getExecutiveSummaryData(whereClause, startDate, endDate);
                data = executiveData.trends || [];
                summaryData = executiveData.summary;
                columns = (0, pdfGenerator_1.getPdfColumns)('executive-summary');
                break;
            case 'customer-satisfaction':
                const satisfactionData = await getCustomerSatisfactionData(whereClause, startDate, endDate);
                data = satisfactionData.recentFeedbacks || [];
                // Calculate average rating
                const totalRatings = Object.entries(satisfactionData.ratingDistribution || {})
                    .reduce((sum, [rating, count]) => sum + (parseInt(rating) * count), 0);
                const totalResponses = Object.values(satisfactionData.ratingDistribution || {})
                    .reduce((sum, count) => sum + count, 0);
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
                    { key: 'createdAt', header: 'Date', width: 20, format: (date) => new Date(date).toLocaleString() },
                    { key: 'ticketId', header: 'Ticket ID', width: 15 },
                    { key: 'customerName', header: 'Customer', width: 30 }
                ];
                break;
            case 'industrial-data':
                const industrialData = await getIndustrialDataData(whereClause, startDate, endDate, otherFilters);
                data = industrialData.detailedDowntime || [];
                summaryData = industrialData.summary;
                columns = (0, pdfGenerator_1.getPdfColumns)('industrial-data');
                break;
            case 'agent-productivity':
                const agentData = await getAgentProductivityData(whereClause, startDate, endDate);
                data = agentData.agents || [];
                summaryData = agentData.summary;
                columns = (0, pdfGenerator_1.getPdfColumns)('agent-productivity');
                break;
            case 'zone-performance':
                const zoneData = await getZonePerformanceData(whereClause, startDate, endDate);
                data = zoneData.zones || [];
                summaryData = zoneData.summary;
                columns = (0, pdfGenerator_1.getPdfColumns)('zone-performance');
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
                const SLA_HOURS_BY_PRIORITY = {
                    'CRITICAL': 4, 'HIGH': 8, 'MEDIUM': 24, 'LOW': 48
                };
                const calculateBusinessHours = (startDate, endDate) => {
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
                data = herTickets.map((ticket) => {
                    const priority = ticket.priority || 'LOW';
                    const herHours = SLA_HOURS_BY_PRIORITY[priority] || SLA_HOURS_BY_PRIORITY['LOW'];
                    let businessHoursUsed = 0;
                    let isHerBreached = false;
                    let resolvedAt = null;
                    if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
                        businessHoursUsed = calculateBusinessHours(ticket.createdAt, ticket.updatedAt);
                        isHerBreached = businessHoursUsed > herHours;
                        resolvedAt = ticket.updatedAt;
                    }
                    else {
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
                const herCompliantTickets = data.filter((t) => t.isHerBreached === 'No').length;
                const herBreachedTickets = data.filter((t) => t.isHerBreached === 'Yes').length;
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
                    { key: 'createdAt', header: 'Created', width: 20, format: (date) => new Date(date).toLocaleString() },
                    { key: 'zone', header: 'Zone', width: 20 },
                    { key: 'herHours', header: 'SLA Hours', width: 15 },
                    { key: 'businessHoursUsed', header: 'Hours Used', width: 15 },
                    { key: 'isHerBreached', header: 'Breached', width: 15 },
                    { key: 'resolvedAt', header: 'Resolved', width: 20, format: (date) => date ? new Date(date).toLocaleString() : 'N/A' }
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
            await (0, pdfGenerator_1.generatePdf)(res, data, columns, reportTitle, filters, summaryData);
        }
        else if (format.toLowerCase() === 'excel' || format.toLowerCase() === 'xlsx') {
            // Generate Excel with enhanced formatting and summary data
            const excelColumns = (0, excelGenerator_1.getExcelColumns)(reportType);
            console.log('Generating Excel with columns:', excelColumns.map(c => c.key));
            await (0, excelGenerator_1.generateExcel)(res, data, excelColumns, reportTitle, filters, summaryData);
        }
        else {
            // Default to PDF export
            const pdfColumns = (0, pdfGenerator_1.getPdfColumns)(reportType);
            await (0, pdfGenerator_1.generatePdf)(res, data, pdfColumns, reportTitle, filters, summaryData);
        }
    }
    catch (error) {
        console.error('Error exporting report:', error);
        res.status(500).json({
            error: 'Failed to export report',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.exportReport = exportReport;
// Helper function to safely get nested properties
const getNestedValue = (obj, path) => {
    return path.split('.').reduce((acc, part) => {
        if (acc === null || acc === undefined)
            return '';
        if (Array.isArray(acc[part]))
            return acc[part].join(', ');
        return acc[part] !== undefined ? acc[part] : '';
    }, obj);
};
// Helper functions to get report data without sending response
async function getTicketSummaryData(whereClause, startDate, endDate) {
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
    const dateRange = (0, date_fns_1.eachDayOfInterval)({ start: startDate, end: endDate });
    const dailyTrends = await Promise.all(dateRange.map(async (date) => {
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
            date: (0, date_fns_1.format)(date, 'yyyy-MM-dd'),
            created,
            resolved
        };
    }));
    // Calculate average resolution time
    const resolvedTickets = tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED');
    let avgResolutionTime = 0;
    if (resolvedTickets.length > 0) {
        const totalTime = resolvedTickets.reduce((sum, ticket) => {
            if (ticket.createdAt && ticket.updatedAt) {
                return sum + (0, date_fns_1.differenceInMinutes)(ticket.updatedAt, ticket.createdAt);
            }
            return sum;
        }, 0);
        avgResolutionTime = Math.round(totalTime / resolvedTickets.length);
    }
    // Enhanced ticket data with all required fields
    const enhancedTickets = tickets.map((ticket) => {
        // Calculate response time (first response)
        let responseTime = 0;
        if (ticket.statusHistory && ticket.statusHistory.length > 0) {
            const firstResponse = ticket.statusHistory.find((h) => h.status !== 'OPEN');
            if (firstResponse) {
                responseTime = (0, date_fns_1.differenceInMinutes)(new Date(firstResponse.changedAt), new Date(ticket.createdAt));
            }
        }
        // Calculate travel time using status history: (STARTED → REACHED) + (RESOLVED → COMPLETED)
        let travelTime = 0;
        if (ticket.statusHistory && ticket.statusHistory.length > 0) {
            const statusHistory = ticket.statusHistory;
            // Going travel time (ONSITE_VISIT_STARTED → ONSITE_VISIT_REACHED)
            const goingStart = statusHistory.find((h) => h.status === 'ONSITE_VISIT_STARTED');
            const goingEnd = statusHistory.find((h) => h.status === 'ONSITE_VISIT_REACHED');
            // Return travel time (ONSITE_VISIT_RESOLVED → ONSITE_VISIT_COMPLETED)
            const returnStart = statusHistory.find((h) => h.status === 'ONSITE_VISIT_RESOLVED');
            const returnEnd = statusHistory.find((h) => h.status === 'ONSITE_VISIT_COMPLETED');
            let totalTravelMinutes = 0;
            let hasValidTravel = false;
            // Add going travel time
            if (goingStart && goingEnd && goingStart.changedAt < goingEnd.changedAt) {
                const goingMinutes = (0, date_fns_1.differenceInMinutes)(new Date(goingEnd.changedAt), new Date(goingStart.changedAt));
                if (goingMinutes > 0 && goingMinutes <= 120) { // Max 2 hours for one-way travel
                    totalTravelMinutes += goingMinutes;
                    hasValidTravel = true;
                }
            }
            // Add return travel time
            if (returnStart && returnEnd && returnStart.changedAt < returnEnd.changedAt) {
                const returnMinutes = (0, date_fns_1.differenceInMinutes)(new Date(returnEnd.changedAt), new Date(returnStart.changedAt));
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
            const onsiteStart = statusHistory.find((h) => h.status === 'ONSITE_VISIT_IN_PROGRESS');
            const onsiteEnd = statusHistory.find((h) => h.status === 'ONSITE_VISIT_RESOLVED');
            if (onsiteStart && onsiteEnd && onsiteStart.changedAt < onsiteEnd.changedAt) {
                const workingMinutes = (0, date_fns_1.differenceInMinutes)(new Date(onsiteEnd.changedAt), new Date(onsiteStart.changedAt));
                if (workingMinutes > 0 && workingMinutes <= 480) { // Max 8 hours for onsite work
                    onsiteWorkingTime = workingMinutes;
                }
            }
        }
        // Calculate total resolution time
        let totalResolutionTime = 0;
        if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
            if (ticket.statusHistory && ticket.statusHistory.length > 0) {
                const resolutionHistory = ticket.statusHistory.find((h) => h.status === 'RESOLVED' || h.status === 'CLOSED');
                if (resolutionHistory) {
                    totalResolutionTime = (0, date_fns_1.differenceInMinutes)(new Date(resolutionHistory.changedAt), new Date(ticket.createdAt));
                }
            }
            else if (ticket.updatedAt && ticket.createdAt) {
                const timeDiff = (0, date_fns_1.differenceInMinutes)(ticket.updatedAt, ticket.createdAt);
                if (timeDiff > 1) {
                    totalResolutionTime = timeDiff;
                }
            }
        }
        // Calculate machine downtime (same as total resolution time for now)
        const machineDowntime = totalResolutionTime;
        // Calculate total response hours (from open to closed)
        const totalResponseHours = totalResolutionTime > 0 ? totalResolutionTime / 60 : 0;
        // Determine call type based on priority and status
        let callType = 'Standard';
        if (ticket.priority === 'CRITICAL') {
            callType = 'Emergency';
        }
        else if (ticket.priority === 'HIGH') {
            callType = 'Urgent';
        }
        else if (ticket.isEscalated) {
            callType = 'Escalated';
        }
        return {
            ...ticket,
            responseTime,
            travelTime,
            onsiteWorkingTime,
            totalResolutionTime,
            machineDowntime,
            totalResponseHours,
            callType,
            reportsCount: ticket.reports ? ticket.reports.length : 0
        };
    });
    return {
        tickets: enhancedTickets,
        summary: {
            totalTickets: tickets.length,
            openTickets: tickets.filter((t) => t.status === 'OPEN').length,
            inProgressTickets: tickets.filter((t) => ['IN_PROGRESS', 'ASSIGNED', 'IN_PROCESS'].includes(t.status)).length,
            resolvedTickets: resolvedTickets.length,
            closedTickets: tickets.filter((t) => t.status === 'CLOSED').length,
            averageResolutionTime: avgResolutionTime,
            escalatedTickets: tickets.filter((t) => t.isEscalated).length,
        },
        statusDistribution: statusDistribution.reduce((acc, curr) => ({
            ...acc,
            [curr.status]: curr._count
        }), {}),
        priorityDistribution: priorityDistribution.reduce((acc, curr) => ({
            ...acc,
            [curr.priority]: curr._count
        }), {}),
        dailyTrends
    };
}
async function getSlaPerformanceData(whereClause, startDate, endDate) {
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
    const breachedTickets = tickets.filter((t) => t.slaDueAt && now > t.slaDueAt);
    // Calculate SLA compliance by priority
    const prioritySla = Object.values(Priority).reduce((acc, priority) => {
        const priorityTickets = tickets.filter((t) => t.priority === priority);
        const priorityBreaches = priorityTickets.filter((t) => t.slaDueAt && now > t.slaDueAt);
        acc[priority] = {
            total: priorityTickets.length,
            breaches: priorityBreaches.length,
            compliance: priorityTickets.length > 0
                ? ((priorityTickets.length - priorityBreaches.length) / priorityTickets.length) * 100
                : 100
        };
        return acc;
    }, {});
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
async function getZonePerformanceData(whereClause, startDate, endDate) {
    // Build zone filter - if zoneId is in whereClause, filter zones too
    const zoneWhere = {};
    if (whereClause.zoneId !== undefined) {
        if (typeof whereClause.zoneId === 'number' || typeof whereClause.zoneId === 'string') {
            zoneWhere.id = parseInt(whereClause.zoneId);
        }
        else if (typeof whereClause.zoneId === 'object' && whereClause.zoneId !== null) {
            if (Array.isArray(whereClause.zoneId.in)) {
                zoneWhere.id = { in: whereClause.zoneId.in };
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
    const zoneStats = zones.map((zone) => {
        const tickets = zone.tickets;
        const resolvedTickets = tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED');
        // Calculate average resolution time for this zone
        let avgResolutionTime = 0;
        if (resolvedTickets.length > 0) {
            const totalTime = resolvedTickets.reduce((sum, ticket) => {
                if (ticket.createdAt && ticket.updatedAt) {
                    return sum + (0, date_fns_1.differenceInMinutes)(ticket.updatedAt, ticket.createdAt);
                }
                return sum;
            }, 0);
            avgResolutionTime = Math.round(totalTime / resolvedTickets.length);
        }
        // Count customers and assets in this zone
        const customerCount = zone.customers.length;
        const assetCount = zone.customers.reduce((sum, customer) => sum + customer.assets.length, 0);
        return {
            zoneId: zone.id,
            zoneName: zone.name,
            totalTickets: tickets.length,
            resolvedTickets: resolvedTickets.length,
            openTickets: tickets.filter((t) => ['OPEN', 'IN_PROGRESS', 'ASSIGNED'].includes(t.status)).length,
            servicePersons: zone.servicePersons.length,
            customerCount,
            assetCount,
            resolutionRate: tickets.length > 0
                ? parseFloat(((resolvedTickets.length / tickets.length) * 100).toFixed(2))
                : 0,
            averageResolutionTime: avgResolutionTime,
            escalatedTickets: tickets.filter((t) => t.isEscalated).length
        };
    });
    return {
        zones: zoneStats,
        summary: {
            totalZones: zones.length,
            totalTickets: zoneStats.reduce((sum, zone) => sum + (zone.totalTickets || 0), 0),
            totalResolved: zoneStats.reduce((sum, zone) => sum + (zone.resolvedTickets || 0), 0),
            averageResolutionRate: zoneStats.length > 0
                ? zoneStats.reduce((sum, zone) => sum + (zone.resolutionRate || 0), 0) / zoneStats.length
                : 0
        }
    };
}
async function getAgentProductivityData(whereClause, startDate, endDate) {
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
    const agentStats = agents.map((agent) => {
        const tickets = agent.assignedTickets || [];
        const resolvedTickets = tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED');
        // Calculate average resolution time in minutes
        const resolvedWithTime = resolvedTickets.filter((t) => t.createdAt && t.updatedAt);
        const totalResolutionTime = resolvedWithTime.reduce((sum, t) => {
            return sum + (0, date_fns_1.differenceInMinutes)(t.updatedAt, t.createdAt);
        }, 0);
        const avgResolutionTime = resolvedWithTime.length > 0
            ? Math.round(totalResolutionTime / resolvedWithTime.length)
            : 0;
        // Calculate first response time (simplified)
        const ticketsWithResponse = tickets.filter((t) => t.updatedAt !== t.createdAt);
        const avgFirstResponseTime = ticketsWithResponse.length > 0
            ? Math.round(ticketsWithResponse.reduce((sum, t) => {
                return sum + (0, date_fns_1.differenceInMinutes)(t.updatedAt, t.createdAt);
            }, 0) / ticketsWithResponse.length)
            : 0;
        return {
            agentId: agent.id,
            agentName: agent.name || agent.email || `Agent ${agent.id}`,
            email: agent.email,
            zones: agent.serviceZones.map((sz) => sz.serviceZone.name),
            totalTickets: tickets.length,
            resolvedTickets: resolvedTickets.length,
            openTickets: tickets.filter((t) => ['OPEN', 'IN_PROGRESS', 'ASSIGNED'].includes(t.status)).length,
            resolutionRate: tickets.length > 0
                ? parseFloat(((resolvedTickets.length / tickets.length) * 100).toFixed(2))
                : 0,
            averageResolutionTime: avgResolutionTime,
            averageFirstResponseTime: avgFirstResponseTime,
            escalatedTickets: tickets.filter((t) => t.isEscalated).length
        };
    });
    return {
        agents: agentStats,
        summary: {
            totalAgents: agents.length,
            performanceMetrics: {
                topPerformer: agentStats.length > 0
                    ? agentStats.reduce((max, agent) => agent.resolutionRate > max.resolutionRate ? agent : max, agentStats[0])
                    : null,
                averageResolutionRate: agentStats.length > 0
                    ? agentStats.reduce((sum, agent) => sum + agent.resolutionRate, 0) / agentStats.length
                    : 0
            }
        }
    };
}
async function getIndustrialDataData(whereClause, startDate, endDate, filters) {
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
    const ticketFilters = {
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
    const machineDowntime = ticketsWithDowntime.map((ticket) => {
        let downtimeMinutes = 0;
        if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
            // For resolved tickets, calculate the time between creation and resolution
            downtimeMinutes = (0, date_fns_1.differenceInMinutes)(ticket.updatedAt, ticket.createdAt);
        }
        else {
            // For open tickets, calculate time from creation to now
            downtimeMinutes = (0, date_fns_1.differenceInMinutes)(new Date(), ticket.createdAt);
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
            }
            else if (role === 'SERVICE_PERSON') {
                assignedTechnician = `${name} (Service Person)`;
            }
            else {
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
    const machineDowntimeSummary = machineDowntime.reduce((acc, curr) => {
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
        }
        else {
            acc[machineKey].openIncidents += 1;
        }
        return acc;
    }, {});
    // Filter machine downtime by asset if specified
    const filteredMachineDowntime = Object.values(machineDowntimeSummary).filter((machine) => {
        if (filters?.assetId && machine.machineId !== filters.assetId) {
            return false;
        }
        return true;
    });
    return {
        zoneUsers: zoneUsers.map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            zones: user.serviceZones.map((sz) => sz.serviceZone.name),
            lastLogin: user.lastLoginAt,
            customerId: user.customerId
        })),
        servicePersons: servicePersons.map((sp) => ({
            id: sp.id,
            name: sp.name,
            email: sp.email,
            phone: sp.phone,
            zones: sp.serviceZones.map((sz) => sz.serviceZone.name),
            assignedTickets: sp.assignedTickets?.length || 0,
            activeTickets: sp.assignedTickets?.filter((t) => ['OPEN', 'IN_PROGRESS', 'ASSIGNED'].includes(t.status)).length || 0
        })),
        machineDowntime: filteredMachineDowntime,
        detailedDowntime: machineDowntime.filter((downtime) => !filters?.assetId || downtime.machineId === filters.assetId),
        summary: {
            totalZoneUsers: zoneUsers.length,
            totalServicePersons: servicePersons.length,
            totalMachinesWithDowntime: filteredMachineDowntime.length,
            totalDowntimeHours: filteredMachineDowntime.reduce((sum, machine) => sum + Math.round((machine.totalDowntimeMinutes || 0) / 60 * 100) / 100, 0),
            averageDowntimePerMachine: filteredMachineDowntime.length > 0
                ? Math.round(filteredMachineDowntime.reduce((sum, machine) => sum + (machine.totalDowntimeMinutes || 0), 0) / filteredMachineDowntime.length)
                : 0
        }
    };
}
async function generateExecutiveSummaryReport(res, whereClause, startDate, endDate) {
    try {
        // Get comprehensive data for executive summary
        const [tickets, feedbacks, zones, agents, customers, assets] = await Promise.all([
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
        const resolvedTickets = tickets.filter((t) => ['RESOLVED', 'CLOSED'].includes(t.status));
        const openTickets = tickets.filter((t) => ['OPEN', 'IN_PROGRESS', 'ASSIGNED'].includes(t.status));
        const criticalTickets = tickets.filter((t) => t.priority === 'CRITICAL');
        // Calculate resolution metrics
        const avgResolutionTime = resolvedTickets.length > 0
            ? resolvedTickets.reduce((sum, ticket) => {
                return sum + (0, date_fns_1.differenceInMinutes)(ticket.updatedAt, ticket.createdAt);
            }, 0) / resolvedTickets.length
            : 0;
        // Customer satisfaction metrics
        const avgRating = feedbacks.length > 0
            ? feedbacks.reduce((sum, fb) => sum + fb.rating, 0) / feedbacks.length
            : 0;
        // Financial impact estimation (simplified)
        const estimatedRevenueSaved = resolvedTickets.length * 500; // $500 per resolved ticket
        const downtimeCost = openTickets.length * 100; // $100 per hour of downtime
        // Zone performance
        const zonePerformance = zones.map((zone) => {
            const zoneTickets = zone.tickets;
            const zoneResolved = zoneTickets.filter((t) => ['RESOLVED', 'CLOSED'].includes(t.status));
            return {
                name: zone.name,
                efficiency: zoneTickets.length > 0 ? (zoneResolved.length / zoneTickets.length) * 100 : 0,
                ticketCount: zoneTickets.length,
                customerCount: zone.customers.length
            };
        });
        // Agent productivity
        const agentProductivity = agents.map((agent) => {
            const agentTickets = agent.assignedTickets;
            const agentResolved = agentTickets.filter((t) => ['RESOLVED', 'CLOSED'].includes(t.status));
            return {
                name: agent.name || agent.email,
                productivity: agentTickets.length > 0 ? (agentResolved.length / agentTickets.length) * 100 : 0,
                ticketCount: agentTickets.length
            };
        });
        // Asset health
        const assetHealth = assets.map((asset) => {
            const assetTickets = asset.tickets;
            const criticalIssues = assetTickets.filter((t) => t.priority === 'CRITICAL').length;
            return {
                machineId: asset.machineId,
                model: asset.model,
                healthScore: Math.max(0, 100 - (criticalIssues * 20)), // Simplified health score
                ticketCount: assetTickets.length
            };
        });
        // Trends data
        const dateRange = (0, date_fns_1.eachDayOfInterval)({ start: startDate, end: endDate });
        const trends = await Promise.all(dateRange.slice(-7).map(async (date) => {
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
                date: (0, date_fns_1.format)(date, 'MMM dd'),
                ticketsCreated: created,
                ticketsResolved: resolved,
                avgRating: feedback._avg.rating || 0
            };
        }));
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
            zonePerformance: zonePerformance.sort((a, b) => b.efficiency - a.efficiency),
            agentProductivity: agentProductivity.sort((a, b) => b.productivity - a.productivity),
            assetHealth: assetHealth.sort((a, b) => a.healthScore - b.healthScore),
            trends,
            kpis: {
                firstCallResolution: Math.round(Math.random() * 20 + 70), // Simulated KPI
                slaCompliance: Math.round(Math.random() * 15 + 80), // Simulated KPI
                customerRetention: Math.round(Math.random() * 10 + 85), // Simulated KPI
                operationalEfficiency: Math.round(Math.random() * 20 + 75) // Simulated KPI
            }
        });
    }
    catch (error) {
        console.error('Error generating executive summary:', error);
        res.status(500).json({ error: 'Failed to generate executive summary' });
    }
}
async function getExecutiveSummaryData(whereClause, startDate, endDate) {
    // Reuse the executive summary generation logic
    const [tickets, feedbacks, zones, agents, customers, assets] = await Promise.all([
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
    const resolvedTickets = tickets.filter((t) => ['RESOLVED', 'CLOSED'].includes(t.status));
    const openTickets = tickets.filter((t) => ['OPEN', 'IN_PROGRESS', 'ASSIGNED'].includes(t.status));
    const avgRating = feedbacks.length > 0 ? feedbacks.reduce((sum, fb) => sum + fb.rating, 0) / feedbacks.length : 0;
    const avgResolutionTime = resolvedTickets.length > 0
        ? resolvedTickets.reduce((sum, ticket) => sum + (0, date_fns_1.differenceInMinutes)(ticket.updatedAt, ticket.createdAt), 0) / resolvedTickets.length
        : 0;
    // Generate trends data for the last 7 days
    const dateRange = (0, date_fns_1.eachDayOfInterval)({ start: startDate, end: endDate });
    const trends = await Promise.all(dateRange.slice(-7).map(async (date) => {
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
            date: (0, date_fns_1.format)(date, 'MMM dd'),
            ticketsCreated: created,
            ticketsResolved: resolved,
            avgRating: Math.random() * 2 + 3 // Simulated for demo
        };
    }));
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
async function generateHerAnalysisReport(res, whereClause, startDate, endDate) {
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
        const SLA_HOURS_BY_PRIORITY = {
            'CRITICAL': 4, // 4 business hours
            'HIGH': 8, // 8 business hours  
            'MEDIUM': 24, // 24 business hours (3 business days)
            'LOW': 48 // 48 business hours (6 business days)
        };
        // Helper function to calculate business hours between two dates
        function calculateBusinessHours(startDate, endDate) {
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
        function calculateHerDeadline(createdAt, priority) {
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
                    }
                    else {
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
        const herTickets = tickets.map((ticket) => {
            const priority = ticket.priority || 'LOW';
            const herHours = SLA_HOURS_BY_PRIORITY[priority] || SLA_HOURS_BY_PRIORITY['LOW'];
            const herDeadline = calculateHerDeadline(ticket.createdAt, priority);
            let actualResolutionHours;
            let businessHoursUsed = 0;
            let isHerBreached = false;
            if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
                // Calculate actual resolution time in business hours
                businessHoursUsed = calculateBusinessHours(ticket.createdAt, ticket.updatedAt);
                actualResolutionHours = businessHoursUsed;
                isHerBreached = businessHoursUsed > herHours;
            }
            else {
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
        const priorityBreakdown = {};
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
    }
    catch (error) {
        console.error('Error generating HER analysis:', error);
        res.status(500).json({ error: 'Failed to generate HER analysis' });
    }
}
const generateZoneReport = async (req, res) => {
    try {
        const { from, to, reportType, customerId, assetId, zoneId } = req.query;
        const user = req.user;
        // Get user's zones - different logic for ZONE_USER vs SERVICE_PERSON
        let userZoneIds = [];
        if (user.role === 'ZONE_USER') {
            // For ZONE_USER, prefer explicit user.zoneId; fallback to user's customer's serviceZoneId
            const userRecord = await prisma.user.findUnique({
                where: { id: user.id },
                select: { zoneId: true, customerId: true }
            });
            if (userRecord?.zoneId) {
                userZoneIds = [parseInt(userRecord.zoneId)];
            }
            else if (userRecord?.customerId) {
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
                userZoneIds = userZones.map((uz) => uz.serviceZoneId);
            }
        }
        else {
            // For SERVICE_PERSON, get zones from servicePersonZone table
            const userZones = await prisma.servicePersonZone.findMany({
                where: { userId: user.id },
                select: { serviceZoneId: true }
            });
            userZoneIds = userZones.map((uz) => uz.serviceZoneId);
        }
        if (userZoneIds.length === 0) {
            return res.status(403).json({ error: 'User has no assigned zones' });
        }
        const startDate = from ? new Date(from) : (0, date_fns_1.subDays)(new Date(), 30);
        const endDate = to ? new Date(to) : new Date();
        endDate.setHours(23, 59, 59, 999);
        // Base where clause
        const whereClause = {
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
        }
        else {
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
    }
    catch (error) {
        console.error('Error generating zone report:', error);
        res.status(500).json({ error: 'Failed to generate zone report' });
    }
};
exports.generateZoneReport = generateZoneReport;
const exportZoneReport = async (req, res) => {
    try {
        const { from, to, reportType, format = 'pdf', zoneId, ...otherFilters } = req.query;
        const user = req.user;
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
        let userZoneIds = [];
        if (user.role === 'ZONE_USER') {
            // For ZONE_USER, prefer explicit user.zoneId; fallback to user's customer's serviceZoneId
            const userRecord = await prisma.user.findUnique({
                where: { id: user.id },
                select: { zoneId: true, customerId: true }
            });
            if (userRecord?.zoneId) {
                userZoneIds = [parseInt(userRecord.zoneId)];
            }
            else if (userRecord?.customerId) {
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
                userZoneIds = userZones.map((uz) => uz.serviceZoneId);
            }
        }
        else {
            // For SERVICE_PERSON, get zones from servicePersonZone table
            const userZones = await prisma.servicePersonZone.findMany({
                where: { userId: user.id },
                select: { serviceZoneId: true }
            });
            userZoneIds = userZones.map((uz) => uz.serviceZoneId);
        }
        if (userZoneIds.length === 0) {
            return res.status(403).json({ error: 'User has no assigned zones' });
        }
        const startDate = from ? new Date(from) : (0, date_fns_1.subDays)(new Date(), 30);
        const endDate = to ? new Date(to) : new Date();
        endDate.setHours(23, 59, 59, 999);
        // Base where clause
        const whereClause = {
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
        }
        else {
            // Otherwise, restrict by user's zones
            whereClause.zoneId = { in: userZoneIds };
        }
        let data = [];
        let columns = [];
        let summaryData = null;
        // Custom title mapping for better report names
        const titleMap = {
            'industrial-data': 'Machine Report',
            'ticket-summary': 'Ticket Summary Report',
            'customer-satisfaction': 'Customer Satisfaction Report',
            'zone-performance': 'Zone Performance Report',
            'agent-productivity': 'Performance Report of All Service Persons and Zone Users',
            'sla-performance': 'SLA Performance Report',
            'executive-summary': 'Executive Summary Report',
            'her-analysis': 'Business Hours SLA Report'
        };
        const reportTitle = titleMap[reportType] || reportType.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        const filename = `Zone-${reportTitle.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}`;
        const filters = {
            from: startDate.toISOString(),
            to: endDate.toISOString(),
            zones: zoneId ? String(zoneId) : userZoneIds.join(','),
            ...Object.fromEntries(Object.entries(otherFilters).filter(([_, v]) => v !== undefined && v !== ''))
        };
        // Get data based on report type
        switch (reportType) {
            case 'ticket-summary':
                const ticketData = await getTicketSummaryData(whereClause, startDate, endDate);
                data = ticketData.tickets || [];
                summaryData = ticketData.summary;
                columns = (0, pdfGenerator_1.getPdfColumns)('ticket-summary');
                break;
            case 'sla-performance':
                const slaData = await getSlaPerformanceData(whereClause, startDate, endDate);
                data = slaData.breachedTickets || [];
                summaryData = slaData.summary;
                columns = (0, pdfGenerator_1.getPdfColumns)('sla-performance');
                break;
            case 'executive-summary':
                const executiveData = await getExecutiveSummaryData(whereClause, startDate, endDate);
                data = executiveData.trends || [];
                summaryData = executiveData.summary;
                columns = (0, pdfGenerator_1.getPdfColumns)('executive-summary');
                break;
            case 'customer-satisfaction':
                const satisfactionData = await getCustomerSatisfactionData(whereClause, startDate, endDate);
                data = satisfactionData.recentFeedbacks || [];
                const totalRatings = Object.entries(satisfactionData.ratingDistribution || {})
                    .reduce((sum, [rating, count]) => sum + (parseInt(rating) * count), 0);
                const totalResponses = Object.values(satisfactionData.ratingDistribution || {})
                    .reduce((sum, count) => sum + count, 0);
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
                    { key: 'createdAt', header: 'Date', width: 20, format: (date) => new Date(date).toLocaleString() },
                    { key: 'ticketId', header: 'Ticket ID', width: 15 },
                    { key: 'customerName', header: 'Customer', width: 30 }
                ];
                break;
            case 'industrial-data':
                const industrialData = await getIndustrialDataData(whereClause, startDate, endDate, otherFilters);
                data = industrialData.detailedDowntime || [];
                summaryData = industrialData.summary;
                columns = (0, pdfGenerator_1.getPdfColumns)('industrial-data');
                break;
            case 'agent-productivity':
                const agentData = await getAgentProductivityData(whereClause, startDate, endDate);
                data = agentData.agents || [];
                summaryData = agentData.summary;
                columns = (0, pdfGenerator_1.getPdfColumns)('agent-productivity');
                break;
            case 'zone-performance':
                const zoneData = await getZonePerformanceData(whereClause, startDate, endDate);
                data = zoneData.zones || [];
                summaryData = zoneData.summary;
                columns = (0, pdfGenerator_1.getPdfColumns)('zone-performance');
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
                const SLA_HOURS_BY_PRIORITY = {
                    'CRITICAL': 4, 'HIGH': 8, 'MEDIUM': 24, 'LOW': 48
                };
                const calculateBusinessHours = (startDate, endDate) => {
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
                data = herTickets.map((ticket) => {
                    const priority = ticket.priority || 'LOW';
                    const herHours = SLA_HOURS_BY_PRIORITY[priority] || SLA_HOURS_BY_PRIORITY['LOW'];
                    let businessHoursUsed = 0;
                    let isHerBreached = false;
                    let resolvedAt = null;
                    if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
                        businessHoursUsed = calculateBusinessHours(ticket.createdAt, ticket.updatedAt);
                        isHerBreached = businessHoursUsed > herHours;
                        resolvedAt = ticket.updatedAt;
                    }
                    else {
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
                const herCompliantTickets = data.filter((t) => t.isHerBreached === 'No').length;
                const herBreachedTickets = data.filter((t) => t.isHerBreached === 'Yes').length;
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
                    { key: 'createdAt', header: 'Created', width: 20, format: (date) => new Date(date).toLocaleString() },
                    { key: 'zone', header: 'Zone', width: 20 },
                    { key: 'herHours', header: 'SLA Hours', width: 15 },
                    { key: 'businessHoursUsed', header: 'Hours Used', width: 15 },
                    { key: 'isHerBreached', header: 'Breached', width: 15 },
                    { key: 'resolvedAt', header: 'Resolved', width: 20, format: (date) => date ? new Date(date).toLocaleString() : 'N/A' }
                ];
                break;
            default:
                return res.status(400).json({ error: 'Invalid report type for export.' });
        }
        if (format.toLowerCase() === 'pdf') {
            await (0, pdfGenerator_1.generatePdf)(res, data, columns, `Zone ${reportTitle}`, filters, summaryData);
        }
        else if (format.toLowerCase() === 'excel' || format.toLowerCase() === 'xlsx') {
            // Generate Excel with enhanced formatting and summary data
            const excelColumns = (0, excelGenerator_1.getExcelColumns)(reportType);
            await (0, excelGenerator_1.generateExcel)(res, data, excelColumns, `Zone ${reportTitle}`, filters, summaryData);
        }
        else {
            // Default to PDF export
            const pdfColumns = (0, pdfGenerator_1.getPdfColumns)(reportType);
            await (0, pdfGenerator_1.generatePdf)(res, data, pdfColumns, `Zone ${reportTitle}`, filters, summaryData);
        }
    }
    catch (error) {
        console.error('Error exporting zone report:', error);
        res.status(500).json({
            error: 'Failed to export zone report',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.exportZoneReport = exportZoneReport;
exports.default = {
    generateReport: exports.generateReport,
    exportReport: exports.exportReport,
    generateZoneReport: exports.generateZoneReport,
    exportZoneReport: exports.exportZoneReport,
    getZonePerformanceData,
    getAgentProductivityData,
    getIndustrialDataData,
    getExecutiveSummaryData
};
