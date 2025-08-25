"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.approvePO = exports.requestPO = void 0;
const db_1 = __importDefault(require("../config/db"));
const client_1 = require("@prisma/client");
// Helper function to get user's full name
const getUserName = (user) => {
    if (user.firstName && user.lastName) {
        return `${user.firstName} ${user.lastName}`;
    }
    return user.email.split('@')[0];
};
const po_notification_service_1 = require("../services/po-notification.service");
const requestPO = async (req, res) => {
    try {
        const { id } = req.params;
        const { items, amount: amountStr, reason } = req.body;
        const userId = req.user.id;
        // Validate input
        if (!Array.isArray(items) || items.length === 0 || !amountStr || !reason) {
            return res.status(400).json({ error: 'Items, amount and reason are required' });
        }
        // Get the ticket
        const ticket = await db_1.default.ticket.findUnique({
            where: { id: parseInt(id) },
            include: { customer: true }
        });
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        // Check permissions - only service person assigned to ticket or admin can request PO
        const isAdmin = req.user?.role === 'ADMIN';
        const isAssignedServicePerson = ticket.assignedToId === userId;
        if (!isAdmin && !isAssignedServicePerson) {
            return res.status(403).json({ error: 'Access denied' });
        }
        // Create PO request
        const poRequest = await db_1.default.$transaction(async (tx) => {
            // Create PO request with proper types
            const po = await tx.pORequest.create({
                data: {
                    ticket: { connect: { id: ticket.id } },
                    requestedBy: { connect: { id: userId } },
                    amount: typeof amountStr === 'string' ? parseFloat(amountStr) : amountStr,
                    description: reason.trim(),
                    // Items are not directly in the schema, using notes field
                    notes: `PO Request Items:\n${items.map(item => {
                        const quantity = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
                        const unitPrice = typeof item.unitPrice === 'string' ? parseFloat(item.unitPrice) : item.unitPrice;
                        return `- ${item.name}: ${quantity} x $${unitPrice.toFixed(2)} = $${(quantity * unitPrice).toFixed(2)}`;
                    }).join('\n')}`
                },
                include: {
                    requestedBy: {
                        select: {
                            id: true,
                            email: true,
                            role: true
                        }
                    },
                    approvedBy: {
                        select: {
                            id: true,
                            email: true,
                            role: true
                        }
                    },
                    ticket: {
                        select: {
                            id: true,
                            title: true,
                            status: true
                        }
                    }
                }
            });
            // Update ticket status
            await tx.ticket.update({
                where: { id: ticket.id },
                data: {
                    status: client_1.TicketStatus.WAITING_FOR_PO
                }
            });
            // Log the PO request
            await db_1.default.auditLog.create({
                data: {
                    entityType: 'PO_REQUEST',
                    entityId: po.id,
                    action: 'CREATE',
                    newValue: {
                        amount: po.amount,
                        status: po.status,
                        ticketId: po.ticketId
                    },
                    performedById: userId,
                    ticketId: po.ticketId
                }
            });
            return po;
        });
        // Send notifications
        const recipientIds = await (0, po_notification_service_1.getPONotificationRecipients)(poRequest.id, userId);
        const requesterName = req.user ? getUserName(req.user) : 'System';
        await (0, po_notification_service_1.sendPOStatusNotification)({
            poId: poRequest.id,
            poNumber: poRequest.id.toString(), // In a real app, use a proper PO number
            status: poRequest.status,
            updatedBy: requesterName,
            ticketId: poRequest.ticketId,
            ticketTitle: 'Unknown Ticket', // Ticket title not available in the current query
            amount: poRequest.amount ?? undefined,
            notes: poRequest.notes || undefined
        }, recipientIds);
        return res.status(201).json(poRequest);
    }
    catch (error) {
        console.error('Error creating PO request:', error);
        return res.status(500).json({ error: 'Failed to create PO request' });
    }
};
exports.requestPO = requestPO;
const approvePO = async (req, res) => {
    try {
        const { requestId } = req.params;
        const { status, approvalNotes } = req.body;
        const userId = req.user.id;
        // Only admins can approve POs
        if (req.user?.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Access denied' });
        }
        // Validate input
        const validStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Valid status is required' });
        }
        const poRequest = await db_1.default.$transaction(async (tx) => {
            // Get and lock the PO request
            const po = await tx.pORequest.findUnique({
                where: { id: parseInt(requestId) },
                include: {
                    ticket: {
                        select: {
                            id: true,
                            status: true,
                            title: true,
                            customerId: true
                        }
                    },
                    requestedBy: {
                        select: {
                            id: true,
                            email: true,
                            role: true
                        }
                    },
                },
            });
            if (!po) {
                throw new Error('PO request not found');
            }
            if (po.status !== 'PENDING_APPROVAL') {
                throw new Error(`PO request is already ${po.status.toLowerCase()}`);
            }
            // Update PO status
            const updatedPO = await tx.pORequest.update({
                where: { id: po.id },
                data: {
                    status,
                    approvedBy: { connect: { id: userId } },
                    approvedAt: new Date(),
                    notes: approvalNotes?.trim()
                },
                include: {
                    requestedBy: {
                        select: {
                            id: true,
                            email: true,
                            role: true
                        }
                    },
                    approvedBy: {
                        select: {
                            id: true,
                            email: true,
                            role: true
                        }
                    },
                    ticket: {
                        select: {
                            id: true,
                            title: true,
                            status: true
                        }
                    }
                }
            });
            // Update ticket status if needed
            if (status === 'APPROVED') {
                await tx.ticket.update({
                    where: { id: po.ticketId },
                    data: { status: client_1.TicketStatus.IN_PROGRESS },
                });
            }
            else if (status === 'REJECTED') {
                await tx.ticket.update({
                    where: { id: po.ticketId },
                    data: { status: client_1.TicketStatus.SPARE_NEEDED },
                });
            }
            return updatedPO;
        });
        // Send notifications
        const recipientIds = await (0, po_notification_service_1.getPONotificationRecipients)(poRequest.id, userId);
        const requesterName = req.user ? getUserName(req.user) : 'System';
        await (0, po_notification_service_1.sendPOStatusNotification)({
            poId: poRequest.id,
            poNumber: poRequest.id.toString(), // In a real app, use a proper PO number
            status: status,
            updatedBy: requesterName,
            ticketId: poRequest.ticketId,
            ticketTitle: 'Unknown Ticket', // Ticket title not available in the current query
            amount: poRequest.amount ?? 0, // Convert null to 0
            notes: approvalNotes
        }, recipientIds);
        return res.json(poRequest);
    }
    catch (error) {
        console.error('Error approving PO request:', error);
        const status = error.message.includes('not found') ? 404 : 400;
        return res.status(status).json({ error: error.message });
    }
};
exports.approvePO = approvePO;
