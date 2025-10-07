import { Response } from 'express';
import { format } from 'date-fns';
import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

export interface ColumnDefinition {
  key: string;
  header: string;
  format?: (value: any, item?: any) => string | number;
  dataType?: 'text' | 'number' | 'date' | 'currency' | 'percentage';
  width?: number;
}

export interface ExcelStyle {
  headerBg?: string;
  headerFont?: string;
  alternateRowBg?: string;
  fontSize?: number;
  wrapText?: boolean;
}

export interface ExcelOptions {
  enableFreezePanes?: boolean;
  enableAutoFilter?: boolean;
  enableConditionalFormatting?: boolean;
  maxRowsPerSheet?: number;
  showLogo?: boolean;
  logoPosition?: 'left' | 'right' | 'center';
  removeEmojis?: boolean;
  worksheetName?: string;
}

// Helper function to format cell values based on data type
function formatExcelValue(value: any, column: ColumnDefinition, item?: any): any {
  if (value === null || value === undefined) return '';
  
  // Apply custom formatter first if provided
  if (column.format) {
    try {
      return column.format(value, item);
    } catch (e) {
      console.warn(`Error formatting value for column ${column.key}:`, e);
    }
  }
  
  // Apply Excel-specific formatting based on data type
  switch (column.dataType) {
    case 'number':
      const numValue = Number(value);
      return isNaN(numValue) ? value : numValue;
    case 'currency':
      const currValue = Number(value);
      return isNaN(currValue) ? value : currValue;
    case 'percentage':
      const pctValue = Number(value);
      return isNaN(pctValue) ? value : pctValue / 100; // Excel expects decimal for percentage
    case 'date':
      if (value instanceof Date) return value;
      if (typeof value === 'string' && !isNaN(Date.parse(value))) {
        return new Date(value);
      }
      return value;
    default:
      return String(value);
  }
}

// Helper function to get nested object values
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return current[key];
    }
    return '';
  }, obj);
}

