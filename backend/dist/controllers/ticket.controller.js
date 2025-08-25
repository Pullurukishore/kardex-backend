"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addComment = exports.updateStatus = exports.getTicket = exports.getTickets = exports.createTicket = void 0;
const client_1 = require("@prisma/client");
const db_1 = __importDefault(require("../config/db"));
// Helper to check ticket access
async function checkTicketAccess(user, ticketId) {
    const ticket = await db_1.default.ticket.findUnique({
        where: { id: ticketId },
        select: { customerId: true, assignedToId: true }
    });
    if (!ticket)
        return { allowed: false, error: 'Ticket not found' };
    // Admin can access any ticket
    if (user.role === client_1.UserRole.ADMIN)
        return { allowed: true };
    // Customer can access their own tickets
    if (user.role === client_1.UserRole.CUSTOMER_ACCOUNT_OWNER && ticket.customerId === user.customerId) {
        return { allowed: true };
    }
    // Service person can access assigned tickets
    if (user.role === client_1.UserRole.SERVICE_PERSON && ticket.assignedToId === user.id) {
        return { allowed: true };
    }
    return { allowed: false, error: 'Access denied' };
}
// Create a new ticket
const createTicket = async (req, res) => {
    try {
        const { title, description, priority = 'MEDIUM', customerId, machineId } = req.body;
        const user = req.user; // Type assertion as we know the user will be defined due to auth middleware
        if (!title || !description) {
            return res.status(400).json({ error: 'Title and description are required' });
        }
        const ticket = await db_1.default.ticket.create({
            data: {
                title,
                description,
                priority: priority,
                status: 'OPEN',
                customer: { connect: { id: customerId || user.customerId } },
                ...(machineId && { machine: { connect: { id: machineId } } }),
                createdBy: { connect: { id: user.id } },
                statusHistory: {
                    create: [{
                            status: 'OPEN',
                            changedBy: { connect: { id: user.id } },
                            comments: 'Ticket created'
                        }]
                }
            },
            include: {
                customer: { select: { id: true, companyName: true } },
                asset: { select: { id: true, model: true } },
                createdBy: { select: { id: true } }
            }
        });
        return res.status(201).json(ticket);
    }
    catch (error) {
        console.error('Error creating ticket:', error);
        return res.status(500).json({ error: 'Failed to create ticket' });
    }
};
exports.createTicket = createTicket;
// Get tickets with filters
const getTickets = async (req, res) => {
    try {
        const { status, priority, page = 1, limit = 20 } = req.query;
        const user = req.user; // Type assertion as we know the user will be defined due to auth middleware
        const skip = (Number(page) - 1) * Number(limit);
        const where = {};
        // Role-based filtering
        if (user.role === client_1.UserRole.CUSTOMER_ACCOUNT_OWNER) {
            where.customerId = user.customerId;
        }
        else if (user.role === client_1.UserRole.SERVICE_PERSON) {
            where.assignedToId = user.id;
        }
        if (status)
            where.status = { in: status.split(',') };
        if (priority)
            where.priority = priority;
        const [tickets, total] = await Promise.all([
            db_1.default.ticket.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { createdAt: 'desc' },
                include: {
                    customer: { select: { companyName: true } },
                    assignedTo: { select: { id: true } }
                }
            }),
            db_1.default.ticket.count({ where })
        ]);
        return res.json({
            data: tickets,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / Number(limit))
            }
        });
    }
    catch (error) {
        console.error('Error fetching tickets:', error);
        return res.status(500).json({ error: 'Failed to fetch tickets' });
    }
};
exports.getTickets = getTickets;
// Get ticket by ID
const getTicket = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user; // Type assertion as we know the user will be defined due to auth middleware
        const permission = await checkTicketAccess(user, Number(id));
        if (!permission.allowed) {
            return res.status(403).json({ error: permission.error });
        }
        const ticket = await db_1.default.ticket.findUnique({
            where: { id: Number(id) },
            include: {
                customer: { select: { companyName: true } },
                asset: true,
                assignedTo: { select: { id: true } },
                // Comments temporarily removed as it's not in the schema
            }
        });
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        return res.json(ticket);
    }
    catch (error) {
        console.error('Error fetching ticket:', error);
        return res.status(500).json({ error: 'Failed to fetch ticket' });
    }
};
exports.getTicket = getTicket;
// Update ticket status
const updateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, comments } = req.body;
        const user = req.user; // Type assertion as we know the user will be defined due to auth middleware
        const permission = await checkTicketAccess(user, Number(id));
        if (!permission.allowed) {
            return res.status(403).json({ error: permission.error });
        }
        if (!Object.values(client_1.TicketStatus).includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        const ticket = await db_1.default.ticket.update({
            where: { id: Number(id) },
            data: {
                status,
                ...(status === 'RESOLVED' && { resolvedAt: new Date() }),
                ...(status === 'CLOSED' && { closedAt: new Date() }),
                // Status history is handled by a separate table in the schema
                // Consider implementing a separate endpoint for status history if needed
            },
            include: {
                customer: { select: { id: true } },
                assignedTo: { select: { id: true } }
            }
        });
        return res.json(ticket);
    }
    catch (error) {
        console.error('Error updating status:', error);
        return res.status(500).json({ error: 'Failed to update status' });
    }
};
exports.updateStatus = updateStatus;
// Add comment to ticket
const addComment = async (req, res) => {
    try {
        const { id } = req.params;
        const { content, isInternal = false } = req.body;
        const user = req.user; // Type assertion as we know the user will be defined due to auth middleware
        const permission = await checkTicketAccess(user, Number(id));
        if (!permission.allowed) {
            return res.status(403).json({ error: permission.error });
        }
        if (user.role === client_1.UserRole.CUSTOMER_ACCOUNT_OWNER && isInternal) {
            return res.status(403).json({ error: 'Cannot add internal comments' });
        }
        // Comment functionality temporarily disabled as it's not in the schema
        return res.status(201).json({
            message: 'Comment functionality will be implemented soon',
            content,
            isInternal,
            ticketId: Number(id),
            userId: user.id
        });
    }
    catch (error) {
        console.error('Error adding comment:', error);
        return res.status(500).json({ error: 'Failed to add comment' });
    }
};
exports.addComment = addComment;
