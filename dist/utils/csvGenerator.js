"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateExcelCsv = exports.getColumnsForReport = exports.getCsvColumns = exports.generateCsv = void 0;
const date_fns_1 = require("date-fns");
// Helper function to escape CSV values
function escapeCsvValue(value) {
    if (value === null || value === undefined)
        return '';
    // Convert to string
    const str = String(value);
    // Escape quotes and wrap in quotes if needed
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}
// Helper function to format cell values
function formatCellValue(value, formatter) {
    if (formatter)
        return formatter(value);
    if (value === null || value === undefined)
        return '';
    if (value instanceof Date)
        return (0, date_fns_1.format)(value, 'yyyy-MM-dd HH:mm:ss');
    if (typeof value === 'object')
        return JSON.stringify(value);
    return String(value);
}
// Enhanced function to format values based on data type
function formatExcelValue(value, column) {
    if (value === null || value === undefined)
        return '';
    const formattedValue = column.format ? column.format(value) : formatCellValue(value);
    // Apply Excel-specific formatting based on data type
    switch (column.dataType) {
        case 'number':
            return isNaN(Number(value)) ? formattedValue : String(Number(value));
        case 'currency':
            const numValue = Number(value);
            return isNaN(numValue) ? formattedValue : `$${numValue.toFixed(2)}`;
        case 'percentage':
            const pctValue = Number(value);
            return isNaN(pctValue) ? formattedValue : `${pctValue.toFixed(1)}%`;
        case 'date':
            if (value instanceof Date || !isNaN(Date.parse(value))) {
                return (0, date_fns_1.format)(new Date(value), 'yyyy-MM-dd HH:mm');
            }
            return formattedValue;
        default:
            return formattedValue;
    }
}
// Main function to generate Excel-compatible CSV with enhanced formatting
const generateCsv = (res, data, columns, title, filters, summaryData) => {
    try {
        // Add BOM for Excel UTF-8 compatibility
        let csvContent = '\uFEFF';
        // Enhanced header section with better formatting
        csvContent += `"${title.toUpperCase()}"\n`;
        csvContent += `"KardexCare Service Management System"\n`;
        csvContent += `"Generated: ${(0, date_fns_1.format)(new Date(), 'yyyy-MM-dd HH:mm:ss')}"\n`;
        // Date range with better formatting
        if (filters.from && filters.to) {
            csvContent += `"Report Period: ${(0, date_fns_1.format)(new Date(filters.from), 'MMM dd, yyyy')} to ${(0, date_fns_1.format)(new Date(filters.to), 'MMM dd, yyyy')}"\n`;
        }
        // Enhanced filter display
        const activeFilters = Object.entries(filters)
            .filter(([key, value]) => !['from', 'to', 'format', 'reportType'].includes(key) && value)
            .map(([key, value]) => `${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}: ${value}`);
        if (activeFilters.length > 0) {
            csvContent += `"Applied Filters: ${activeFilters.join(' | ')}"\n`;
        }
        csvContent += '\n'; // Separator line
        // Enhanced summary section with better structure
        if (summaryData && Object.keys(summaryData).length > 0) {
            csvContent += '"=== EXECUTIVE SUMMARY ==="\n';
            csvContent += '"Metric","Value"\n';
            for (const [key, value] of Object.entries(summaryData)) {
                const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                const formattedValue = typeof value === 'number' ?
                    (value % 1 === 0 ? value.toString() : value.toFixed(2)) :
                    String(value);
                csvContent += `"${formattedKey}","${formattedValue}"\n`;
            }
            csvContent += '\n'; // Separator line
        }
        // Enhanced data section with professional headers
        csvContent += '"=== DETAILED REPORT DATA ==="\n';
        csvContent += `"Total Records: ${data.length}"\n`;
        csvContent += '\n';
        // Create enhanced CSV header row with data type hints for Excel
        const headers = columns.map(col => {
            let header = col.header;
            // Add data type hints in parentheses for Excel recognition
            switch (col.dataType) {
                case 'currency':
                    header += ' ($)';
                    break;
                case 'percentage':
                    header += ' (%)';
                    break;
                case 'date':
                    header += ' (Date)';
                    break;
                case 'number':
                    header += ' (#)';
                    break;
            }
            return escapeCsvValue(header);
        });
        csvContent += headers.join(',') + '\n';
        // Add data rows with enhanced Excel-compatible formatting
        for (const item of data) {
            const row = columns.map(col => {
                // Get nested values with improved path resolution
                const value = getNestedValue(item, col.key);
                const formattedValue = formatExcelValue(value, col);
                return escapeCsvValue(formattedValue);
            });
            csvContent += row.join(',') + '\n';
        }
        // Enhanced footer section
        csvContent += '\n';
        csvContent += '"=== REPORT SUMMARY ==="\n';
        csvContent += `"Total Records Exported: ${data.length}"\n`;
        csvContent += `"Export Timestamp: ${(0, date_fns_1.format)(new Date(), 'yyyy-MM-dd HH:mm:ss')}"\n`;
        csvContent += `"System: KardexCare v2.0"\n`;
        csvContent += '"For technical support, contact: support@kardexcare.com"\n';
        // Set enhanced response headers for better Excel compatibility
        const timestamp = (0, date_fns_1.format)(new Date(), 'yyyy-MM-dd_HHmm');
        const sanitizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
        const filename = `kardexcare-${sanitizedTitle}-${timestamp}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // Send the enhanced CSV response
        res.send(csvContent);
    }
    catch (error) {
        console.error('Error generating enhanced CSV:', error);
        res.status(500).json({
            error: 'Failed to generate CSV report',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.generateCsv = generateCsv;
// Enhanced column definitions with data types for better Excel compatibility
const getCsvColumns = (reportType) => {
    switch (reportType) {
        case 'ticket-summary':
            return [
                { key: 'id', header: 'Ticket ID', dataType: 'text' },
                { key: 'title', header: 'Title', dataType: 'text' },
                { key: 'status', header: 'Status', dataType: 'text' },
                { key: 'priority', header: 'Priority', dataType: 'text' },
                { key: 'customer.companyName', header: 'Customer', dataType: 'text' },
                { key: 'assignedTo.name', header: 'Assigned To', dataType: 'text' },
                { key: 'zone.name', header: 'Service Zone', dataType: 'text' },
                { key: 'createdAt', header: 'Created Date', dataType: 'date', format: (date) => (0, date_fns_1.format)(new Date(date), 'yyyy-MM-dd HH:mm') },
                { key: 'updatedAt', header: 'Last Updated', dataType: 'date', format: (date) => (0, date_fns_1.format)(new Date(date), 'yyyy-MM-dd HH:mm') }
            ];
        case 'customer-satisfaction':
            return [
                { key: 'id', header: 'Feedback ID', dataType: 'text' },
                { key: 'rating', header: 'Rating', dataType: 'number' },
                { key: 'comment', header: 'Customer Comments', dataType: 'text' },
                { key: 'ticket.id', header: 'Ticket ID', dataType: 'text' },
                { key: 'ticket.customer.companyName', header: 'Customer', dataType: 'text' },
                { key: 'submittedAt', header: 'Feedback Date', dataType: 'date', format: (date) => (0, date_fns_1.format)(new Date(date), 'yyyy-MM-dd HH:mm') }
            ];
        case 'industrial-data':
            return [
                { key: 'machineId', header: 'Machine ID', dataType: 'text' },
                { key: 'model', header: 'Machine Model', dataType: 'text' },
                { key: 'serialNo', header: 'Serial Number', dataType: 'text' },
                { key: 'customer', header: 'Customer', dataType: 'text' },
                { key: 'zone', header: 'Service Zone', dataType: 'text' },
                { key: 'ticketTitle', header: 'Issue Description', dataType: 'text' },
                { key: 'status', header: 'Status', dataType: 'text' },
                { key: 'priority', header: 'Priority', dataType: 'text' },
                { key: 'downtimeMinutes', header: 'Downtime', dataType: 'number' },
                { key: 'assignedTo', header: 'Assigned Technician', dataType: 'text' },
                { key: 'createdAt', header: 'Issue Reported', dataType: 'date', format: (date) => (0, date_fns_1.format)(new Date(date), 'yyyy-MM-dd HH:mm') }
            ];
        case 'zone-performance':
            return [
                { key: 'zoneName', header: 'Service Zone', dataType: 'text' },
                { key: 'totalTickets', header: 'Total Tickets', dataType: 'number' },
                { key: 'resolvedTickets', header: 'Resolved Tickets', dataType: 'number' },
                { key: 'openTickets', header: 'Open Tickets', dataType: 'number' },
                { key: 'resolutionRate', header: 'Resolution Rate', dataType: 'percentage' },
                { key: 'averageResolutionTime', header: 'Avg Resolution Time', dataType: 'number' },
                { key: 'servicePersons', header: 'Service Personnel Count', dataType: 'number' },
                { key: 'customerCount', header: 'Customer Count', dataType: 'number' }
            ];
        case 'agent-productivity':
            return [
                { key: 'agentName', header: 'Agent Name', dataType: 'text' },
                { key: 'email', header: 'Email', dataType: 'text' },
                { key: 'totalTickets', header: 'Total Tickets', dataType: 'number' },
                { key: 'resolvedTickets', header: 'Resolved Tickets', dataType: 'number' },
                { key: 'openTickets', header: 'Open Tickets', dataType: 'number' },
                { key: 'resolutionRate', header: 'Resolution Rate', dataType: 'percentage' },
                { key: 'averageResolutionTime', header: 'Avg Resolution Time', dataType: 'number' },
                { key: 'zones', header: 'Service Zones', dataType: 'text', format: (zones) => Array.isArray(zones) ? zones.join(', ') : zones }
            ];
        case 'executive-summary':
            return [
                { key: 'metric', header: 'Key Performance Indicator', dataType: 'text' },
                { key: 'value', header: 'Current Value', dataType: 'number' },
                { key: 'trend', header: 'Trend', dataType: 'text' },
                { key: 'target', header: 'Target', dataType: 'number' },
                { key: 'status', header: 'Status', dataType: 'text' }
            ];
        default:
            return (0, pdfGenerator_1.getColumnsForReport)(reportType).map(({ key, header, format }) => ({
                key,
                header,
                format
            }));
    }
};
exports.getCsvColumns = getCsvColumns;
// Re-export the getColumnsForReport from pdfGenerator
const pdfGenerator_1 = require("./pdfGenerator");
Object.defineProperty(exports, "getColumnsForReport", { enumerable: true, get: function () { return pdfGenerator_1.getColumnsForReport; } });
// Enhanced helper function to get nested object values (moved up to be available)
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
        if (current && typeof current === 'object' && key in current) {
            return current[key];
        }
        return '';
    }, obj);
}
// Export enhanced CSV generation function for Excel compatibility
exports.generateExcelCsv = exports.generateCsv;
