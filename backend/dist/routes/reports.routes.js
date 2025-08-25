"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_request_1 = require("../middleware/validate-request");
const client_1 = require("@prisma/client");
const db_1 = __importDefault(require("../config/db"));
const router = (0, express_1.Router)();
// Apply auth middleware to all routes
router.use(auth_middleware_1.authenticate);
// Get ticket status distribution
router.get('/tickets-status', validate_request_1.validateRequest, (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_ACCOUNT_OWNER']), async (req, res) => {
    try {
        const { role, customerId } = req.user;
        let where = {};
        if (role === 'SERVICE_PERSON') {
            where.assignedToId = req.user.id;
        }
        else if (role === 'CUSTOMER_ACCOUNT_OWNER' && customerId) {
            where.customerId = customerId;
        }
        const distribution = await db_1.default.ticket.groupBy({
            by: ['status'],
            _count: { id: true },
            where
        });
        const statusColors = {
            'OPEN': '#ef4444',
            'IN_PROGRESS': '#f59e0b',
            'WAITING_FOR_RESPONSE': '#8b5cf6',
            'CLOSED': '#10b981'
        };
        const result = distribution.map(item => ({
            status: item.status,
            count: item._count.id,
            color: statusColors[item.status] || '#6b7280'
        }));
        return res.json(result);
    }
    catch (error) {
        console.error('Error fetching ticket status data:', error);
        return res.status(500).json({ error: 'Failed to fetch ticket status data' });
    }
});
// Get service performance data
router.get('/service-performance', validate_request_1.validateRequest, (0, auth_middleware_1.requireRole)(['ADMIN']), async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Access denied. Admin role required.' });
        }
        const servicePersons = await db_1.default.user.findMany({
            where: { role: 'SERVICE_PERSON' },
            select: {
                id: true,
                email: true,
                assignedTickets: {
                    where: { status: 'CLOSED' },
                    select: {
                        id: true,
                        createdAt: true,
                        updatedAt: true
                    }
                }
            }
        });
        const performanceData = servicePersons.map(person => {
            const completedTickets = person.assignedTickets.length;
            const avgResolutionTime = completedTickets > 0
                ? person.assignedTickets.reduce((total, ticket) => {
                    const resolutionTime = new Date(ticket.updatedAt).getTime() - new Date(ticket.createdAt).getTime();
                    return total + resolutionTime;
                }, 0) / completedTickets / (1000 * 60 * 60) // Convert to hours
                : 0;
            return {
                servicePersonId: person.id.toString(),
                name: person.email.split('@')[0], // Use email prefix as name
                completedTickets,
                avgResolutionTime: Math.round(avgResolutionTime * 100) / 100
            };
        });
        return res.json(performanceData);
    }
    catch (error) {
        console.error('Error fetching service performance data:', error);
        return res.status(500).json({ error: 'Failed to fetch service performance data' });
    }
});
// Get ticket trends
router.get('/ticket-trends', [
    (0, express_validator_1.query)('days')
        .optional()
        .isInt({ min: 1, max: 365 })
        .withMessage('Days must be between 1 and 365')
        .toInt(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_ACCOUNT_OWNER']), async (req, res) => {
    try {
        const { role, customerId } = req.user;
        const { days = 30 } = req.query;
        let whereClause = client_1.Prisma.empty;
        if (role === 'SERVICE_PERSON') {
            whereClause = client_1.Prisma.sql `WHERE assignedToId = ${req.user.id}`;
        }
        else if (role === 'CUSTOMER_ACCOUNT_OWNER' && customerId) {
            whereClause = client_1.Prisma.sql `WHERE customerId = ${customerId}`;
        }
        const trends = await db_1.default.$queryRaw `
        SELECT 
          DATE(createdAt) as date,
          COUNT(CASE WHEN status = 'OPEN' THEN 1 END) as opened,
          COUNT(CASE WHEN status = 'CLOSED' THEN 1 END) as closed
        FROM Ticket
        ${whereClause}
        AND createdAt >= DATE_SUB(NOW(), INTERVAL ${Number(days)} DAY)
        GROUP BY DATE(createdAt)
        ORDER BY date ASC
      `;
        return res.json(trends);
    }
    catch (error) {
        console.error('Error fetching ticket trends:', error);
        return res.status(500).json({ error: 'Failed to fetch ticket trends' });
    }
});
exports.default = router;
