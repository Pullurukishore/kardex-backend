"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePdf = void 0;
exports.getColumnsForReport = getColumnsForReport;
const pdfkit_1 = __importDefault(require("pdfkit"));
const date_fns_1 = require("date-fns");
// Define colors and styles
const COLORS = {
    primary: '#2563eb',
    secondary: '#64748b',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    dark: '#1e293b',
    light: '#f8fafc',
    lightGray: '#f1f5f9',
    darkGray: '#64748b',
    white: '#ffffff',
    black: '#000000',
};
// Helper function to calculate column widths
function calculateColumnWidths(columns, availableWidth) {
    const totalDefinedWidth = columns.reduce((sum, col) => sum + (col.width || 0), 0);
    const remainingWidth = availableWidth - totalDefinedWidth;
    const autoWidthColumns = columns.filter(col => !col.width);
    const autoWidth = autoWidthColumns.length > 0 ? remainingWidth / autoWidthColumns.length : 0;
    return columns.map(col => col.width || autoWidth);
}
// Helper function to format cell values
function formatCellValue(value, formatter) {
    if (formatter)
        return formatter(value);
    if (value === null || value === undefined)
        return '';
    if (value instanceof Date)
        return (0, date_fns_1.format)(value, 'yyyy-MM-dd HH:mm:ss');
    return String(value);
}
// Enhanced function to draw professional table with borders and styling
function drawProfessionalTable(doc, data, columns, columnWidths, startY, style) {
    const tableX = 50;
    const tableWidth = doc.page.width - 100;
    const rowHeight = 25;
    let currentY = startY;
    // Draw table header
    doc.save();
    // Header background
    doc
        .rect(tableX, currentY, tableWidth, rowHeight)
        .fill(style.headerBg || COLORS.primary);
    // Header borders
    doc
        .rect(tableX, currentY, tableWidth, rowHeight)
        .lineWidth(style.borderWidth || 1)
        .stroke(style.borderColor || COLORS.secondary);
    // Header text
    doc
        .font('Helvetica-Bold')
        .fontSize(style.headerFontSize || 10)
        .fillColor(style.headerTextColor || COLORS.white);
    let currentX = tableX;
    columns.forEach((column, i) => {
        // Draw vertical border for header cells
        if (i > 0) {
            doc
                .moveTo(currentX, currentY)
                .lineTo(currentX, currentY + rowHeight)
                .stroke(style.borderColor || COLORS.secondary);
        }
        doc.text(column.header, currentX + (style.cellPadding || 5), currentY + (style.cellPadding || 5), {
            width: columnWidths[i] - (style.cellPadding || 5) * 2,
            align: column.align || 'left',
            ellipsis: true
        });
        currentX += columnWidths[i];
    });
    currentY += rowHeight;
    doc.restore();
    // Draw data rows
    data.forEach((row, rowIndex) => {
        // Check if we need a new page
        if (currentY > doc.page.height - 100) {
            doc.addPage();
            currentY = 50;
            // Redraw header on new page
            doc.save();
            doc
                .rect(tableX, currentY, tableWidth, rowHeight)
                .fill(style.headerBg || COLORS.primary);
            doc
                .rect(tableX, currentY, tableWidth, rowHeight)
                .lineWidth(style.borderWidth || 1)
                .stroke(style.borderColor || COLORS.secondary);
            doc
                .font('Helvetica-Bold')
                .fontSize(style.headerFontSize || 10)
                .fillColor(style.headerTextColor || COLORS.white);
            currentX = tableX;
            columns.forEach((column, i) => {
                if (i > 0) {
                    doc
                        .moveTo(currentX, currentY)
                        .lineTo(currentX, currentY + rowHeight)
                        .stroke(style.borderColor || COLORS.secondary);
                }
                doc.text(column.header, currentX + (style.cellPadding || 5), currentY + (style.cellPadding || 5), {
                    width: columnWidths[i] - (style.cellPadding || 5) * 2,
                    align: column.align || 'left',
                    ellipsis: true
                });
                currentX += columnWidths[i];
            });
            currentY += rowHeight;
            doc.restore();
        }
        // Alternate row background
        if (rowIndex % 2 === 0 && style.alternateRowBg) {
            doc
                .rect(tableX, currentY, tableWidth, rowHeight)
                .fill(style.alternateRowBg)
                .fillOpacity(0.3);
        }
        // Row border
        doc
            .rect(tableX, currentY, tableWidth, rowHeight)
            .lineWidth(style.borderWidth || 0.5)
            .stroke(style.borderColor || COLORS.secondary);
        // Cell content
        currentX = tableX;
        columns.forEach((column, colIndex) => {
            // Vertical cell borders
            if (colIndex > 0) {
                doc
                    .moveTo(currentX, currentY)
                    .lineTo(currentX, currentY + rowHeight)
                    .lineWidth(style.borderWidth || 0.5)
                    .stroke(style.borderColor || COLORS.secondary);
            }
            const cellValue = formatCellValue(getNestedValue(row, column.key), column.format);
            const cellStyle = column.cellStyle ? column.cellStyle(getNestedValue(row, column.key)) : {};
            doc
                .font(cellStyle.bold ? 'Helvetica-Bold' : 'Helvetica')
                .fontSize(cellStyle.fontSize || style.fontSize || 9)
                .fillColor(cellStyle.color || COLORS.dark);
            doc.text(cellValue, currentX + (style.cellPadding || 5), currentY + (style.cellPadding || 5), {
                width: columnWidths[colIndex] - (style.cellPadding || 5) * 2,
                align: column.align || 'left',
                ellipsis: true,
                height: rowHeight - (style.cellPadding || 5) * 2
            });
            currentX += columnWidths[colIndex];
        });
        currentY += rowHeight;
    });
}
// Helper function to get nested object values
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
        if (current && typeof current === 'object' && key in current) {
            return current[key];
        }
        return '';
    }, obj);
}
// Main function to generate PDF
const generatePdf = (res, data, columns, title, filters, summaryData) => {
    // Helper function to add summary section
    function addSummarySection(doc, summaryData, currentY) {
        doc
            .fontSize(12)
            .font('Helvetica-Bold')
            .fillColor(COLORS.darkGray)
            .text('Summary', 50, currentY);
        currentY += 20;
        // Add summary metrics in a grid layout
        const metrics = Object.entries(summaryData);
        const columnWidth = (doc.page.width - 150) / 2;
        let currentX = 50;
        let rowHeight = 0;
        metrics.forEach(([key, value], index) => {
            // Start new row for every 2 metrics
            if (index % 2 === 0) {
                if (index > 0) {
                    currentY += rowHeight + 10;
                    rowHeight = 0;
                }
                currentX = 50;
            }
            else {
                currentX = 50 + columnWidth + 50;
            }
            // Draw metric card
            const metricHeight = 60;
            doc
                .fill(COLORS.lightGray)
                .fillOpacity(0.3)
                .roundedRect(currentX, currentY, columnWidth, metricHeight, 5);
            doc
                .stroke(COLORS.primary)
                .lineWidth(0.5)
                .roundedRect(currentX, currentY, columnWidth, metricHeight, 5)
                .stroke();
            // Add metric name
            doc
                .fontSize(10)
                .fillColor(COLORS.secondary)
                .text(String(key).split(/(?=[A-Z])/).join(' ').replace(/^./, str => str.toUpperCase()), currentX + 10, currentY + 10, { width: columnWidth - 20 });
            // Add metric value
            doc
                .fontSize(16)
                .font('Helvetica-Bold')
                .fillColor(COLORS.primary)
                .text(String(value), currentX + 10, currentY + 30, { width: columnWidth - 20 });
            rowHeight = Math.max(rowHeight, metricHeight);
        });
        // Return the new Y position after the summary section
        return currentY + (rowHeight > 0 ? rowHeight + 20 : 0);
    }
    return new Promise((resolve, reject) => {
        const doc = new pdfkit_1.default({
            margin: 50,
            bufferPages: true,
            autoFirstPage: true,
            size: 'A4',
            layout: 'portrait'
        });
        try {
            // Set document info
            doc.info = {
                Title: title,
                Author: 'KardexCare',
                Creator: 'KardexCare Reports',
                CreationDate: new Date()
            };
            // Set response headers
            const filename = `${title.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            // Pipe the PDF to response
            doc.pipe(res);
            // Add header with logo and title
            doc
                .fillColor(COLORS.primary)
                .fontSize(24)
                .font('Helvetica-Bold')
                .text('KardexCare', 50, 50)
                .fillColor(COLORS.darkGray)
                .fontSize(10)
                .text('Service Management System', 50, 75);
            // Add report title and date
            doc
                .fillColor(COLORS.darkGray)
                .fontSize(18)
                .font('Helvetica-Bold')
                .text(title, 50, 120, { align: 'left' });
            // Add report metadata
            doc
                .fontSize(10)
                .fillColor(COLORS.secondary)
                .text(`Generated on: ${new Date().toLocaleString()}`, 50, 150, { align: 'left' })
                .text(`Date Range: ${new Date(filters.from).toLocaleDateString()} - ${new Date(filters.to).toLocaleDateString()}`, 50, 165, { align: 'left' });
            // Add any additional filters
            const filtersText = Object.entries(filters)
                .filter(([key]) => !['from', 'to', 'format', 'reportType'].includes(key) && filters[key])
                .map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`)
                .join(' | ');
            if (filtersText) {
                doc
                    .text(filtersText, 50, 180, { align: 'left', width: doc.page.width - 100 })
                    .moveDown();
            }
            // Add summary section if provided
            if (summaryData) {
                doc.moveDown();
                const summaryY = doc.y;
                const newY = addSummarySection(doc, summaryData, summaryY);
                doc.y = newY;
            }
            // Start a new page for the data table
            doc.addPage();
            // Add table title with enhanced styling
            doc
                .fontSize(16)
                .font('Helvetica-Bold')
                .fillColor(COLORS.primary)
                .text('Detailed Report Data', 50, 50)
                .fontSize(10)
                .fillColor(COLORS.secondary)
                .text(`Total Records: ${data.length}`, 50, 75)
                .moveDown(0.5);
            // Enhanced table with professional styling
            const startY = 100;
            const columnWidths = calculateColumnWidths(columns, doc.page.width - 100);
            const tableStyle = {
                headerBg: COLORS.primary,
                headerTextColor: COLORS.white,
                alternateRowBg: COLORS.lightGray,
                borderColor: COLORS.secondary,
                borderWidth: 0.5,
                cellPadding: 8,
                fontSize: 9,
                headerFontSize: 10
            };
            // Draw professional table with borders
            drawProfessionalTable(doc, data, columns, columnWidths, startY, tableStyle);
            // Finalize the PDF and end the response
            doc.end();
            resolve();
        }
        catch (error) {
            console.error('Error generating PDF:', error);
            reject(error);
        }
    });
};
exports.generatePdf = generatePdf;
// Helper function to get column definitions based on report type
function getColumnsForReport(reportType) {
    switch (reportType) {
        case 'ticket-summary':
            return [
                { header: 'Ticket ID', key: 'id', width: 15 },
                { header: 'Title', key: 'title', width: 40 },
                { header: 'Status', key: 'status', width: 20, cellStyle: (value) => ({
                        color: STATUS_COLORS[value] || COLORS.dark
                    }) },
                { header: 'Priority', key: 'priority', width: 15, cellStyle: (value) => ({
                        color: PRIORITY_COLORS[value] || COLORS.dark
                    }) },
                { header: 'Created At', key: 'createdAt', width: 30, format: (date) => (0, date_fns_1.format)(new Date(date), 'yyyy-MM-dd HH:mm') },
                { header: 'Customer', key: 'customer.companyName', width: 40 },
                { header: 'Assigned To', key: 'assignedTo.name', width: 30 },
                { header: 'Zone', key: 'zone.name', width: 30 }
            ];
        case 'customer-satisfaction':
            return [
                { header: 'Feedback ID', key: 'id', width: 20 },
                { header: 'Rating', key: 'rating', width: 15, cellStyle: (value) => ({
                        color: value >= 4 ? COLORS.success : value <= 2 ? COLORS.danger : COLORS.warning
                    }) },
                { header: 'Comments', key: 'comment', width: 60 },
                { header: 'Date', key: 'submittedAt', width: 30, format: (date) => (0, date_fns_1.format)(new Date(date), 'yyyy-MM-dd HH:mm') },
                { header: 'Ticket ID', key: 'ticket.id', width: 15 },
                { header: 'Customer', key: 'ticket.customer.companyName', width: 40 }
            ];
        case 'zone-performance':
            return [
                { header: 'Zone', key: 'zoneName', width: 40 },
                { header: 'Total Tickets', key: 'totalTickets', width: 20, align: 'right' },
                { header: 'Resolved', key: 'resolvedTickets', width: 20, align: 'right' },
                { header: 'Open', key: 'openTickets', width: 15, align: 'right' },
                { header: 'Resolution Rate (%)', key: 'resolutionRate', width: 25, align: 'right', format: (value) => `${value.toFixed(1)}%` },
                { header: 'Avg Resolution (min)', key: 'averageResolutionTime', width: 25, align: 'right' },
                { header: 'Customers', key: 'customerCount', width: 20, align: 'right' }
            ];
        case 'agent-productivity':
            return [
                { header: 'Agent', key: 'agentName', width: 40 },
                { header: 'Email', key: 'email', width: 40 },
                { header: 'Total Tickets', key: 'totalTickets', width: 20, align: 'right' },
                { header: 'Resolved', key: 'resolvedTickets', width: 20, align: 'right' },
                { header: 'Resolution Rate (%)', key: 'resolutionRate', width: 25, align: 'right', format: (value) => `${value.toFixed(1)}%` },
                { header: 'Avg Resolution (min)', key: 'averageResolutionTime', width: 25, align: 'right' },
                { header: 'Zones', key: 'zones', width: 30, format: (zones) => Array.isArray(zones) ? zones.join(', ') : zones }
            ];
        case 'industrial-data':
            return [
                { header: 'Machine ID', key: 'machineId', width: 25 },
                { header: 'Model', key: 'model', width: 30 },
                { header: 'Customer', key: 'customer', width: 40 },
                { header: 'Zone', key: 'zone', width: 25 },
                { header: 'Issue', key: 'ticketTitle', width: 50 },
                { header: 'Status', key: 'status', width: 20 },
                { header: 'Downtime (min)', key: 'downtimeMinutes', width: 25, align: 'right' },
                { header: 'Assigned To', key: 'assignedTo', width: 30 }
            ];
        case 'executive-summary':
            return [
                { header: 'KPI Category', key: 'category', width: 40 },
                { header: 'Metric', key: 'metric', width: 40 },
                { header: 'Current Value', key: 'value', width: 25, align: 'right' },
                { header: 'Target', key: 'target', width: 25, align: 'right' },
                { header: 'Performance', key: 'performance', width: 20, align: 'center' },
                { header: 'Trend', key: 'trend', width: 20, align: 'center' }
            ];
        default:
            return [];
    }
}
// Define color constants for PDF styling
const STATUS_COLORS = {
    OPEN: '#3B82F6',
    IN_PROGRESS: '#F59E0B',
    RESOLVED: '#10B981',
    CLOSED: '#6B7280',
    CANCELLED: '#9CA3AF',
    ASSIGNED: '#8B5CF6',
    PENDING: '#F97316'
};
const PRIORITY_COLORS = {
    LOW: '#10B981',
    MEDIUM: '#F59E0B',
    HIGH: '#EF4444',
    CRITICAL: '#7C3AED'
};
