"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecentTickets = exports.getAdminStats = exports.getTicketTrends = exports.getTicketStatusDistribution = exports.getDashboardData = void 0;
const client_1 = require("@prisma/client");
const db_1 = __importDefault(require("../config/db"));
const getDashboardData = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        let dashboardData = {};
        // Common stats for all roles
        const [totalTickets, openTickets, inProgressTickets, resolvedTickets] = await Promise.all([
            db_1.default.ticket.count(),
            db_1.default.ticket.count({
                where: {
                    status: 'OPEN'
                }
            }),
            db_1.default.ticket.count({
                where: {
                    status: 'IN_PROGRESS'
                }
            }),
            db_1.default.ticket.count({
                where: {
                    status: 'CLOSED'
                }
            })
        ]);
        dashboardData.stats = {
            totalTickets,
            openTickets,
            inProgressTickets,
            resolvedTickets,
            resolutionRate: totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0
        };
        // Get role-specific data
        switch (user.role) {
            case 'ADMIN':
                await getAdminDashboardData(dashboardData);
                break;
            case 'SERVICE_PERSON':
                await getServicePersonDashboardData(dashboardData, user.id);
                break;
            case 'CUSTOMER_ACCOUNT_OWNER':
            case 'CUSTOMER_CONTACT':
                if (user.customerId) {
                    await getCustomerDashboardData(dashboardData, user.customerId);
                }
                else {
                    return res.status(400).json({ error: 'Customer ID is required' });
                }
                break;
            default:
                return res.status(400).json({ error: 'Invalid user role' });
        }
        // Get recent tickets based on role
        dashboardData.recentTickets = await getRecentTicketsForUser(user, 10);
        return res.json(dashboardData);
    }
    catch (error) {
        console.error('Error fetching dashboard data:', error);
        return res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
};
exports.getDashboardData = getDashboardData;
async function getAdminDashboardData(dashboardData) {
    const [totalCustomers, totalServicePersons, totalServiceZones, ticketStatusDistribution, ticketTrends] = await Promise.all([
        db_1.default.customer.count(),
        db_1.default.user.count({ where: { role: 'SERVICE_PERSON' } }),
        db_1.default.serviceZone.count(),
        db_1.default.ticket.groupBy({
            by: ['status'],
            _count: { id: true }
        }),
        db_1.default.$queryRaw `
      SELECT 
        DATE(createdAt) as date,
        COUNT(*) as count,
        status
      FROM Ticket
      WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(createdAt), status
      ORDER BY date ASC
    `
    ]);
    dashboardData.adminStats = {
        totalCustomers,
        totalServicePersons,
        totalServiceZones,
        ticketStatusDistribution: ticketStatusDistribution.reduce((acc, item) => {
            acc[item.status] = item._count.id;
            return acc;
        }, {}),
        ticketTrends
    };
}
async function getServicePersonDashboardData(dashboardData, userId) {
    const [assignedTickets, completedTickets, pendingApprovals, customerDistribution] = await Promise.all([
        db_1.default.ticket.count({
            where: {
                assignedToId: userId,
                status: {
                    in: [
                        client_1.TicketStatus.OPEN,
                        client_1.TicketStatus.IN_PROGRESS,
                        'WAITING_FOR_RESPONSE'
                    ]
                }
            }
        }),
        db_1.default.ticket.count({
            where: {
                assignedToId: userId,
                status: client_1.TicketStatus.CLOSED,
                updatedAt: {
                    gte: new Date(new Date().setDate(new Date().getDate() - 30))
                }
            }
        }),
        // Changed from purchaseRequest to purchaseRequestTicket if that's your model name
        // Purchase requests are not currently implemented
        0,
        db_1.default.ticket.groupBy({
            by: ['customerId'],
            _count: { id: true },
            where: { assignedToId: userId },
            orderBy: { _count: { id: 'desc' } },
            take: 5
        })
    ]);
    dashboardData.servicePersonStats = {
        assignedTickets,
        completedTickets,
        pendingApprovals,
        customerDistribution: await Promise.all(customerDistribution.map(async (item) => {
            const customer = await db_1.default.customer.findUnique({
                where: { id: item.customerId },
                select: { companyName: true }
            });
            return {
                customerId: item.customerId,
                customerName: customer?.companyName || 'Unknown',
                ticketCount: item._count.id
            };
        }))
    };
}
async function getCustomerDashboardData(dashboardData, customerId) {
    const [myTickets, openTickets, inProgressTickets, resolvedTickets, assetDistribution] = await Promise.all([
        db_1.default.ticket.count({ where: { customerId } }),
        db_1.default.ticket.count({
            where: {
                customerId,
                status: client_1.TicketStatus.OPEN
            }
        }),
        db_1.default.ticket.count({
            where: {
                customerId,
                status: client_1.TicketStatus.IN_PROGRESS
            }
        }),
        db_1.default.ticket.count({
            where: {
                customerId,
                status: client_1.TicketStatus.CLOSED
            }
        }),
        // Changed to use the correct field name from your Prisma schema
        db_1.default.ticket.groupBy({
            by: ['assetId'],
            _count: {
                id: true
            },
            where: { customerId },
            orderBy: {
                _count: {
                    id: 'desc'
                }
            },
            take: 5
        })
    ]);
    dashboardData.customerStats = {
        myTickets,
        openTickets,
        inProgressTickets,
        resolvedTickets,
        resolutionRate: myTickets > 0 ? (resolvedTickets / myTickets) * 100 : 0,
        assetDistribution: await Promise.all(assetDistribution.map(async (item) => {
            if (!item.assetId)
                return { assetName: 'Unassigned', ticketCount: item._count.id };
            const asset = await db_1.default.asset.findUnique({
                where: {
                    id: item.assetId
                },
                select: {
                    id: true,
                    model: true
                }
            });
            return {
                assetId: item.assetId,
                assetName: asset?.model || 'Unknown',
                ticketCount: item._count.id
            };
        }))
    };
}
const getTicketStatusDistribution = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { role, customerId } = user;
        let where = {};
        if (role === 'SERVICE_PERSON') {
            where.assignedToId = user.id;
        }
        else if (role === 'CUSTOMER_ACCOUNT_OWNER' && customerId) {
            where.customerId = customerId;
        }
        const distribution = await db_1.default.ticket.groupBy({
            by: ['status'],
            _count: { id: true },
            where
        });
        return res.json({
            distribution: distribution.map(item => ({
                status: item.status,
                count: item._count.id
            }))
        });
    }
    catch (error) {
        console.error('Error fetching ticket status distribution:', error);
        return res.status(500).json({ error: 'Failed to fetch ticket status distribution' });
    }
};
exports.getTicketStatusDistribution = getTicketStatusDistribution;
const getTicketTrends = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { role, customerId } = user;
        const { days = 30 } = req.query;
        let whereClause = client_1.Prisma.empty;
        if (role === 'SERVICE_PERSON') {
            whereClause = client_1.Prisma.sql `WHERE assignedToId = ${user.id}`;
        }
        else if (role === 'CUSTOMER_ACCOUNT_OWNER' && customerId) {
            whereClause = client_1.Prisma.sql `WHERE customerId = ${customerId}`;
        }
        const trends = await db_1.default.$queryRaw `
      SELECT 
        DATE(createdAt) as date,
        COUNT(*) as count
      FROM Ticket
      ${whereClause}
      AND createdAt >= DATE_SUB(NOW(), INTERVAL ${Number(days)} DAY)
      GROUP BY DATE(createdAt)
      ORDER BY date ASC
    `;
        return res.json({ trends });
    }
    catch (error) {
        console.error('Error fetching ticket trends:', error);
        return res.status(500).json({ error: 'Failed to fetch ticket trends' });
    }
};
exports.getTicketTrends = getTicketTrends;
const getAdminStats = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Access denied. Admin role required.' });
        }
        const [totalCustomers, totalServicePersons, totalServiceZones, totalTickets, openTickets, inProgressTickets, closedTickets, pendingTickets] = await Promise.all([
            db_1.default.customer.count(),
            db_1.default.user.count({ where: { role: 'SERVICE_PERSON' } }),
            db_1.default.serviceZone.count(),
            db_1.default.ticket.count(),
            db_1.default.ticket.count({
                where: {
                    status: 'OPEN'
                }
            }),
            db_1.default.ticket.count({
                where: {
                    status: 'IN_PROGRESS'
                }
            }),
            db_1.default.ticket.count({
                where: {
                    status: 'CLOSED',
                    updatedAt: {
                        gte: new Date(new Date().setDate(new Date().getDate() - 30))
                    }
                }
            }),
            db_1.default.ticket.count({
                where: {
                    status: 'WAITING_FOR_RESPONSE'
                }
            })
        ]);
        const adminStats = {
            totalCustomers,
            totalServicePersons,
            totalServiceZones,
            totalTickets,
            openTickets,
            inProgressTickets,
            closedTickets,
            pendingTickets,
            resolutionRate: totalTickets > 0 ? (closedTickets / totalTickets) * 100 : 0
        };
        return res.json(adminStats);
    }
    catch (error) {
        console.error('Error fetching admin stats:', error);
        return res.status(500).json({ error: 'Failed to fetch admin stats' });
    }
};
exports.getAdminStats = getAdminStats;
const getRecentTickets = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { limit = 10 } = req.query;
        const tickets = await getRecentTicketsForUser(user, Number(limit));
        return res.json(tickets);
    }
    catch (error) {
        console.error('Error fetching recent tickets:', error);
        return res.status(500).json({ error: 'Failed to fetch recent tickets' });
    }
};
exports.getRecentTickets = getRecentTickets;
async function getRecentTicketsForUser(user, limit = 10) {
    let where = {};
    // Filter tickets based on user role
    switch (user.role) {
        case 'SERVICE_PERSON':
            where = { assignedToId: user.id };
            break;
        case 'CUSTOMER_ACCOUNT_OWNER':
            where = { customerId: user.customerId };
            break;
        // Admin can see all tickets
    }
    return db_1.default.ticket.findMany({
        where,
        orderBy: {
            createdAt: 'desc'
        },
        take: limit,
        select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            createdAt: true,
            customer: {
                select: {
                    id: true,
                    companyName: true
                }
            },
            assignedTo: user.role === 'CUSTOMER_ACCOUNT_OWNER' ? {
                select: {
                    id: true
                }
            } : false,
            asset: user.role !== 'CUSTOMER_ACCOUNT_OWNER' ? {
                select: {
                    id: true,
                    model: true
                }
            } : false
        }
    });
}