// Main function to generate Excel file
export const generateExcel = async (
  res: Response,
  data: any[],
  columns: ColumnDefinition[],
  title: string,
  filters: { [key: string]: any },
  summaryData?: any,
  style?: ExcelStyle,
  options?: ExcelOptions
): Promise<void> => {
  try {
    // Set default options
    const defaultOptions: ExcelOptions = {
      enableFreezePanes: true,
      enableAutoFilter: true,
      enableConditionalFormatting: true,
      maxRowsPerSheet: 1000000,
      showLogo: true,
      logoPosition: 'right',
      removeEmojis: true,
      worksheetName: 'Report Data',
      ...options
    };

    // Create a new workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(defaultOptions.worksheetName!);

    // Set default styles
    const defaultStyle: ExcelStyle = {
      headerBg: '4F81BD',
      headerFont: 'FFFFFF',
      alternateRowBg: 'F2F2F2',
      fontSize: 11,
      wrapText: true,
      ...style
    };

    let currentRow = 1;

    // Enhanced header with logo and professional branding
    if (defaultOptions.showLogo) {
      try {
        const logoPath = path.join(__dirname, '../../../frontend/public/kardex.png');
        if (fs.existsSync(logoPath)) {
          const logoImageId = workbook.addImage({
            filename: logoPath,
            extension: 'png',
          });
          
          // Dynamic logo positioning based on configuration
          let logoCol = 8; // default center-right
          if (defaultOptions.logoPosition === 'left') {
            logoCol = 0;
          } else if (defaultOptions.logoPosition === 'center') {
            logoCol = Math.max(Math.floor(columns.length / 2) - 1, 4);
          } else { // right
            logoCol = Math.max(columns.length - 2, 8);
          }
          
          worksheet.addImage(logoImageId, {
            tl: { col: logoCol, row: 0 },
            ext: { width: 100, height: 50 }, // Optimized size
            editAs: 'oneCell'
          });
        }
      } catch (error) {
        console.warn('Could not load logo for Excel:', error);
      }
    }

    // Set optimal row heights for professional layout
    worksheet.getRow(1).height = 35;
    worksheet.getRow(2).height = 25;
    worksheet.getRow(3).height = 20;
    worksheet.getRow(4).height = 18;
    worksheet.getRow(5).height = 15;

    // Create professional header layout
    currentRow = 1;
    
    // Main title positioned on LEFT (logo now on right)
    const titleCell = worksheet.getCell(`A${currentRow}`);
    titleCell.value = title.toUpperCase();
    titleCell.font = { 
      size: 22, 
      bold: true, 
      color: { argb: '1F4E79' },
      name: 'Calibri'
    };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(64 + Math.min(columns.length - 2, 8))}${currentRow}`);
    currentRow++;

    // Company branding line
    const brandCell = worksheet.getCell(`A${currentRow}`);
    brandCell.value = 'KARDEX REMSTAR';
    brandCell.font = { 
      size: 12, 
      bold: true, 
      color: { argb: '2E7D32' },
      name: 'Calibri'
    };
    brandCell.alignment = { horizontal: 'left', vertical: 'middle' };
    worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(64 + Math.min(columns.length - 2, 6))}${currentRow}`);
    currentRow++;

    // Generation timestamp
    const dateCell = worksheet.getCell(`C${currentRow}`);
    dateCell.value = `Generated: ${format(new Date(), 'MMM dd, yyyy | HH:mm:ss')}`;
    dateCell.font = { 
      size: 9, 
      color: { argb: '64748B' },
      name: 'Calibri'
    };
    dateCell.alignment = { horizontal: 'left', vertical: 'middle' };
    currentRow++;

    // Professional report metadata section
    if (filters.from && filters.to) {
      const rangeCell = worksheet.getCell(`A${currentRow}`);
      const periodPrefix = defaultOptions.removeEmojis ? 'Report Period:' : '📅 Report Period:';
      rangeCell.value = `${periodPrefix} ${format(new Date(filters.from), 'MMM dd, yyyy')} to ${format(new Date(filters.to), 'MMM dd, yyyy')}`;
      rangeCell.font = { 
        size: 10, 
        bold: true, 
        color: { argb: '1565C0' },
        name: 'Calibri'
      };
      rangeCell.alignment = { horizontal: 'left', vertical: 'middle' };
      currentRow++;
    }

    // Enhanced active filters display
    const activeFilters = Object.entries(filters)
      .filter(([key, value]) => !['from', 'to', 'format', 'reportType'].includes(key) && value)
      .map(([key, value]) => `${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}: ${value}`);
    
    if (activeFilters.length > 0) {
      const filtersCell = worksheet.getCell(`A${currentRow}`);
      const filterPrefix = defaultOptions.removeEmojis ? 'Applied Filters:' : '🔍 Applied Filters:';
      filtersCell.value = `${filterPrefix} ${activeFilters.join(' | ')}`;
      filtersCell.font = { 
        size: 10, 
        color: { argb: '5D4037' },
        name: 'Calibri'
      };
      filtersCell.alignment = { horizontal: 'left', vertical: 'middle' };
      currentRow++;
    }

    currentRow += 2; // Add spacing

    // Skip executive summary for ticket analytics reports and industrial-data reports
    // Executive summary removed as per user requirements for machine reports

    // Professional data section header
    const dataTitle = worksheet.getCell(`A${currentRow}`);
    const dataTitleText = defaultOptions.removeEmojis ? 'DETAILED REPORT DATA' : '📊 DETAILED REPORT DATA';
    dataTitle.value = dataTitleText;
    dataTitle.font = { 
      size: 16, 
      bold: true, 
      color: { argb: '1F4E79' },
      name: 'Calibri'
    };
    dataTitle.alignment = { horizontal: 'left', vertical: 'middle' };
    
    // Add background color to data title
    dataTitle.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'E3F2FD' }
    };
    
    // Add border to data title
    dataTitle.border = {
      bottom: { style: 'thick', color: { argb: '1F4E79' } }
    };
    
    currentRow++;

    const recordCount = worksheet.getCell(`A${currentRow}`);
    const recordPrefix = defaultOptions.removeEmojis ? 'Total Records:' : '📈 Total Records:';
    recordCount.value = `${recordPrefix} ${data.length} | Export Format: Excel (.xlsx)`;
    recordCount.font = { 
      size: 10, 
      bold: true, 
      color: { argb: '2E7D32' },
      name: 'Calibri'
    };
    recordCount.alignment = { horizontal: 'left', vertical: 'middle' };
    currentRow += 2;

    // Create data table headers
    const headerRowIndex = currentRow;
    const headerRow = worksheet.getRow(currentRow);
    columns.forEach((column, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = column.header;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: defaultStyle.headerBg }
      };
      cell.font = { 
        bold: true, 
        color: { argb: defaultStyle.headerFont },
        size: defaultStyle.fontSize 
      };
      cell.alignment = { 
        horizontal: 'center', 
        vertical: 'middle',
        wrapText: defaultStyle.wrapText 
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      
      // Set column width
      worksheet.getColumn(index + 1).width = column.width || 15;
    });
    
    currentRow++;

    // Add data rows with enhanced features
    const dataStartRow = currentRow;
    data.forEach((item, rowIndex) => {
      const dataRow = worksheet.getRow(currentRow + rowIndex);
      
      columns.forEach((column, colIndex) => {
        const cell = dataRow.getCell(colIndex + 1);
        const rawValue = getNestedValue(item, column.key);
        const formattedValue = formatExcelValue(rawValue, column, item);
        
        cell.value = formattedValue;
        
        // Apply data type specific formatting
        switch (column.dataType) {
          case 'currency':
            cell.numFmt = '$#,##0.00';
            break;
          case 'percentage':
            cell.numFmt = '0.00%';
            break;
          case 'date':
            cell.numFmt = 'yyyy-mm-dd hh:mm';
            break;
          case 'number':
            cell.numFmt = '#,##0.00';
            break;
        }
        
        // Add borders
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        
        // Alternate row coloring
        if (rowIndex % 2 === 1) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: defaultStyle.alternateRowBg }
          };
        }
        
        // Text alignment
        cell.alignment = { 
          vertical: 'middle',
          wrapText: defaultStyle.wrapText 
        };
      });
    });

    // Add advanced Excel features
    const dataEndRow = currentRow + data.length - 1;
    
    // Add freeze panes for header rows
    if (defaultOptions.enableFreezePanes && data.length > 0) {
      worksheet.views = [{
        state: 'frozen',
        xSplit: 0,
        ySplit: headerRowIndex
      }];
    }
    
    // Add auto-filter to data columns
    if (defaultOptions.enableAutoFilter && data.length > 0) {
      const lastColumn = String.fromCharCode(64 + columns.length);
      worksheet.autoFilter = `A${headerRowIndex}:${lastColumn}${dataEndRow}`;
    }
    
    // Add conditional formatting for performance metrics
    if (defaultOptions.enableConditionalFormatting) {
      columns.forEach((column, colIndex) => {
        if (column.header.toLowerCase().includes('rate') || 
            column.header.toLowerCase().includes('score') ||
            column.header.toLowerCase().includes('percentage')) {
          const columnLetter = String.fromCharCode(65 + colIndex);
          const range = `${columnLetter}${dataStartRow}:${columnLetter}${dataEndRow}`;
          
          // Add simple data bars for performance metrics
          try {
            worksheet.addConditionalFormatting({
              ref: range,
              rules: [{
                type: 'dataBar',
                priority: 1,
                showValue: true
              }]
            });
          } catch (error) {
            console.warn('Could not add conditional formatting:', error);
          }
        }
      });
    }


    // Set workbook properties
    workbook.creator = 'Kardex Remstar Professional Suite';
    workbook.lastModifiedBy = 'Kardex Remstar Excel Generator';
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.lastPrinted = new Date();
    
    // Set response headers
    const timestamp_filename = format(new Date(), 'yyyy-MM-dd_HHmm');
    const sanitizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const filename = `kardex-remstar-${sanitizedTitle}-${timestamp_filename}.xlsx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Write the Excel file to response
    await workbook.xlsx.write(res);
    res.end();
    
  } catch (error) {
    console.error('Error generating Excel file:', error);
    
    // Check if headers have already been sent
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to generate Excel report',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    } else {
      // Headers already sent, just end the response
      res.end();
    }
  }
};

// Enhanced column definitions with data types for better Excel compatibility
export const getExcelColumns = (reportType: string): ColumnDefinition[] => {
  switch (reportType) {
    case 'ticket-summary':
      return [
        { key: 'id', header: 'Ticket ID', dataType: 'text', width: 12 },
        { key: 'title', header: 'Title', dataType: 'text', width: 30 },
        { key: 'customer.companyName', header: 'Customer Name', dataType: 'text', width: 25 },
        { key: 'asset.serialNo', header: 'Machine Serial No', dataType: 'text', width: 18 },
        { key: 'customer.address', header: 'Place (Address)', dataType: 'text', width: 30 },
        { key: 'status', header: 'Status', dataType: 'text', width: 15 },
        { key: 'priority', header: 'Priority', dataType: 'text', width: 12 },
        { key: 'assignedTo.name', header: 'Assigned To', dataType: 'text', width: 20 },
        { key: 'createdAt', header: 'Ticket Date and Time', dataType: 'date', width: 20 },
        { key: 'callType', header: 'Call Type', dataType: 'text', width: 20, format: (value) => {
          if (!value) return 'N/A';
          return value === 'UNDER_MAINTENANCE_CONTRACT' ? 'Under Contract' : 'Not Under Contract';
        }},
        { key: 'title', header: 'Error (Ticket Title)', dataType: 'text', width: 30 },
        { key: 'zone.name', header: 'Service Zone', dataType: 'text', width: 20 },
        { key: 'responseTime', header: 'Response Time (Business Hours)', dataType: 'text', width: 25, format: (value) => value ? `${Math.floor(value / 60)}h ${value % 60}m` : 'N/A' },
        { key: 'travelTime', header: 'Travel Time (Real-time)', dataType: 'text', width: 22, format: (value) => (value !== null && value !== undefined) ? `${Math.floor(value / 60)}h ${value % 60}m` : 'N/A' },
        { key: 'onsiteWorkingTime', header: 'Onsite Time (Business Hours)', dataType: 'text', width: 28, format: (value) => (value !== null && value !== undefined) ? `${Math.floor(value / 60)}h ${value % 60}m` : 'N/A' },
        { key: 'totalResolutionTime', header: 'Total Resolution Time (Business Hours)', dataType: 'text', width: 32, format: (value) => value ? `${Math.floor(value / 60)}h ${value % 60}m` : 'N/A' },
        { key: 'reportsCount', header: 'Reports', dataType: 'number', width: 10 },
        { key: 'machineDowntime', header: 'Machine Downtime (Business Hours)', dataType: 'text', width: 30, format: (value) => value ? `${Math.floor(value / 60)}h ${value % 60}m` : 'N/A' },
        { key: 'totalResponseHours', header: 'Total Response (Hours from Open to Closed)', dataType: 'number', width: 30, format: (value) => value ? `${value.toFixed(2)} hours` : 'N/A' }
      ];
    
    case 'customer-satisfaction':
      return [
        { key: 'id', header: 'Feedback ID', dataType: 'text', width: 15 },
        { key: 'rating', header: 'Rating', dataType: 'number', width: 10 },
        { key: 'comment', header: 'Customer Comments', dataType: 'text', width: 40 },
        { key: 'ticket.id', header: 'Ticket ID', dataType: 'text', width: 12 },
        { key: 'ticket.customer.companyName', header: 'Customer', dataType: 'text', width: 25 },
        { key: 'submittedAt', header: 'Feedback Date', dataType: 'date', width: 18 }
      ];
    
    case 'industrial-data':
      return [
        { key: 'customer', header: 'Customer', dataType: 'text', width: 25 },
        { key: 'model', header: 'Machine Model', dataType: 'text', width: 20 },
        { key: 'serialNo', header: 'Serial Number', dataType: 'text', width: 18 },
        { key: 'totalDowntimeHours', header: 'Total Downtime (hrs)', dataType: 'number', width: 18 },
        { key: 'avgDowntimeHours', header: 'Avg Downtime (hrs)', dataType: 'number', width: 18 },
        { key: 'incidents', header: 'Total Incidents', dataType: 'number', width: 15 },
        { key: 'openIncidents', header: 'Open Incidents', dataType: 'number', width: 15 },
        { key: 'resolvedIncidents', header: 'Resolved Incidents', dataType: 'number', width: 18 }
      ];
    
    case 'zone-performance':
      return [
        { key: 'zoneName', header: 'Service Zone', dataType: 'text', width: 25 },
        { key: 'totalTickets', header: 'Total Tickets', dataType: 'number', width: 15 },
        { key: 'resolvedTickets', header: 'Resolved Tickets', dataType: 'number', width: 18 },
        { key: 'openTickets', header: 'Open Tickets', dataType: 'number', width: 15 },
        { key: 'resolutionRate', header: 'Resolution Rate', dataType: 'percentage', width: 18 },
        { key: 'averageResolutionTime', header: 'Avg Resolution Time (Min)', dataType: 'number', width: 25 },
        { key: 'servicePersons', header: 'Service Personnel Count', dataType: 'number', width: 25 },
        { key: 'customerCount', header: 'Customer Count', dataType: 'number', width: 18 }
      ];
    
    case 'agent-productivity':
      return [
        { key: 'agentName', header: 'Service Person / Zone User', dataType: 'text', width: 25 },
        { key: 'email', header: 'Email', dataType: 'text', width: 30 },
        { key: 'totalTickets', header: 'Total Tickets', dataType: 'number', width: 15 },
        { key: 'resolvedTickets', header: 'Resolved Tickets', dataType: 'number', width: 18 },
        { key: 'openTickets', header: 'Open Tickets', dataType: 'number', width: 15 },
        { key: 'resolutionRate', header: 'Resolution Rate', dataType: 'percentage', width: 18 },
        { key: 'averageResolutionTime', header: 'Avg Resolution Time (Min)', dataType: 'number', width: 25 },
        { key: 'zones', header: 'Service Zones', dataType: 'text', width: 30, format: (zones) => Array.isArray(zones) ? zones.join(', ') : zones }
      ];
    
    
    case 'service-person-performance':
      return [
        { key: 'name', header: 'Service Person Name', dataType: 'text', width: 25 },
        { key: 'email', header: 'Email Address', dataType: 'text', width: 30 },
        { key: 'zones', header: 'Service Zones', dataType: 'text', width: 25, format: (zones) => Array.isArray(zones) ? zones.join(', ') : zones || 'N/A' },
        { key: 'summary.totalWorkingDays', header: 'Working Days', dataType: 'number', width: 15, format: (value) => value || 0 },
        { key: 'summary.totalHours', header: 'Total Hours', dataType: 'text', width: 18, format: (value) => value ? `${Number(value).toFixed(1)}h` : '0h' },
        { key: 'summary.totalTickets', header: 'Total Tickets', dataType: 'number', width: 15 },
        { key: 'summary.ticketsResolved', header: 'Tickets Resolved', dataType: 'number', width: 18 },
        { key: 'resolutionRate', header: 'Resolution Rate (%)', dataType: 'text', width: 18, format: (value, item) => {
          const total = item?.summary?.totalTickets || 0;
          const resolved = item?.summary?.ticketsResolved || 0;
          return total > 0 ? `${Math.round((resolved / total) * 100)}%` : '0%';
        }},
        { key: 'summary.averageResolutionTimeHours', header: 'Avg Resolution Time', dataType: 'text', width: 20, format: (value) => value && value > 0 ? `${Number(value).toFixed(1)}h` : 'N/A' },
        { key: 'summary.averageTravelTimeHours', header: 'Avg Travel Time', dataType: 'text', width: 18, format: (value) => value && value > 0 ? `${Number(value).toFixed(1)}h` : 'N/A' },
        { key: 'summary.averageOnsiteTimeHours', header: 'Avg Onsite Time', dataType: 'text', width: 18, format: (value) => value && value > 0 ? `${Number(value).toFixed(1)}h` : 'N/A' },
        { key: 'summary.performanceScore', header: 'Performance Score (%)', dataType: 'text', width: 20, format: (value) => value ? `${value}%` : '0%' }
      ];
    
    case 'service-person-attendance':
      return [
        { key: 'name', header: 'Service Person Name', dataType: 'text', width: 25 },
        { key: 'email', header: 'Email Address', dataType: 'text', width: 30 },
        { key: 'zones', header: 'Service Zones', dataType: 'text', width: 25, format: (zones) => Array.isArray(zones) ? zones.join(', ') : zones || 'N/A' },
        { key: 'summary.totalWorkingDays', header: 'Present Days', dataType: 'number', width: 15, format: (value) => value || 0 },
        { key: 'summary.absentDays', header: 'Absent Days', dataType: 'number', width: 15 },
        { key: 'summary.totalHours', header: 'Total Hours', dataType: 'text', width: 18, format: (value) => value ? `${Number(value).toFixed(1)}h` : '0h' },
        { key: 'summary.averageHoursPerDay', header: 'Avg Hours/Day', dataType: 'text', width: 18, format: (value) => value ? `${Number(value).toFixed(1)}h` : '0h' },
        { key: 'summary.totalActivities', header: 'Activities', dataType: 'number', width: 15, format: (value, item) => item?.summary?.totalActivities || item?.summary?.activitiesLogged || 0 },
        { key: 'summary.autoCheckouts', header: 'Auto Checkouts', dataType: 'number', width: 18 }
      ];
    
    case 'her-analysis':
      return [
        { key: 'id', header: 'Ticket ID', dataType: 'text', width: 12 },
        { key: 'title', header: 'Title', dataType: 'text', width: 30 },
        { key: 'customer', header: 'Customer Name', dataType: 'text', width: 25 },
        { key: 'serialNo', header: 'Machine Serial No', dataType: 'text', width: 18 },
        { key: 'address', header: 'Place (Address)', dataType: 'text', width: 30 },
        { key: 'status', header: 'Status', dataType: 'text', width: 15 },
        { key: 'priority', header: 'Priority', dataType: 'text', width: 12 },
        { key: 'assignedTo', header: 'Assigned To', dataType: 'text', width: 20 },
        { key: 'createdAt', header: 'Ticket Date and Time', dataType: 'date', width: 20 },
        { key: 'zone', header: 'Service Zone', dataType: 'text', width: 20 },
        { key: 'herHours', header: 'SLA Business Hours (Allowed)', dataType: 'number', width: 22 },
        { key: 'businessHoursUsed', header: 'Business Hours Used', dataType: 'number', width: 20 },
        { key: 'isHerBreached', header: 'SLA Breached', dataType: 'text', width: 15 },
        { key: 'resolvedAt', header: 'Resolved Date and Time', dataType: 'date', width: 20 }
      ];
    
    default:
      // Fallback to basic columns
      return [
        { key: 'id', header: 'ID', dataType: 'text', width: 12 },
        { key: 'name', header: 'Name', dataType: 'text', width: 25 },
        { key: 'value', header: 'Value', dataType: 'text', width: 20 },
        { key: 'createdAt', header: 'Created Date', dataType: 'date', width: 18 }
      ];
  }
};

// Export the main function for backward compatibility
export default generateExcel;
