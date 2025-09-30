"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.backOnsiteVisit = exports.endOnsiteVisit = exports.reachOnsiteVisit = exports.startOnsiteVisit = void 0;
const prisma_1 = require("../lib/prisma");
const geocoding_service_1 = require("../services/geocoding.service");
async function createVisitLog(userId, ticketId, event, latitude, longitude) {
    const { address } = await geocoding_service_1.GeocodingService.reverseGeocode(latitude, longitude);
    const log = await prisma_1.prisma.onsiteVisitLog.create({
        data: {
            ticketId,
            userId,
            event,
            latitude: latitude,
            longitude: longitude,
            address: address || undefined,
        },
    });
    return log;
}
const startOnsiteVisit = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { ticketId, latitude, longitude } = req.body;
        // Optional: ensure ticket exists
        const ticket = await prisma_1.prisma.ticket.findUnique({ where: { id: Number(ticketId) } });
        if (!ticket)
            return res.status(404).json({ error: 'Ticket not found' });
        const log = await createVisitLog(userId, Number(ticketId), 'STARTED', Number(latitude), Number(longitude));
        return res.status(201).json(log);
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to record onsite start' });
    }
};
exports.startOnsiteVisit = startOnsiteVisit;
const reachOnsiteVisit = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { ticketId, latitude, longitude } = req.body;
        const ticket = await prisma_1.prisma.ticket.findUnique({ where: { id: Number(ticketId) } });
        if (!ticket)
            return res.status(404).json({ error: 'Ticket not found' });
        const log = await createVisitLog(userId, Number(ticketId), 'REACHED', Number(latitude), Number(longitude));
        return res.status(201).json(log);
    }
    catch (_error) {
        return res.status(500).json({ error: 'Failed to record onsite reached' });
    }
};
exports.reachOnsiteVisit = reachOnsiteVisit;
const endOnsiteVisit = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { ticketId, latitude, longitude } = req.body;
        const ticket = await prisma_1.prisma.ticket.findUnique({ where: { id: Number(ticketId) } });
        if (!ticket)
            return res.status(404).json({ error: 'Ticket not found' });
        const log = await createVisitLog(userId, Number(ticketId), 'ENDED', Number(latitude), Number(longitude));
        return res.status(201).json(log);
    }
    catch (_error) {
        return res.status(500).json({ error: 'Failed to record onsite end' });
    }
};
exports.endOnsiteVisit = endOnsiteVisit;
const backOnsiteVisit = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { ticketId, latitude, longitude } = req.body;
        const ticket = await prisma_1.prisma.ticket.findUnique({ where: { id: Number(ticketId) } });
        if (!ticket)
            return res.status(404).json({ error: 'Ticket not found' });
        const log = await createVisitLog(userId, Number(ticketId), 'REACHED_BACK', Number(latitude), Number(longitude));
        return res.status(201).json(log);
    }
    catch (_error) {
        return res.status(500).json({ error: 'Failed to record onsite reached back' });
    }
};
exports.backOnsiteVisit = backOnsiteVisit;
