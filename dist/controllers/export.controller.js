"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportDashboardReport = exportDashboardReport;
const db_1 = __importDefault(require("../config/db"));
// Helper function to build ticket filter from query params
function buildTicketFilterFromQuery(query, zoneIds = null) {
    const { startDate, endDate, status, priority, serviceZone, servicePerson } = query;
    const filter = {};
    // Add date range filter
    if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate)
            filter.createdAt.gte = new Date(startDate);
        if (endDate)
            filter.createdAt.lte = new Date(endDate);
    }
    // Add status filter
    if (status) {
        const statuses = status.split(',');
        filter.status = { in: statuses };
    }
    // Add priority filter
    if (priority) {
        const priorities = priority.split(',');
        filter.priority = { in: priorities };
    }
    // Add service zone filter
    if (serviceZone) {
        filter.customer = {
            ...filter.customer,
            serviceZone: { name: serviceZone }
        };
    }
    // Add service person filter
    if (servicePerson) {
        filter.assignedTo = {
            ...filter.assignedTo,
            name: { contains: servicePerson, mode: 'insensitive' }
        };
    }
    // Add zone filter if user has zone restrictions
    if (zoneIds?.length) {
        filter.customer = {
            ...filter.customer,
            serviceZoneId: { in: zoneIds }
        };
    }
    return filter;
}
// Helper function to get user's accessible zone IDs
async function getUserZoneIds(userId) {
    const user = await db_1.default.user.findUnique({
        where: { id: userId },
        include: { serviceZones: true }
    });
    return user?.serviceZones.map((zone) => zone.serviceZoneId) || [];
}
// Export dashboard data as Excel
async function exportDashboardReport(req, res) {
    try {
        const user = req.user;
        const zoneIds = await getUserZoneIds(user.id);
        // Build the filter based on query parameters
        const filter = buildTicketFilterFromQuery(req.query, zoneIds.length ? zoneIds : null);
        // Fetch tickets with related data
        const tickets = await db_1.default.ticket.findMany({
            where: filter,
            include: {
                customer: {
                    include: {
                        serviceZone: true
                    }
                },
                assignedTo: true,
                asset: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        // Format data for Excel
        const data = tickets.map(ticket => {
            const customer = ticket.customer;
            const assignedTo = ticket.assignedTo;
            const asset = ticket.asset;
            return {
                'Ticket ID': ticket.id,
                'Title': ticket.title,
                'Status': ticket.status,
                'Priority': ticket.priority,
                'Created At': ticket.createdAt.toISOString(),
                'Updated At': ticket.updatedAt.toISOString(),
                'Customer': customer?.companyName || 'N/A',
                'Service Zone': customer?.serviceZone?.name || 'N/A',
                'Assigned To': assignedTo?.name || 'Unassigned',
                'Assigned Email': assignedTo?.email || 'N/A',
                'Asset Model': asset?.model || 'N/A',
                'Description': ticket.description || ''
            };
        });
        // Convert to Excel
        const excel = require('xlsx');
        const worksheet = excel.utils.json_to_sheet(data);
        const workbook = excel.utils.book_new();
        excel.utils.book_append_sheet(workbook, worksheet, 'Tickets');
        // Set headers for file download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=kardexcare-report-${new Date().toISOString().split('T')[0]}.xlsx`);
        // Send the Excel file
        return excel.write(workbook, { type: 'buffer', bookType: 'xlsx' }).then((buffer) => {
            res.send(buffer);
        });
    }
    catch (error) {
        console.error('Error exporting report:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to export report',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
