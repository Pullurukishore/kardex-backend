"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportZoneReport = exports.getRecentActivities = exports.getSLAMetrics = exports.getTicketTrends = exports.getAssetPerformance = exports.getServicePersonPerformance = exports.getCustomerPerformance = exports.getPriorityDistribution = exports.getTicketStatusDistribution = exports.getZoneDashboard = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// Get comprehensive zone dashboard statistics
const getZoneDashboard = async (req, res) => {
    try {
        const { zoneId } = req.params;
        const { timeframe = '30d' } = req.query;
        // Calculate date range
        const now = new Date();
        const daysBack = timeframe === '7d' ? 7 : timeframe === '90d' ? 90 : 30;
        const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
        // Get zone information
        const zone = await prisma.serviceZone.findUnique({
            where: { id: parseInt(zoneId) },
            include: {
                customers: true,
                servicePersons: {
                    include: {
                        user: true
                    }
                }
            }
        });
        if (!zone) {
            return res.status(404).json({ error: 'Zone not found' });
        }
        // Get all tickets for the zone within timeframe
        const tickets = await prisma.ticket.findMany({
            where: {
                zoneId: parseInt(zoneId),
                createdAt: {
                    gte: startDate
                }
            },
            include: {
                customer: true,
                asset: true,
                assignedTo: true,
                statusHistory: true
            }
        });
        // Calculate basic statistics
        const totalTickets = tickets.length;
        const openTickets = tickets.filter((t) => ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'IN_PROCESS'].includes(t.status)).length;
        const closedTickets = tickets.filter((t) => t.status === 'CLOSED').length;
        const inProgressTickets = tickets.filter((t) => ['IN_PROGRESS', 'IN_PROCESS', 'ASSIGNED'].includes(t.status)).length;
        const criticalTickets = tickets.filter((t) => t.priority === 'CRITICAL').length;
        const escalatedTickets = tickets.filter((t) => t.isEscalated).length;
        // Calculate average resolution time
        const resolvedTickets = tickets.filter((t) => t.actualResolutionTime);
        const avgResolutionTime = resolvedTickets.length > 0
            ? resolvedTickets.reduce((sum, t) => sum + (t.actualResolutionTime || 0), 0) / resolvedTickets.length
            : 0;
        // Calculate SLA compliance
        const slaTickets = tickets.filter((t) => t.slaStatus);
        const slaCompliantTickets = slaTickets.filter((t) => t.slaStatus === 'ON_TIME').length;
        const slaCompliance = slaTickets.length > 0 ? (slaCompliantTickets / slaTickets.length) * 100 : 0;
        const stats = {
            totalTickets,
            openTickets,
            closedTickets,
            inProgressTickets,
            avgResolutionTime: Math.round(avgResolutionTime),
            slaCompliance: Math.round(slaCompliance * 100) / 100,
            totalCustomers: zone.customers.length,
            totalAssets: await prisma.asset.count({
                where: {
                    customer: {
                        serviceZoneId: parseInt(zoneId)
                    }
                }
            }),
            totalServicePersons: zone.servicePersons.length,
            criticalTickets,
            escalatedTickets
        };
        res.json({
            zone: {
                id: zone.id,
                name: zone.name,
                description: zone.description,
                isActive: zone.isActive
            },
            stats,
            timeframe
        });
    }
    catch (error) {
        console.error('Error fetching zone dashboard:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getZoneDashboard = getZoneDashboard;
// Get ticket status distribution
const getTicketStatusDistribution = async (req, res) => {
    try {
        const { zoneId } = req.params;
        const { timeframe = '30d' } = req.query;
        const now = new Date();
        const daysBack = timeframe === '7d' ? 7 : timeframe === '90d' ? 90 : 30;
        const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
        const tickets = await prisma.ticket.findMany({
            where: {
                zoneId: parseInt(zoneId),
                createdAt: {
                    gte: startDate
                }
            },
            select: {
                status: true
            }
        });
        const statusCounts = tickets.reduce((acc, ticket) => {
            acc[ticket.status] = (acc[ticket.status] || 0) + 1;
            return acc;
        }, {});
        const totalTickets = tickets.length;
        const distribution = Object.entries(statusCounts).map(([status, count]) => ({
            status,
            count,
            percentage: totalTickets > 0 ? Math.round((count / totalTickets) * 100 * 100) / 100 : 0
        }));
        res.json({ distribution, totalTickets, timeframe });
    }
    catch (error) {
        console.error('Error fetching ticket status distribution:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getTicketStatusDistribution = getTicketStatusDistribution;
// Get priority distribution
const getPriorityDistribution = async (req, res) => {
    try {
        const { zoneId } = req.params;
        const { timeframe = '30d' } = req.query;
        const now = new Date();
        const daysBack = timeframe === '7d' ? 7 : timeframe === '90d' ? 90 : 30;
        const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
        const tickets = await prisma.ticket.findMany({
            where: {
                zoneId: parseInt(zoneId),
                createdAt: {
                    gte: startDate
                }
            },
            select: {
                priority: true
            }
        });
        const priorityCounts = tickets.reduce((acc, ticket) => {
            acc[ticket.priority] = (acc[ticket.priority] || 0) + 1;
            return acc;
        }, {});
        const totalTickets = tickets.length;
        const distribution = Object.entries(priorityCounts).map(([priority, count]) => ({
            priority,
            count,
            percentage: totalTickets > 0 ? Math.round((count / totalTickets) * 100 * 100) / 100 : 0
        }));
        res.json({ distribution, totalTickets, timeframe });
    }
    catch (error) {
        console.error('Error fetching priority distribution:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getPriorityDistribution = getPriorityDistribution;
// Get customer performance metrics
const getCustomerPerformance = async (req, res) => {
    try {
        const { zoneId } = req.params;
        const { timeframe = '30d' } = req.query;
        const now = new Date();
        const daysBack = timeframe === '7d' ? 7 : timeframe === '90d' ? 90 : 30;
        const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
        const customers = await prisma.customer.findMany({
            where: {
                serviceZoneId: parseInt(zoneId)
            },
            include: {
                tickets: {
                    where: {
                        createdAt: {
                            gte: startDate
                        }
                    }
                }
            }
        });
        const customerPerformance = customers.map((customer) => {
            const tickets = customer.tickets;
            const totalTickets = tickets.length;
            const openTickets = tickets.filter((t) => ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'IN_PROCESS'].includes(t.status)).length;
            const closedTickets = tickets.filter((t) => t.status === 'CLOSED').length;
            const criticalTickets = tickets.filter((t) => t.priority === 'CRITICAL').length;
            const resolvedTickets = tickets.filter((t) => t.actualResolutionTime);
            const avgResolutionTime = resolvedTickets.length > 0
                ? resolvedTickets.reduce((sum, t) => sum + (t.actualResolutionTime || 0), 0) / resolvedTickets.length
                : 0;
            const slaTickets = tickets.filter((t) => t.slaStatus);
            const slaCompliantTickets = slaTickets.filter((t) => t.slaStatus === 'ON_TIME').length;
            const slaCompliance = slaTickets.length > 0 ? (slaCompliantTickets / slaTickets.length) * 100 : 0;
            return {
                customerId: customer.id,
                customerName: customer.companyName,
                totalTickets,
                openTickets,
                closedTickets,
                avgResolutionTime: Math.round(avgResolutionTime),
                slaCompliance: Math.round(slaCompliance * 100) / 100,
                criticalTickets
            };
        });
        // Sort by total tickets descending
        customerPerformance.sort((a, b) => b.totalTickets - a.totalTickets);
        res.json({ customers: customerPerformance, timeframe });
    }
    catch (error) {
        console.error('Error fetching customer performance:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getCustomerPerformance = getCustomerPerformance;
// Get service person performance metrics
const getServicePersonPerformance = async (req, res) => {
    try {
        const { zoneId } = req.params;
        const { timeframe = '30d' } = req.query;
        const now = new Date();
        const daysBack = timeframe === '7d' ? 7 : timeframe === '90d' ? 90 : 30;
        const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
        const servicePersons = await prisma.servicePersonZone.findMany({
            where: {
                serviceZoneId: parseInt(zoneId)
            },
            include: {
                user: {
                    include: {
                        assignedTickets: {
                            where: {
                                zoneId: parseInt(zoneId),
                                createdAt: {
                                    gte: startDate
                                }
                            }
                        }
                    }
                }
            }
        });
        const performance = servicePersons.map((sp) => {
            const user = sp.user;
            const tickets = user.assignedTickets;
            const totalTickets = tickets.length;
            const closedTickets = tickets.filter((t) => t.status === 'CLOSED').length;
            const activeTickets = tickets.filter((t) => ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'IN_PROCESS'].includes(t.status)).length;
            const resolvedTickets = tickets.filter((t) => t.actualResolutionTime);
            const avgResolutionTime = resolvedTickets.length > 0
                ? resolvedTickets.reduce((sum, t) => sum + (t.actualResolutionTime || 0), 0) / resolvedTickets.length
                : 0;
            const slaTickets = tickets.filter((t) => t.slaStatus);
            const slaCompliantTickets = slaTickets.filter((t) => t.slaStatus === 'ON_TIME').length;
            const slaCompliance = slaTickets.length > 0 ? (slaCompliantTickets / slaTickets.length) * 100 : 0;
            return {
                userId: user.id,
                name: user.name || 'Unknown',
                email: user.email,
                totalTickets,
                closedTickets,
                avgResolutionTime: Math.round(avgResolutionTime),
                slaCompliance: Math.round(slaCompliance * 100) / 100,
                activeTickets
            };
        });
        // Sort by total tickets descending
        performance.sort((a, b) => b.totalTickets - a.totalTickets);
        res.json({ servicePersons: performance, timeframe });
    }
    catch (error) {
        console.error('Error fetching service person performance:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getServicePersonPerformance = getServicePersonPerformance;
// Get asset performance metrics
const getAssetPerformance = async (req, res) => {
    try {
        const { zoneId } = req.params;
        const { timeframe = '30d' } = req.query;
        const now = new Date();
        const daysBack = timeframe === '7d' ? 7 : timeframe === '90d' ? 90 : 30;
        const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
        const assets = await prisma.asset.findMany({
            where: {
                customer: {
                    serviceZoneId: parseInt(zoneId)
                }
            },
            include: {
                customer: true,
                tickets: {
                    where: {
                        createdAt: {
                            gte: startDate
                        }
                    }
                },
                serviceHistory: {
                    orderBy: {
                        performedAt: 'desc'
                    },
                    take: 1
                }
            }
        });
        const assetPerformance = assets.map((asset) => {
            const tickets = asset.tickets;
            const totalTickets = tickets.length;
            const criticalTickets = tickets.filter((t) => t.priority === 'CRITICAL').length;
            const resolvedTickets = tickets.filter((t) => t.actualResolutionTime);
            const avgResolutionTime = resolvedTickets.length > 0
                ? resolvedTickets.reduce((sum, t) => sum + (t.actualResolutionTime || 0), 0) / resolvedTickets.length
                : 0;
            const lastService = asset.serviceHistory.length > 0 ? asset.serviceHistory[0] : null;
            return {
                assetId: asset.id,
                machineId: asset.machineId,
                model: asset.model || 'Unknown',
                customerName: asset.customer.companyName,
                totalTickets,
                criticalTickets,
                avgResolutionTime: Math.round(avgResolutionTime),
                lastServiceDate: lastService ? lastService.performedAt.toISOString() : 'Never',
                status: asset.status
            };
        });
        // Sort by total tickets descending
        assetPerformance.sort((a, b) => b.totalTickets - a.totalTickets);
        res.json({ assets: assetPerformance, timeframe });
    }
    catch (error) {
        console.error('Error fetching asset performance:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getAssetPerformance = getAssetPerformance;
// Get ticket trends over time
const getTicketTrends = async (req, res) => {
    try {
        const { zoneId } = req.params;
        const { timeframe = '30d' } = req.query;
        const now = new Date();
        const daysBack = timeframe === '7d' ? 7 : timeframe === '90d' ? 90 : 30;
        const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
        // Get all tickets for the zone within timeframe
        const tickets = await prisma.ticket.findMany({
            where: {
                zoneId: parseInt(zoneId),
                createdAt: {
                    gte: startDate
                }
            },
            select: {
                createdAt: true,
                status: true,
                updatedAt: true
            }
        });
        // Generate date range
        const trends = [];
        const currentDate = new Date(startDate);
        while (currentDate <= now) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const nextDate = new Date(currentDate);
            nextDate.setDate(nextDate.getDate() + 1);
            const createdOnDate = tickets.filter((t) => {
                const ticketDate = new Date(t.createdAt).toISOString().split('T')[0];
                return ticketDate === dateStr;
            }).length;
            const closedOnDate = tickets.filter((t) => {
                const ticketDate = new Date(t.updatedAt).toISOString().split('T')[0];
                return ticketDate === dateStr && t.status === 'CLOSED';
            }).length;
            const openOnDate = tickets.filter((t) => {
                const createdDate = new Date(t.createdAt);
                return createdDate <= currentDate && !['CLOSED', 'CANCELLED'].includes(t.status);
            }).length;
            trends.push({
                date: dateStr,
                created: createdOnDate,
                closed: closedOnDate,
                open: openOnDate
            });
            currentDate.setDate(currentDate.getDate() + 1);
        }
        res.json({ trends, timeframe });
    }
    catch (error) {
        console.error('Error fetching ticket trends:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getTicketTrends = getTicketTrends;
// Get SLA metrics
const getSLAMetrics = async (req, res) => {
    try {
        const { zoneId } = req.params;
        const { timeframe = '30d' } = req.query;
        const now = new Date();
        const daysBack = timeframe === '7d' ? 7 : timeframe === '90d' ? 90 : 30;
        const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
        const tickets = await prisma.ticket.findMany({
            where: {
                zoneId: parseInt(zoneId),
                createdAt: {
                    gte: startDate
                }
            },
            select: {
                slaStatus: true
            }
        });
        const slaTickets = tickets.filter((t) => t.slaStatus);
        const totalSLATickets = slaTickets.length;
        const onTime = slaTickets.filter((t) => t.slaStatus === 'ON_TIME').length;
        const atRisk = slaTickets.filter((t) => t.slaStatus === 'AT_RISK').length;
        const breached = slaTickets.filter((t) => t.slaStatus === 'BREACHED').length;
        const notApplicable = slaTickets.filter((t) => t.slaStatus === 'NOT_APPLICABLE').length;
        const overallCompliance = totalSLATickets > 0 ? (onTime / totalSLATickets) * 100 : 0;
        const metrics = {
            onTime,
            atRisk,
            breached,
            notApplicable,
            overallCompliance: Math.round(overallCompliance * 100) / 100
        };
        res.json({
            metrics,
            totalTickets: totalSLATickets,
            timeframe
        });
    }
    catch (error) {
        console.error('Error fetching SLA metrics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getSLAMetrics = getSLAMetrics;
// Get recent activities
const getRecentActivities = async (req, res) => {
    try {
        const { zoneId } = req.params;
        const { limit = 20 } = req.query;
        const activities = await prisma.auditLog.findMany({
            where: {
                ticket: {
                    zoneId: parseInt(zoneId)
                }
            },
            include: {
                ticket: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        priority: true
                    }
                },
                performedBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            },
            orderBy: {
                performedAt: 'desc'
            },
            take: parseInt(limit)
        });
        const formattedActivities = activities.map((activity) => ({
            id: activity.id,
            action: activity.action,
            details: activity.details,
            performedAt: activity.performedAt,
            performedBy: activity.performedBy,
            ticket: activity.ticket,
            entityType: activity.entityType,
            entityId: activity.entityId
        }));
        res.json({ activities: formattedActivities });
    }
    catch (error) {
        console.error('Error fetching recent activities:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getRecentActivities = getRecentActivities;
// Export report data
const exportZoneReport = async (req, res) => {
    try {
        const { zoneId } = req.params;
        const { timeframe = '30d', format = 'json' } = req.query;
        // Get all the data
        const dashboardData = await getZoneDashboardData(parseInt(zoneId), timeframe);
        if (format === 'csv') {
            // Convert to CSV format
            const csv = convertToCSV(dashboardData);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=zone-${zoneId}-report-${timeframe}.csv`);
            res.send(csv);
        }
        else {
            // Return JSON format
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=zone-${zoneId}-report-${timeframe}.json`);
            res.json(dashboardData);
        }
    }
    catch (error) {
        console.error('Error exporting zone report:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.exportZoneReport = exportZoneReport;
// Helper function to get all dashboard data
async function getZoneDashboardData(zoneId, timeframe) {
    const now = new Date();
    const daysBack = timeframe === '7d' ? 7 : timeframe === '90d' ? 90 : 30;
    const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
    const zone = await prisma.serviceZone.findUnique({
        where: { id: zoneId },
        include: {
            customers: true,
            servicePersons: {
                include: {
                    user: true
                }
            }
        }
    });
    const tickets = await prisma.ticket.findMany({
        where: {
            zoneId: zoneId,
            createdAt: {
                gte: startDate
            }
        },
        include: {
            customer: true,
            asset: true,
            assignedTo: true
        }
    });
    return {
        zone,
        tickets,
        summary: {
            totalTickets: tickets.length,
            totalCustomers: zone?.customers.length || 0,
            totalServicePersons: zone?.servicePersons.length || 0,
            timeframe
        }
    };
}
// Helper function to convert data to CSV
function convertToCSV(data) {
    const tickets = data.tickets;
    const headers = ['ID', 'Title', 'Status', 'Priority', 'Customer', 'Asset', 'Created At', 'Assigned To'];
    const rows = tickets.map((ticket) => [
        ticket.id,
        ticket.title,
        ticket.status,
        ticket.priority,
        ticket.customer?.companyName || '',
        ticket.asset?.machineId || '',
        ticket.createdAt,
        ticket.assignedTo?.name || ''
    ]);
    const csvContent = [headers, ...rows]
        .map((row) => row.map((field) => `"${field}"`).join(','))
        .join('\n');
    return csvContent;
}
