"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getZoneTicketTrends = exports.getZoneStatusDistribution = exports.getZoneServicePersons = exports.getZoneCustomersAssets = exports.getFSAData = exports.getZoneDashboardData = exports.getZoneInfo = void 0;
const client_1 = require("@prisma/client");
const bigint_1 = require("../utils/bigint");
const prisma = new client_1.PrismaClient();
// Helper functions for zone metrics
async function calculateAverageResponseTime(zoneId) {
    try {
        // Calculate time from OPEN to ASSIGNED using status history
        const result = await prisma.$queryRaw `
      SELECT AVG(EXTRACT(EPOCH FROM (sh."changedAt" - t."createdAt")) / 60) as avg_response_time
      FROM "Ticket" t
      JOIN "Customer" c ON t."customerId" = c.id
      JOIN "TicketStatusHistory" sh ON t.id = sh."ticketId"
      WHERE c."serviceZoneId" = ${zoneId}
      AND sh.status = 'ASSIGNED'
      AND t."createdAt" >= NOW() - INTERVAL '30 days'
      AND sh."changedAt" IS NOT NULL
    `;
        let avgMinutes = result[0]?.avg_response_time || 0;
        // If no status history data, use a simple fallback based on current ticket status
        if (avgMinutes === 0) {
            const fallbackResult = await prisma.$queryRaw `
        SELECT AVG(EXTRACT(EPOCH FROM (t."updatedAt" - t."createdAt")) / 60) as avg_response_time
        FROM "Ticket" t
        JOIN "Customer" c ON t."customerId" = c.id
        WHERE c."serviceZoneId" = ${zoneId}
        AND t.status IN ('ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')
        AND t."createdAt" >= NOW() - INTERVAL '30 days'
      `;
            avgMinutes = fallbackResult[0]?.avg_response_time || 0;
        }
        return {
            hours: Math.floor(avgMinutes / 60),
            minutes: Math.round(avgMinutes % 60)
        };
    }
    catch (error) {
        console.error('Error calculating average response time:', error);
        return { hours: 0, minutes: 0 };
    }
}
async function calculateAverageResolutionTime(zoneId) {
    try {
        // Calculate time from OPEN to CLOSED using status history
        const result = await prisma.$queryRaw `
      SELECT AVG(EXTRACT(EPOCH FROM (sh."changedAt" - t."createdAt")) / 3600) as avg_resolution_time
      FROM "Ticket" t
      JOIN "Customer" c ON t."customerId" = c.id
      JOIN "TicketStatusHistory" sh ON t.id = sh."ticketId"
      WHERE c."serviceZoneId" = ${zoneId}
      AND sh.status = 'CLOSED'
      AND t."createdAt" >= NOW() - INTERVAL '30 days'
      AND sh."changedAt" IS NOT NULL
    `;
        let avgHours = result[0]?.avg_resolution_time || 0;
        // If no status history data, use a simple fallback based on current ticket status
        if (avgHours === 0) {
            const fallbackResult = await prisma.$queryRaw `
        SELECT AVG(EXTRACT(EPOCH FROM (t."updatedAt" - t."createdAt")) / 3600) as avg_resolution_time
        FROM "Ticket" t
        JOIN "Customer" c ON t."customerId" = c.id
        WHERE c."serviceZoneId" = ${zoneId}
        AND t.status IN ('RESOLVED', 'CLOSED')
        AND t."createdAt" >= NOW() - INTERVAL '30 days'
      `;
            avgHours = fallbackResult[0]?.avg_resolution_time || 0;
        }
        return {
            days: Math.floor(avgHours / 24),
            hours: Math.round(avgHours % 24)
        };
    }
    catch (error) {
        console.error('Error calculating average resolution time:', error);
        return { days: 0, hours: 0 };
    }
}
async function calculateAverageDowntime(zoneId) {
    try {
        // Calculate machine downtime: time from OPEN to CLOSED for tickets that were PENDING
        // This represents the time machines were down waiting for resolution
        const result = await prisma.$queryRaw `
      SELECT AVG(EXTRACT(EPOCH FROM (sh_closed."changedAt" - t."createdAt")) / 60) as avg_downtime
      FROM "Ticket" t
      JOIN "Customer" c ON t."customerId" = c.id
      JOIN "TicketStatusHistory" sh_closed ON t.id = sh_closed."ticketId"
      WHERE c."serviceZoneId" = ${zoneId}
      AND sh_closed.status = 'CLOSED'
      AND t."createdAt" >= NOW() - INTERVAL '30 days'
      AND sh_closed."changedAt" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "TicketStatusHistory" sh_pending 
        WHERE sh_pending."ticketId" = t.id 
        AND sh_pending.status IN ('OPEN', 'PENDING', 'IN_PROGRESS')
        AND sh_pending."changedAt" < sh_closed."changedAt"
      )
    `;
        let avgMinutes = result[0]?.avg_downtime || 0;
        // If no data with PENDING status, fallback to all OPEN to CLOSED tickets
        if (avgMinutes === 0) {
            const fallbackResult = await prisma.$queryRaw `
        SELECT AVG(EXTRACT(EPOCH FROM (sh."changedAt" - t."createdAt")) / 60) as avg_downtime
        FROM "Ticket" t
        JOIN "Customer" c ON t."customerId" = c.id
        JOIN "TicketStatusHistory" sh ON t.id = sh."ticketId"
        WHERE c."serviceZoneId" = ${zoneId}
        AND sh.status = 'CLOSED'
        AND t."createdAt" >= NOW() - INTERVAL '30 days'
        AND sh."changedAt" IS NOT NULL
      `;
            avgMinutes = fallbackResult[0]?.avg_downtime || 0;
        }
        return {
            hours: Math.floor(avgMinutes / 60),
            minutes: Math.round(avgMinutes % 60)
        };
    }
    catch (error) {
        console.error('Error calculating machine downtime:', error);
        return { hours: 0, minutes: 0 };
    }
}
async function calculateTechnicianEfficiency(zoneId) {
    try {
        const result = await prisma.$queryRaw `
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
        return Number(result[0]?.avg_efficiency) || 0;
    }
    catch (error) {
        return 0;
    }
}
async function calculateAverageTravelTime(zoneId) {
    try {
        // Calculate travel time from STARTED to REACHED events in onsite visit logs
        const result = await prisma.$queryRaw `
      SELECT AVG(EXTRACT(EPOCH FROM (reached."createdAt" - started."createdAt")) / 60) as avg_travel_time
      FROM "OnsiteVisitLog" started
      JOIN "OnsiteVisitLog" reached ON started."ticketId" = reached."ticketId" 
        AND started."userId" = reached."userId"
      JOIN "Ticket" t ON started."ticketId" = t.id
      JOIN "Customer" c ON t."customerId" = c.id
      WHERE c."serviceZoneId" = ${zoneId}
      AND started.event = 'STARTED'
      AND reached.event = 'REACHED'
      AND reached."createdAt" > started."createdAt"
      AND started."createdAt" >= NOW() - INTERVAL '30 days'
    `;
        const avgMinutes = Number(result[0]?.avg_travel_time) || 0;
        // If no onsite visit data, return 0 (no meaningful fallback for travel time)
        if (avgMinutes === 0) {
        }
        return avgMinutes;
    }
    catch (error) {
        console.error('Error calculating average travel time:', error);
        return 0;
    }
}
async function calculatePartsAvailability(zoneId) {
    try {
        // Calculate parts availability based on tickets that have spare parts details vs those that need parts
        const result = await prisma.$queryRaw `
      SELECT 
        COUNT(DISTINCT CASE WHEN t."sparePartsDetails" IS NOT NULL AND t."sparePartsDetails" != '' THEN t.id END) * 100.0 /
        NULLIF(COUNT(DISTINCT CASE WHEN t.status IN ('IN_PROGRESS', 'ASSIGNED') THEN t.id END), 0) as parts_availability
      FROM "Ticket" t
      JOIN "Customer" c ON t."customerId" = c.id
      WHERE c."serviceZoneId" = ${zoneId}
      AND t."createdAt" >= NOW() - INTERVAL '30 days'
      AND t.status IN ('IN_PROGRESS', 'ASSIGNED', 'RESOLVED', 'CLOSED')
    `;
        const availability = Number(result[0]?.parts_availability) || 0;
        return availability;
    }
    catch (error) {
        console.error('Error calculating parts availability:', error);
        return 0;
    }
}
async function calculateEquipmentUptime(zoneId) {
    try {
        const result = await prisma.$queryRaw `
      SELECT AVG("uptimePercentage") as avg_uptime
      FROM "Asset" a
      JOIN "Customer" c ON a."customerId" = c.id
      WHERE c."serviceZoneId" = ${zoneId}
    `;
        return Number(result[0]?.avg_uptime) || 0;
    }
    catch (error) {
        return 0;
    }
}
async function calculateFirstCallResolutionRate(zoneId) {
    try {
        const result = await prisma.$queryRaw `
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
        return Number(result[0]?.first_call_resolution_rate) || 0;
    }
    catch (error) {
        return 0;
    }
}
async function calculateCustomerSatisfactionScore(zoneId) {
    try {
        const result = await prisma.$queryRaw `
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
    }
    catch (error) {
        return 0;
    }
}
// Lightweight zone info endpoint for ticket creation
const getZoneInfo = async (req, res) => {
    try {
        const user = req.user;
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
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to fetch zone info' });
    }
};
exports.getZoneInfo = getZoneInfo;
const getZoneDashboardData = async (req, res) => {
    try {
        const user = req.user;
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
        // Check if user is a service person/zone user assigned to zones
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
        const [technicianEfficiency, avgTravelTime, partsAvailability, equipmentUptime, firstCallResolutionRate, customerSatisfactionScore, avgResponseTime, avgResolutionTime, avgDowntime] = await Promise.all([
            calculateTechnicianEfficiency(zone.id),
            calculateAverageTravelTime(zone.id),
            calculatePartsAvailability(zone.id),
            calculateEquipmentUptime(zone.id),
            calculateFirstCallResolutionRate(zone.id),
            calculateCustomerSatisfactionScore(zone.id),
            calculateAverageResponseTime(zone.id),
            calculateAverageResolutionTime(zone.id),
            calculateAverageDowntime(zone.id)
        ]);
        // Get ticket counts by status
        const ticketCounts = await prisma.ticket.groupBy({
            by: ['status'],
            where: {
                customer: { serviceZoneId: zone.id },
                OR: [
                    { status: 'OPEN' },
                    { status: 'IN_PROGRESS' },
                    { status: 'IN_PROCESS' }, // Handle both IN_PROCESS and IN_PROGRESS
                    { status: 'RESOLVED' }
                ]
            },
            _count: true
        });
        const openTickets = ticketCounts.find((t) => t.status === 'OPEN')?._count || 0;
        // Handle both 'IN_PROGRESS' and 'IN_PROCESS' statuses
        const inProgressTickets = (ticketCounts.find((t) => t.status === 'IN_PROGRESS')?._count || 0) +
            (ticketCounts.find((t) => t.status === 'IN_PROCESS')?._count || 0);
        // Get resolved tickets for trends
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const resolvedTickets = await prisma.ticket.findMany({
            where: {
                customer: { serviceZoneId: zone.id },
                status: 'RESOLVED',
                updatedAt: { gte: thirtyDaysAgo }
            },
            orderBy: { updatedAt: 'asc' },
            include: {
                customer: true,
                assignedTo: true
            }
        });
        // Calculate trends
        const resolvedTicketsData = resolvedTickets.map((ticket) => ({
            date: ticket.updatedAt.toISOString().split('T')[0],
            count: 1
        }));
        // Group by date
        const ticketsByDate = resolvedTicketsData.reduce((acc, { date }) => {
            acc[date] = (acc[date] || 0) + 1;
            return acc;
        }, {});
        // Format for chart
        const resolvedTicketsTrend = Object.entries(ticketsByDate).map(([date, count]) => ({
            date,
            count: count
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
                status: 'RESOLVED',
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
                avgResponseTime: {
                    hours: avgResponseTime.hours,
                    minutes: avgResponseTime.minutes,
                    change: 0,
                    isPositive: true
                },
                avgResolutionTime: {
                    days: avgResolutionTime.days,
                    hours: avgResolutionTime.hours,
                    minutes: 0,
                    change: 0,
                    isPositive: true
                },
                avgDowntime: {
                    hours: avgDowntime.hours,
                    minutes: avgDowntime.minutes,
                    change: 0,
                    isPositive: true
                },
                monthlyTickets: { count: resolvedTickets.length, change: 0 },
                activeMachines: {
                    count: await prisma.asset.count({
                        where: {
                            customer: { serviceZoneId: zone.id },
                            status: 'ACTIVE'
                        }
                    }),
                    change: 0
                }
            },
            metrics: {
                openTickets: Number(openTickets) || 0,
                inProgressTickets: Number(inProgressTickets) || 0,
                resolvedTickets: Number(resolvedTickets.length) || 0,
                technicianEfficiency: Number(technicianEfficiency) || 0,
                avgTravelTime: Number(avgTravelTime) || 0,
                partsAvailability: Number(partsAvailability) || 0,
                equipmentUptime: Number(equipmentUptime) || 0,
                firstCallResolutionRate: Number(firstCallResolutionRate) || 0,
                customerSatisfactionScore: Number((customerSatisfactionScore || 0) / 20) || 0, // Convert to 5.0 scale
                avgResponseTime: Number(avgResponseTime.hours * 60 + avgResponseTime.minutes) || 0, // Total minutes
                avgResolutionTime: Number(avgResolutionTime.days * 24 + avgResolutionTime.hours) || 0 // Total hours
            },
            trends: {
                resolvedTickets: resolvedTicketsTrend
            },
            topIssues: topIssues.map((issue) => ({
                title: issue.title,
                count: issue._count._all,
                priority: 'MEDIUM',
                avgResolutionTime: 0
            })),
            technicians: zoneTechnicians.map((tech) => ({
                id: tech.id,
                name: tech.name || 'Unknown',
                activeTickets: tech._count.assignedTickets,
                efficiency: 0, // Will be calculated based on actual data
                rating: 0 // Will be calculated based on actual data
            })),
            recentActivities: recentActivities.map((activity) => ({
                id: activity.id,
                type: 'ticket_update',
                description: `${activity.title} - ${activity.status}`,
                timestamp: activity.updatedAt.toISOString(),
                priority: activity.priority,
                technician: activity.assignedTo?.name
            }))
        };
        return res.json((0, bigint_1.serializeBigInts)(response));
    }
    catch (error) {
        console.error('Zone Dashboard - Error occurred:', error);
        return res.status(500).json({ error: 'Internal Server Error', details: error instanceof Error ? error.message : 'Unknown error' });
    }
};
exports.getZoneDashboardData = getZoneDashboardData;
// Get FSA (Field Service Analytics) data
const getFSAData = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        // Get zone ID from request params first, then fall back to user's zone ID
        const zoneId = Number(req.params.zoneId) || Number(user.zoneId);
        if (!zoneId || isNaN(zoneId)) {
            return res.status(400).json({ message: 'Zone ID is required and must be a number' });
        }
        // Calculate all metrics in parallel
        const [efficiency, travelTime, partsAvailability, firstCallResolution, serviceReports, efficiencyTrend, serviceDistribution] = await Promise.all([
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
        res.json((0, bigint_1.serializeBigInts)(responseData));
    }
    catch (error) {
        res.status(500).json({
            message: 'Error fetching FSA data',
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        });
    }
};
exports.getFSAData = getFSAData;
// Helper function to get recent service reports
async function getRecentServiceReports(zoneId) {
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
async function getEfficiencyTrend(zoneId) {
    const result = await prisma.$queryRaw `
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
    return result.map((r) => ({
        month: r.month,
        efficiency: parseFloat(r.efficiency) || 0
    }));
}
// Helper function to get service distribution
async function getServiceDistribution(zoneId) {
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
    const total = result.reduce((sum, item) => sum + (item._count || 0), 0);
    return result.map((item) => ({
        name: item.title || 'Other',
        value: total > 0 ? Math.round(((item._count || 0) / total) * 100) : 0
    }));
}
// Get zone customers and assets for ticket creation
const getZoneCustomersAssets = async (req, res) => {
    try {
        const user = req.user;
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
        return res.json({ customers });
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to fetch zone customers and assets' });
    }
};
exports.getZoneCustomersAssets = getZoneCustomersAssets;
// Get service persons by zone
const getZoneServicePersons = async (req, res) => {
    try {
        const user = req.user;
        // Get the first service zone ID from user's zoneIds array
        const zoneId = user.zoneIds?.[0];
        if (!zoneId) {
            return res.status(400).json({ error: 'User is not assigned to any service zone' });
        }
        const servicePersons = await prisma.user.findMany({
            where: {
                role: 'SERVICE_PERSON',
                // Include both active and inactive users for admin management
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
                isActive: true,
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
        return res.json({
            data: servicePersons,
            pagination: {
                page: 1,
                limit: servicePersons.length,
                total: servicePersons.length,
                totalPages: 1
            }
        });
    }
    catch (error) {
        console.error('Error fetching zone service persons:', error);
        return res.status(500).json({ error: 'Failed to fetch service persons for the zone' });
    }
};
exports.getZoneServicePersons = getZoneServicePersons;
// Get zone status distribution
const getZoneStatusDistribution = async (req, res) => {
    try {
        const user = req.user;
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
        // Get zone
        let zone = null;
        if (userWithZone.serviceZones && userWithZone.serviceZones.length > 0) {
            zone = userWithZone.serviceZones[0].serviceZone;
        }
        else if (userWithZone.customer && userWithZone.customer.serviceZone) {
            zone = userWithZone.customer.serviceZone;
        }
        if (!zone) {
            return res.status(404).json({ error: 'No service zone found for this user' });
        }
        // Get ticket status distribution
        const statusDistribution = await prisma.ticket.groupBy({
            by: ['status'],
            where: {
                customer: { serviceZoneId: zone.id }
            },
            _count: {
                _all: true
            }
        });
        const distribution = statusDistribution.map((item) => ({
            status: item.status,
            count: item._count._all
        }));
        return res.json({ distribution });
    }
    catch (error) {
        console.error('Error fetching zone status distribution:', error);
        return res.status(500).json({ error: 'Failed to fetch status distribution' });
    }
};
exports.getZoneStatusDistribution = getZoneStatusDistribution;
// Get zone ticket trends
const getZoneTicketTrends = async (req, res) => {
    try {
        const user = req.user;
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
        // Get zone
        let zone = null;
        if (userWithZone.serviceZones && userWithZone.serviceZones.length > 0) {
            zone = userWithZone.serviceZones[0].serviceZone;
        }
        else if (userWithZone.customer && userWithZone.customer.serviceZone) {
            zone = userWithZone.customer.serviceZone;
        }
        if (!zone) {
            return res.status(404).json({ error: 'No service zone found for this user' });
        }
        // Get ticket trends for the last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const tickets = await prisma.ticket.findMany({
            where: {
                customer: { serviceZoneId: zone.id },
                createdAt: { gte: sevenDaysAgo }
            },
            select: {
                createdAt: true,
                status: true
            },
            orderBy: { createdAt: 'asc' }
        });
        // Group by date
        const trendsByDate = {};
        tickets.forEach((ticket) => {
            const date = ticket.createdAt.toISOString().split('T')[0];
            if (!trendsByDate[date]) {
                trendsByDate[date] = { date, open: 0, resolved: 0, total: 0 };
            }
            trendsByDate[date].total++;
            if (ticket.status === 'OPEN') {
                trendsByDate[date].open++;
            }
            else if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
                trendsByDate[date].resolved++;
            }
        });
        const trends = Object.values(trendsByDate);
        return res.json({ trends });
    }
    catch (error) {
        console.error('Error fetching zone ticket trends:', error);
        return res.status(500).json({ error: 'Failed to fetch ticket trends' });
    }
};
exports.getZoneTicketTrends = getZoneTicketTrends;
