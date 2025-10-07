import { Response } from 'express';
import { format } from 'date-fns';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

export interface ColumnDefinition {
  key: string;
  header: string;
  format?: (value: any, item?: any) => string;
  dataType?: 'text' | 'number' | 'date' | 'currency' | 'percentage';
  width?: number;
  align?: 'left' | 'center' | 'right';
}

export interface PdfStyle {
  headerBg?: string;
  headerFont?: string;
  alternateRowBg?: string;
  fontSize?: number;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
}

export interface PdfOptions {
  layout?: 'portrait' | 'landscape';
  pageSize?: 'A4' | 'A3' | 'Letter';
  margins?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  showFooter?: boolean;
  maxRowsPerPage?: number;
  enableTextWrapping?: boolean;
}

// Helper function to format cell values based on data type
function formatPdfValue(value: any, column: ColumnDefinition, item?: any): string {
  if (value === null || value === undefined) return '';
  
  // Apply custom formatter first if provided
  if (column.format) {
    try {
      return column.format(value, item);
    } catch (e) {
      console.warn(`Error formatting value for column ${column.key}:`, e);
    }
  }
  
  // Apply PDF-specific formatting based on data type
  switch (column.dataType) {
    case 'number':
      const numValue = Number(value);
      return isNaN(numValue) ? String(value) : numValue.toLocaleString();
    case 'currency':
      const currValue = Number(value);
      return isNaN(currValue) ? String(value) : `$${currValue.toFixed(2)}`;
    case 'percentage':
      const pctValue = Number(value);
      return isNaN(pctValue) ? String(value) : `${pctValue.toFixed(1)}%`;
    case 'date':
      if (value instanceof Date) return format(value, 'MMM dd, yyyy HH:mm');
      if (typeof value === 'string' && !isNaN(Date.parse(value))) {
        return format(new Date(value), 'MMM dd, yyyy HH:mm');
      }
      return String(value);
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

// Helper function to wrap text for PDF cells
function wrapText(doc: PDFKit.PDFDocument, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = doc.widthOfString(testLine);
    
    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Word is too long, break it
        lines.push(word);
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

// Main function to generate PDF file
export const generatePdf = async (
  res: Response,
  data: any[],
  columns: ColumnDefinition[],
  title: string,
  filters: { [key: string]: any },
  summaryData?: any,
  style?: PdfStyle,
  options?: PdfOptions
): Promise<void> => {
  try {
    // Set default options
    const defaultOptions: PdfOptions = {
      layout: 'landscape',
      pageSize: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      showFooter: true,
      maxRowsPerPage: 50,
      enableTextWrapping: true,
      ...options
    };

    // Create a new PDF document with configurable settings
    const doc = new PDFDocument({
      size: defaultOptions.pageSize,
      layout: defaultOptions.layout,
      margins: {
        top: defaultOptions.margins!.top!,
        bottom: defaultOptions.margins!.bottom!,
        left: defaultOptions.margins!.left!,
        right: defaultOptions.margins!.right!
      },
      info: {
        Title: title,
        Author: 'Kardex Remstar Professional Suite',
        Subject: 'Service Analytics Report',
        Keywords: 'kardex, remstar, service, analytics, report',
        Creator: 'Kardex Remstar v2.0',
        Producer: 'Kardex Remstar PDF Generator'
      }
    });

    // Set modern, professional color palette
    const defaultStyle: PdfStyle = {
      headerBg: '#0F172A',      // Deep slate for headers
      headerFont: '#FFFFFF',     // Pure white text
      alternateRowBg: '#F8FAFC', // Light slate for alternate rows
      fontSize: 9,
      primaryColor: '#0F172A',   // Deep slate - primary brand
      secondaryColor: '#0EA5E9', // Sky blue - secondary accent
      accentColor: '#8B5CF6',    // Purple - accent highlights
      ...style
    };

    // Page dimensions based on configuration
    const margins = defaultOptions.margins!;
    const pageWidth = doc.page.width - margins.left! - margins.right!;
    const pageHeight = doc.page.height - margins.top! - margins.bottom!;
    let currentY = margins.top!;

    // Modern gradient-style header background with better height
    doc.rect(0, 0, doc.page.width, 140)
       .fill('#1E293B');
    
    // Enhanced accent gradient bar with smoother transitions
    const gradientWidth = doc.page.width / 6;
    doc.rect(0, 135, gradientWidth, 5).fill('#0EA5E9');
    doc.rect(gradientWidth, 135, gradientWidth, 5).fill('#3B82F6');
    doc.rect(gradientWidth * 2, 135, gradientWidth, 5).fill('#6366F1');
    doc.rect(gradientWidth * 3, 135, gradientWidth, 5).fill('#8B5CF6');
    doc.rect(gradientWidth * 4, 135, gradientWidth, 5).fill('#A855F7');
    doc.rect(gradientWidth * 5, 135, gradientWidth, 5).fill('#EC4899');

    // Enhanced header with logo and professional branding - RIGHT SIDE
    const logoWidth = 100;
    const logoHeight = 50;
    const logoX = pageWidth - logoWidth + margins.left!; // Right side positioning
    const logoY = margins.top! - 10;
    
    try {
      const logoPath = path.join(__dirname, '../../../frontend/public/kardex.png');
      if (fs.existsSync(logoPath)) {
        // Add logo with professional positioning on RIGHT with white background
        doc.roundedRect(logoX - 8, logoY - 4, logoWidth + 16, logoHeight + 8, 6)
           .fill('#FFFFFF')
           .stroke('#E2E8F0');
        doc.image(logoPath, logoX, logoY, { 
          width: logoWidth, 
          height: logoHeight,
          fit: [logoWidth, logoHeight]
        });
      } else {
        // Fallback: Create a modern branded card on RIGHT
        doc.roundedRect(logoX - 8, logoY - 4, logoWidth + 16, logoHeight + 8, 6)
           .fill('#FFFFFF')
           .stroke('#E2E8F0');
        
        doc.fill('#1E293B')
           .fontSize(16)
           .font('Helvetica-Bold')
           .text('KARDEX', logoX + 15, logoY + 8)
           .fill('#0EA5E9')
           .fontSize(14)
           .font('Helvetica-Bold')
           .text('REMSTAR', logoX + 10, logoY + 28);
      }
    } catch (error) {
      console.warn('Could not load logo for PDF:', error);
      // Create fallback modern branded card on RIGHT
      doc.roundedRect(logoX - 8, logoY - 4, logoWidth + 16, logoHeight + 8, 6)
         .fill('#FFFFFF')
         .stroke('#E2E8F0');
      
      doc.fill('#1E293B')
         .fontSize(16)
         .font('Helvetica-Bold')
         .text('KARDEX', logoX + 15, logoY + 8)
         .fill('#0EA5E9')
         .fontSize(14)
         .font('Helvetica-Bold')
         .text('REMSTAR', logoX + 10, logoY + 28);
    }

    // Modern header layout with enhanced typography
    currentY = margins.top! - 10;
    
    // Main title with enhanced styling and better spacing
    doc.fill('#FFFFFF')
       .fontSize(32)
       .font('Helvetica-Bold')
       .text(title.toUpperCase(), margins.left!, currentY, { 
         width: pageWidth - logoWidth - 80,
         lineGap: 5
       });
    
    currentY += 35;
    
    // Company branding with enhanced styling
    doc.fill('#60A5FA')
       .fontSize(14)
       .font('Helvetica-Bold')
       .text('KARDEX REMSTAR', margins.left!, currentY);
    
    currentY += 22;
    
    // Generation timestamp with enhanced styling
    doc.fill('#CBD5E1')
       .fontSize(10)
       .font('Helvetica')
       .text(`Generated: ${format(new Date(), 'EEEE, MMMM dd, yyyy \'at\' HH:mm:ss')}`, margins.left!, currentY);
    
    currentY += 18;
    
    // Report metadata section with enhanced badge design
    if (filters.from && filters.to) {
      const fromDate = format(new Date(filters.from), 'MMM dd, yyyy');
      const toDate = format(new Date(filters.to), 'MMM dd, yyyy');
      const daysDiff = Math.ceil((new Date(filters.to).getTime() - new Date(filters.from).getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
      // Create a badge-style background
      const badgeWidth = 400;
      doc.roundedRect(margins.left!, currentY - 3, badgeWidth, 18, 9)
         .fill('#EFF6FF')
         .stroke('#DBEAFE');
      
      doc.fill('#1E40AF')
         .fontSize(11)
         .font('Helvetica-Bold')
         .text(`Report Period: ${fromDate} to ${toDate} (${daysDiff} days)`, margins.left! + 8, currentY + 2);
      
      currentY += 20;
    }

    // Enhanced active filters display with badge styling
    const activeFilters = Object.entries(filters)
      .filter(([key, value]) => !['from', 'to', 'format', 'reportType'].includes(key) && value)
      .map(([key, value]) => `${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}: ${value}`);
    
    if (activeFilters.length > 0) {
      const cleanFilterText = `Applied Filters: ${activeFilters.join(' | ')}`;
      const filterBadgeWidth = Math.min(600, doc.widthOfString(cleanFilterText) + 20);
      
      doc.roundedRect(margins.left!, currentY - 3, filterBadgeWidth, 16, 8)
         .fill('#F0F9FF')
         .stroke('#E0F2FE');
      
      doc.fill('#0C4A6E')
         .fontSize(9)
         .font('Helvetica')
         .text(cleanFilterText, margins.left! + 8, currentY + 1);
      
      currentY += 20;
    }

    currentY += 15;

    // Executive Summary Section (skip for ticket analytics and industrial data reports)
    const isTicketAnalyticsReport = title.toLowerCase().includes('ticket') || title.toLowerCase().includes('analytics');
    const isIndustrialDataReport = title.toLowerCase().includes('industrial') || title.toLowerCase().includes('machine');
    
    if (summaryData && Object.keys(summaryData).length > 0 && !isTicketAnalyticsReport && !isIndustrialDataReport) {
      // Modern gradient summary header
      doc.roundedRect(50, currentY - 5, pageWidth, 32, 6)
         .fill('#0F172A');
      
      // Accent bar on left side of header
      doc.roundedRect(50, currentY - 5, 5, 32, 3)
         .fill('#0EA5E9');
      
      doc.fill('#FFFFFF')
         .fontSize(14)
         .font('Helvetica-Bold')
         .text('📊 EXECUTIVE SUMMARY', 65, currentY + 6);
      
      currentY += 42;
      
      // Summary metrics in a modern card grid with shadows
      const summaryEntries = Object.entries(summaryData);
      const itemsPerRow = 3;
      const itemWidth = pageWidth / itemsPerRow;
      
      for (let i = 0; i < summaryEntries.length; i += itemsPerRow) {
        const rowItems = summaryEntries.slice(i, i + itemsPerRow);
        
        rowItems.forEach(([key, value], index) => {
          const x = margins.left! + (index * itemWidth);
          const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
          
          // Create modern metric card with gradient accent
          doc.roundedRect(x + 5, currentY, itemWidth - 15, 48, 6)
             .fill('#FFFFFF')
             .stroke('#E2E8F0');
          
          // Colored accent bar at top of card
          const accentColors = ['#0EA5E9', '#8B5CF6', '#EC4899'];
          doc.roundedRect(x + 5, currentY, itemWidth - 15, 4, 6)
             .fill(accentColors[index % 3]);
          
          // Metric value with modern styling
          doc.fill('#0F172A')
             .fontSize(18)
             .font('Helvetica-Bold')
             .text(String(value), x + 15, currentY + 12, { width: itemWidth - 30, align: 'center' });
          
          // Metric label with lighter color
          doc.fill('#64748B')
             .fontSize(9)
             .font('Helvetica')
             .text(formattedKey, x + 15, currentY + 32, { width: itemWidth - 30, align: 'center' });
        });
        
        currentY += 58;
      }
      
      currentY += 25;
    }

    // Enhanced data section header with better design
    doc.roundedRect(margins.left!, currentY - 8, pageWidth, 38, 8)
       .fill('#1E293B');
    
    // Enhanced accent bar with gradient effect
    doc.roundedRect(margins.left!, currentY - 8, 6, 38, 4)
       .fill('#8B5CF6');
    
    // Add subtle inner glow effect
    doc.roundedRect(margins.left! + 6, currentY - 6, pageWidth - 12, 34, 6)
       .fill('#334155');
    
    doc.fill('#FFFFFF')
       .fontSize(16)
       .font('Helvetica-Bold')
       .text('DETAILED REPORT DATA', margins.left! + 20, currentY + 8);
    
    currentY += 35;
    
    // Enhanced data info with better badges
    doc.roundedRect(margins.left!, currentY - 4, 120, 20, 10)
       .fill('#DBEAFE')
       .stroke('#93C5FD');
    
    doc.fill('#1E40AF')
       .fontSize(11)
       .font('Helvetica-Bold')
       .text(`${data.length} Records`, margins.left! + 8, currentY + 2);
    
    doc.fill('#64748B')
       .fontSize(10)
       .font('Helvetica')
       .text('• PDF Format • Professional Grade', margins.left! + 130, currentY + 3);
    
    currentY += 25;

    // Calculate column widths dynamically
    const availableWidth = pageWidth - 20;
    const totalCustomWidth = columns.reduce((sum, col) => sum + (col.width || 100), 0);
    const scaleFactor = availableWidth / totalCustomWidth;
    
    const columnWidths = columns.map(col => (col.width || 100) * scaleFactor);
    const columnPositions = columnWidths.reduce((positions, width, index) => {
      const prevPosition = index === 0 ? margins.left! : positions[index - 1];
      positions.push(prevPosition + (index === 0 ? 0 : columnWidths[index - 1]));
      return positions;
    }, [] as number[]);

    // Create enhanced table headers with better design
    const headerHeight = 36;
    doc.roundedRect(margins.left!, currentY, pageWidth, headerHeight, 8)
       .fill('#1E293B');
    
    // Enhanced gradient bar with smoother transitions
    const segmentWidth = pageWidth / 6;
    doc.rect(margins.left!, currentY, segmentWidth, 4).fill('#0EA5E9');
    doc.rect(margins.left! + segmentWidth, currentY, segmentWidth, 4).fill('#3B82F6');
    doc.rect(margins.left! + segmentWidth * 2, currentY, segmentWidth, 4).fill('#6366F1');
    doc.rect(margins.left! + segmentWidth * 3, currentY, segmentWidth, 4).fill('#8B5CF6');
    doc.rect(margins.left! + segmentWidth * 4, currentY, segmentWidth, 4).fill('#A855F7');
    doc.rect(margins.left! + segmentWidth * 5, currentY, segmentWidth, 4).fill('#EC4899');
    
    // Add subtle inner shadow
    doc.roundedRect(margins.left!, currentY + 4, pageWidth, headerHeight - 4, 6)
       .fill('#334155');
    
    columns.forEach((column, index) => {
      doc.fill('#FFFFFF')
         .fontSize(defaultStyle.fontSize! + 2)
         .font('Helvetica-Bold')
         .text(
           column.header,
           columnPositions[index] + 8,
           currentY + 14,
           {
             width: columnWidths[index] - 16,
             align: column.align || 'left',
             ellipsis: true
           }
         );
    });
    
    currentY += headerHeight;

    // Add data rows with enhanced styling and text wrapping
    const baseRowHeight = 32;
    
    for (let i = 0; i < data.length; i++) {
      // Calculate row height based on content if text wrapping is enabled
      let rowHeight = baseRowHeight;
      if (defaultOptions.enableTextWrapping) {
        let maxLines = 1;
        columns.forEach((column, colIndex) => {
          const rawValue = getNestedValue(data[i], column.key);
          const formattedValue = formatPdfValue(rawValue, column, data[i]);
          const cellWidth = columnWidths[colIndex] - 12;
          const lines = wrapText(doc, formattedValue, cellWidth);
          maxLines = Math.max(maxLines, lines.length);
        });
        rowHeight = Math.max(baseRowHeight, maxLines * 12 + 16);
      }
      
      // Check if we need a new page - account for footer space (more conservative calculation)
      const footerSpace = defaultOptions.showFooter ? 40 : 15;
      const availableSpace = doc.page.height - margins.bottom! - footerSpace;
      if (currentY + rowHeight > availableSpace) {
        doc.addPage({
          size: defaultOptions.pageSize,
          layout: defaultOptions.layout,
          margins: {
            top: defaultOptions.margins!.top!,
            bottom: defaultOptions.margins!.bottom!,
            left: defaultOptions.margins!.left!,
            right: defaultOptions.margins!.right!
          }
        });
        currentY = margins.top!;
        
        // Repeat modern headers on new page
        doc.roundedRect(margins.left!, currentY, pageWidth, headerHeight, 6)
           .fill(defaultStyle.headerBg!);
        
        // Repeat gradient bar on new page
        const segmentWidth = pageWidth / 3;
        doc.rect(margins.left!, currentY, segmentWidth, 3).fill('#0EA5E9');
        doc.rect(margins.left! + segmentWidth, currentY, segmentWidth, 3).fill('#8B5CF6');
        doc.rect(margins.left! + segmentWidth * 2, currentY, segmentWidth, 3).fill('#EC4899');
        
        columns.forEach((column, index) => {
          doc.fill(defaultStyle.headerFont!)
             .fontSize(defaultStyle.fontSize! + 1)
             .font('Helvetica-Bold')
             .text(
               column.header,
               columnPositions[index] + 5,
               currentY + 10,
               {
                 width: columnWidths[index] - 10,
                 align: column.align || 'left',
                 ellipsis: true
               }
             );
        });
        
        currentY += headerHeight;
      }
      
      const item = data[i];
      const isAlternateRow = i % 2 === 1;
      
      // Enhanced row background with cell-based coloring
      columns.forEach((column, colIndex) => {
        const cellX = columnPositions[colIndex];
        const cellWidth = columnWidths[colIndex];
        
        if (isAlternateRow) {
          doc.rect(cellX, currentY, cellWidth, rowHeight)
             .fill('#F1F5F9')
             .stroke('#E2E8F0');
        } else {
          doc.rect(cellX, currentY, cellWidth, rowHeight)
             .fill('#FFFFFF')
             .stroke('#E5E7EB');
        }
      });
      
      // Enhanced cell data with text wrapping support
      columns.forEach((column, colIndex) => {
        const rawValue = getNestedValue(item, column.key);
        const formattedValue = formatPdfValue(rawValue, column, item);
        
        if (defaultOptions.enableTextWrapping && formattedValue.length > 20) {
          // Use text wrapping for longer content
          const cellWidth = columnWidths[colIndex] - 12;
          const lines = wrapText(doc, formattedValue, cellWidth);
          
          doc.fill('#1E293B')
             .fontSize(defaultStyle.fontSize! + 1)
             .font('Helvetica');
          
          lines.forEach((line, lineIndex) => {
            doc.text(
              line,
              columnPositions[colIndex] + 6,
              currentY + 8 + (lineIndex * 12),
              {
                width: cellWidth,
                align: column.align || 'left'
              }
            );
          });
        } else {
          // Use ellipsis for shorter content
          doc.fill('#1E293B')
             .fontSize(defaultStyle.fontSize! + 1)
             .font('Helvetica')
             .text(
               formattedValue,
               columnPositions[colIndex] + 6,
               currentY + 8,
               {
                 width: columnWidths[colIndex] - 12,
                 align: column.align || 'left',
                 ellipsis: true
               }
             );
        }
      });
      
      currentY += rowHeight;
    }

    // Add professional footer if enabled
    if (defaultOptions.showFooter) {
      const footerY = doc.page.height - margins.bottom! - 30;
      
      // Footer separator line
      doc.moveTo(margins.left!, footerY - 5)
         .lineTo(margins.left! + pageWidth, footerY - 5)
         .stroke('#E2E8F0');
      
      // Left side - Company branding
      doc.fill('#64748B')
         .fontSize(8)
         .font('Helvetica')
         .text('KARDEX REMSTAR', margins.left!, footerY + 5);
      
      doc.fill('#94A3B8')
         .fontSize(7)
         .font('Helvetica')
         .text('Professional Service Analytics', margins.left!, footerY + 15);
      
      // Center - Generation info
      const centerX = margins.left! + pageWidth / 2;
      doc.fill('#64748B')
         .fontSize(7)
         .font('Helvetica')
         .text(`Generated: ${format(new Date(), 'MMM dd, yyyy HH:mm')}`, centerX - 50, footerY + 5);
      
      // Right side - Page numbering
      const rightX = margins.left! + pageWidth - 80;
      doc.fill('#64748B')
         .fontSize(8)
         .font('Helvetica-Bold')
         .text(`Page ${doc.bufferedPageRange().count}`, rightX, footerY + 5);
      
      doc.fill('#94A3B8')
         .fontSize(7)
         .font('Helvetica')
         .text('Confidential', rightX, footerY + 15);
    }

    // Set response headers
    const timestamp_filename = format(new Date(), 'yyyy-MM-dd_HHmm');
    const sanitizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const filename = `kardex-remstar-${sanitizedTitle}-${timestamp_filename}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Pipe the PDF to response
    doc.pipe(res);
    doc.end();
    
  } catch (error) {
    console.error('Error generating PDF file:', error);
    res.status(500).json({ 
      error: 'Failed to generate PDF report',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Enhanced column definitions optimized for PDF layout
export const getPdfColumns = (reportType: string): ColumnDefinition[] => {
  switch (reportType) {
    case 'ticket-summary':
      return [
        { key: 'id', header: 'Ticket ID', dataType: 'text', width: 80, align: 'center' },
        { key: 'title', header: 'Title', dataType: 'text', width: 200, align: 'left' },
        { key: 'customer.companyName', header: 'Customer', dataType: 'text', width: 150, align: 'left' },
        { key: 'asset.serialNo', header: 'Serial No', dataType: 'text', width: 100, align: 'center' },
        { key: 'status', header: 'Status', dataType: 'text', width: 80, align: 'center' },
        { key: 'priority', header: 'Priority', dataType: 'text', width: 70, align: 'center' },
        { key: 'callType', header: 'Call Type', dataType: 'text', width: 120, align: 'center', format: (value) => {
          if (!value) return 'N/A';
          return value === 'UNDER_MAINTENANCE_CONTRACT' ? 'Under Contract' : 'Not Under Contract';
        }},
        { key: 'assignedTo.name', header: 'Assigned To', dataType: 'text', width: 120, align: 'left' },
        { key: 'zone.name', header: 'Zone', dataType: 'text', width: 100, align: 'left' },
        { key: 'createdAt', header: 'Created', dataType: 'date', width: 120, align: 'center' },
        { key: 'responseTime', header: 'Response Time (Business Hours)', dataType: 'text', width: 120, align: 'center', format: (value) => value ? `${Math.floor(value / 60)}h ${value % 60}m` : 'N/A' },
        { key: 'travelTime', header: 'Travel Time (Real-time)', dataType: 'text', width: 120, align: 'center', format: (value) => (value !== null && value !== undefined) ? `${Math.floor(value / 60)}h ${value % 60}m` : 'N/A' },
        { key: 'onsiteWorkingTime', header: 'Onsite Time (Business Hours)', dataType: 'text', width: 120, align: 'center', format: (value) => (value !== null && value !== undefined) ? `${Math.floor(value / 60)}h ${value % 60}m` : 'N/A' },
        { key: 'machineDowntime', header: 'Downtime (Business Hours)', dataType: 'text', width: 120, align: 'center', format: (value) => value ? `${Math.floor(value / 60)}h ${value % 60}m` : 'N/A' }
      ];
    
    case 'customer-satisfaction':
      return [
        { key: 'id', header: 'Feedback ID', dataType: 'text', width: 100, align: 'center' },
        { key: 'rating', header: 'Rating', dataType: 'number', width: 60, align: 'center' },
        { key: 'comment', header: 'Customer Comments', dataType: 'text', width: 300, align: 'left' },
        { key: 'ticket.id', header: 'Ticket ID', dataType: 'text', width: 80, align: 'center' },
        { key: 'ticket.customer.companyName', header: 'Customer', dataType: 'text', width: 150, align: 'left' },
        { key: 'submittedAt', header: 'Feedback Date', dataType: 'date', width: 120, align: 'center' }
      ];
    
    case 'industrial-data':
      return [
        { key: 'customer', header: 'Customer', dataType: 'text', width: 120, align: 'left' },
        { key: 'model', header: 'Machine Model', dataType: 'text', width: 100, align: 'left' },
        { key: 'serialNo', header: 'Serial Number', dataType: 'text', width: 110, align: 'center' },
        { key: 'totalDowntimeHours', header: 'Total Downtime (hrs)', dataType: 'number', width: 100, align: 'center' },
        { key: 'avgDowntimeHours', header: 'Avg Downtime (hrs)', dataType: 'number', width: 100, align: 'center' },
        { key: 'incidents', header: 'Total Incidents', dataType: 'number', width: 80, align: 'center' },
        { key: 'openIncidents', header: 'Open', dataType: 'number', width: 60, align: 'center' },
        { key: 'resolvedIncidents', header: 'Resolved', dataType: 'number', width: 70, align: 'center' }
      ];
    
    case 'zone-performance':
      return [
        { key: 'zoneName', header: 'Service Zone', dataType: 'text', width: 150, align: 'left' },
        { key: 'totalTickets', header: 'Total Tickets', dataType: 'number', width: 100, align: 'center' },
        { key: 'resolvedTickets', header: 'Resolved', dataType: 'number', width: 80, align: 'center' },
        { key: 'openTickets', header: 'Open', dataType: 'number', width: 80, align: 'center' },
        { key: 'resolutionRate', header: 'Resolution Rate', dataType: 'percentage', width: 100, align: 'center' },
        { key: 'averageResolutionTime', header: 'Avg Resolution (Min)', dataType: 'number', width: 120, align: 'center' },
        { key: 'servicePersons', header: 'Personnel', dataType: 'number', width: 80, align: 'center' },
        { key: 'customerCount', header: 'Customers', dataType: 'number', width: 80, align: 'center' }
      ];
    
    case 'agent-productivity':
      return [
        { key: 'agentName', header: 'Service Person / Zone User', dataType: 'text', width: 150, align: 'left' },
        { key: 'email', header: 'Email', dataType: 'text', width: 180, align: 'left' },
        { key: 'totalTickets', header: 'Total Tickets', dataType: 'number', width: 100, align: 'center' },
        { key: 'resolvedTickets', header: 'Resolved', dataType: 'number', width: 80, align: 'center' },
        { key: 'openTickets', header: 'Open', dataType: 'number', width: 80, align: 'center' },
        { key: 'resolutionRate', header: 'Resolution Rate', dataType: 'percentage', width: 100, align: 'center' },
        { key: 'averageResolutionTime', header: 'Avg Resolution (Min)', dataType: 'number', width: 120, align: 'center' },
        { key: 'zones', header: 'Service Zones', dataType: 'text', width: 200, align: 'left', format: (zones) => Array.isArray(zones) ? zones.join(', ') : zones }
      ];
    
    
    case 'service-person-performance':
      return [
        { key: 'name', header: 'Service Person', dataType: 'text', width: 120, align: 'left' },
        { key: 'email', header: 'Email', dataType: 'text', width: 140, align: 'left' },
        { key: 'zones', header: 'Zones', dataType: 'text', width: 80, align: 'left', format: (zones) => Array.isArray(zones) ? zones.join(', ') : zones || 'N/A' },
        { key: 'summary.totalWorkingDays', header: 'Working Days', dataType: 'number', width: 70, align: 'center', format: (value) => value || 0 },
        { key: 'summary.totalHours', header: 'Total Hours', dataType: 'text', width: 70, align: 'center', format: (value) => value ? `${Number(value).toFixed(1)}h` : '0h' },
        { key: 'summary.totalTickets', header: 'Tickets', dataType: 'number', width: 60, align: 'center' },
        { key: 'resolutionRate', header: 'Resolution Rate', dataType: 'text', width: 80, align: 'center', format: (value, item) => {
          const total = item?.summary?.totalTickets || 0;
          const resolved = item?.summary?.ticketsResolved || 0;
          return total > 0 ? `${Math.round((resolved / total) * 100)}%` : '0%';
        }},
        { key: 'summary.averageResolutionTimeHours', header: 'Avg Resolution', dataType: 'text', width: 80, align: 'center', format: (value) => value && value > 0 ? `${Number(value).toFixed(1)}h` : 'N/A' },
        { key: 'summary.averageTravelTimeHours', header: 'Avg Travel', dataType: 'text', width: 70, align: 'center', format: (value) => value && value > 0 ? `${Number(value).toFixed(1)}h` : 'N/A' },
        { key: 'summary.averageOnsiteTimeHours', header: 'Avg Onsite', dataType: 'text', width: 70, align: 'center', format: (value) => value && value > 0 ? `${Number(value).toFixed(1)}h` : 'N/A' },
        { key: 'summary.performanceScore', header: 'Performance', dataType: 'text', width: 70, align: 'center', format: (value) => value ? `${value}%` : '0%' }
      ];
    
    case 'service-person-attendance':
      return [
        { key: 'name', header: 'Service Person', dataType: 'text', width: 120, align: 'left' },
        { key: 'email', header: 'Email', dataType: 'text', width: 140, align: 'left' },
        { key: 'zones', header: 'Zones', dataType: 'text', width: 80, align: 'left', format: (zones) => Array.isArray(zones) ? zones.join(', ') : zones || 'N/A' },
        { key: 'summary.totalWorkingDays', header: 'Present Days', dataType: 'number', width: 70, align: 'center', format: (value) => value || 0 },
        { key: 'summary.absentDays', header: 'Absent Days', dataType: 'number', width: 70, align: 'center' },
        { key: 'summary.totalHours', header: 'Total Hours', dataType: 'text', width: 70, align: 'center', format: (value) => value ? `${Number(value).toFixed(1)}h` : '0h' },
        { key: 'summary.averageHoursPerDay', header: 'Avg Hours/Day', dataType: 'text', width: 80, align: 'center', format: (value) => value ? `${Number(value).toFixed(1)}h` : '0h' },
        { key: 'summary.totalActivities', header: 'Activities', dataType: 'number', width: 60, align: 'center', format: (value, item) => item?.summary?.totalActivities || item?.summary?.activitiesLogged || 0 },
        { key: 'summary.autoCheckouts', header: 'Auto Checkouts', dataType: 'number', width: 80, align: 'center' }
      ];
    
    case 'her-analysis':
      return [
        { key: 'id', header: 'Ticket ID', dataType: 'text', width: 65, align: 'center' },
        { key: 'title', header: 'Title', dataType: 'text', width: 135, align: 'left' },
        { key: 'customer', header: 'Customer', dataType: 'text', width: 110, align: 'left' },
        { key: 'serialNo', header: 'Serial No', dataType: 'text', width: 85, align: 'center' },
        { key: 'status', header: 'Status', dataType: 'text', width: 65, align: 'center' },
        { key: 'priority', header: 'Priority', dataType: 'text', width: 60, align: 'center' },
        { key: 'assignedTo', header: 'Assigned To', dataType: 'text', width: 95, align: 'left' },
        { key: 'zone', header: 'Zone', dataType: 'text', width: 75, align: 'left' },
        { key: 'herHours', header: 'SLA Hrs', dataType: 'number', width: 55, align: 'center' },
        { key: 'businessHoursUsed', header: 'Hrs Used', dataType: 'number', width: 60, align: 'center' },
        { key: 'isHerBreached', header: 'Breached', dataType: 'text', width: 60, align: 'center' }
      ];
    
    default:
      // Fallback to basic columns
      return [
        { key: 'id', header: 'ID', dataType: 'text', width: 80, align: 'center' },
        { key: 'name', header: 'Name', dataType: 'text', width: 200, align: 'left' },
        { key: 'value', header: 'Value', dataType: 'text', width: 150, align: 'left' },
        { key: 'createdAt', header: 'Created Date', dataType: 'date', width: 120, align: 'center' }
      ];
  }
};

// Export the main function for backward compatibility
export default generatePdf;