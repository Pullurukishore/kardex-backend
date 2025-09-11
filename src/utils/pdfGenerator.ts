import { Response } from 'express';
import PDFDocument from 'pdfkit';
import { format } from 'date-fns';

// Define types
export interface ColumnDefinition {
  key: string;
  header: string;
  width?: number;
  format?: (value: any) => string;
  align?: 'left' | 'center' | 'right';
  cellStyle?: (value: any) => { bold?: boolean; color?: string; fill?: string };
}

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
function calculateColumnWidths(columns: ColumnDefinition[], availableWidth: number): number[] {
  const totalDefinedWidth = columns.reduce((sum, col) => sum + (col.width || 0), 0);
  const remainingWidth = availableWidth - totalDefinedWidth;
  const autoWidthColumns = columns.filter(col => !col.width);
  const autoWidth = autoWidthColumns.length > 0 ? remainingWidth / autoWidthColumns.length : 0;
  
  return columns.map(col => col.width || autoWidth);
}

// Helper function to format cell values
function formatCellValue(value: any, formatter?: (val: any) => string): string {
  if (formatter) return formatter(value);
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return format(value, 'yyyy-MM-dd HH:mm:ss');
  return String(value);
}

// Main function to generate PDF
export const generatePdf = (
  res: Response,
  data: any[],
  columns: ColumnDefinition[],
  title: string,
  filters: { [key: string]: any },
  summaryData?: any
): Promise<void> => {
  // Helper function to add summary section
  function addSummarySection(doc: PDFKit.PDFDocument, summaryData: any, currentY: number): number {
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
      } else {
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
        .text(
          String(key).split(/(?=[A-Z])/).join(' ').replace(/^./, str => str.toUpperCase()),
          currentX + 10,
          currentY + 10,
          { width: columnWidth - 20 }
        );
      
      // Add metric value
      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .fillColor(COLORS.primary)
        .text(
          String(value),
          currentX + 10,
          currentY + 30,
          { width: columnWidth - 20 }
        );
      
      rowHeight = Math.max(rowHeight, metricHeight);
    });
    
    // Return the new Y position after the summary section
    return currentY + (rowHeight > 0 ? rowHeight + 20 : 0);
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
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
      
      // Add table headers with styling
      const startY = 100;
      const columnWidths = calculateColumnWidths(columns, doc.page.width - 100);
      let currentX = 50;
      
      // Draw header background
      doc
        .rect(50, startY - 10, doc.page.width - 100, 25)
        .fill(COLORS.primary)
        .fillOpacity(0.1);
      
      // Add column headers
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.primary);
      columns.forEach((column, i) => {
        doc.text(
          column.header,
          currentX + 5,
          startY,
          {
            width: columnWidths[i],
            align: column.align || 'left',
            lineGap: 5,
            ellipsis: true
          }
        );
        currentX += columnWidths[i];
      });
      
      // Draw line under headers
      doc
        .moveTo(50, startY + 20)
        .lineTo(doc.page.width - 50, startY + 20)
        .lineWidth(2)
        .stroke(COLORS.primary);
      
      // Add table rows
      let currentY = startY + 30;
      
      data.forEach((row, rowIndex) => {
        // Check if we need a new page
        if (currentY > doc.page.height - 50) {
          doc.addPage();
          currentY = 50;
          
          // Add table header on new page
          doc
            .fontSize(14)
            .font('Helvetica-Bold')
            .fillColor(COLORS.darkGray)
            .text('Report Data (Continued)', 50, currentY);
          
          currentY += 50;
        }
        
        // Add a light gray background to alternate rows for better readability
        if (rowIndex % 2 === 0) {
          doc
            .rect(50, currentY - 8, doc.page.width - 100, 20)
            .fill(COLORS.lightGray)
            .fillOpacity(0.5);
        }
        
        // Add row cells
        currentX = 50;
        columns.forEach((column, colIndex) => {
          const cellValue = formatCellValue(row[column.key], column.format);
          const cellStyle = column.cellStyle ? column.cellStyle(row[column.key]) : {};
          
          doc
            .font(cellStyle.bold ? 'Helvetica-Bold' : 'Helvetica')
            .fillColor(cellStyle.color || COLORS.dark);
            
          doc.text(
            cellValue,
            currentX + 5,
            currentY,
            {
              width: columnWidths[colIndex],
              align: column.align || 'left',
              lineGap: 5,
              ellipsis: true
            }
          );
          
          currentX += columnWidths[colIndex];
        });
        
        // Add bottom border to row
        doc
          .moveTo(50, currentY + 12)
          .lineTo(doc.page.width - 50, currentY + 12)
          .lineWidth(0.5)
          .stroke(COLORS.secondary);
          
        // Add a subtle opacity for the stroke
        doc.opacity(0.2);
        doc.stroke();
        doc.opacity(1);
        
        currentY += 20;
      })
      
      // Finalize the PDF and end the response
      doc.end();
      resolve();
    } catch (error) {
      console.error('Error generating PDF:', error);
      reject(error);
    }
  });
};

// Helper function to get column definitions based on report type
export function getColumnsForReport(reportType: string): ColumnDefinition[] {
  switch (reportType) {
    case 'ticket-summary':
      return [
        { header: 'Ticket ID', key: 'id', width: 15 },
        { header: 'Title', key: 'title', width: 40 },
        { header: 'Status', key: 'status', width: 20, cellStyle: (value) => ({ 
          color: STATUS_COLORS[value as keyof typeof STATUS_COLORS] || COLORS.dark 
        }) },
        { header: 'Priority', key: 'priority', width: 15, cellStyle: (value) => ({ 
          color: PRIORITY_COLORS[value as keyof typeof PRIORITY_COLORS] || COLORS.dark 
        }) },
        { header: 'Created At', key: 'createdAt', width: 30, format: (date) => format(new Date(date), 'yyyy-MM-dd HH:mm') },
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
        { header: 'Date', key: 'submittedAt', width: 30, format: (date) => format(new Date(date), 'yyyy-MM-dd HH:mm') },
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
