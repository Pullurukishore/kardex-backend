import { Request, Response } from 'express';
import prisma from '../config/db';
import { AuthUser } from '../types/express';
import { serializeBigInts } from '../utils/bigint';

// Define types based on Prisma models
type Ticket = {
  id: number;
  title: string;
  description?: string;
  status: string;
  priority: string;
  createdAt: Date;
  updatedAt: Date;
  customerId: number;
  assignedToId?: number;
  assetId?: number;
};

type User = {
  id: number;
  name: string;
  email: string;
};

type Asset = {
  id: number;
  model?: string;
};

type Customer = {
  id: number;
  companyName: string;
  serviceZoneId?: number;
};

type ServiceZone = {
  id: number;
  name: string;
};

// Extend the Ticket type to include relations
type TicketWithRelations = Ticket & {
  customer?: (Customer & { serviceZone?: ServiceZone | null }) | null;
  assignedTo?: User | null;
  asset?: Asset | null;
};

// Helper function to build ticket filter from query params
function buildTicketFilterFromQuery(query: any, zoneIds: number[] | null = null) {
  const {
    startDate,
    endDate,
    status,
    priority,
    serviceZone,
    servicePerson
  } = query;

  const filter: any = {};

  // Add date range filter
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.gte = new Date(startDate);
    if (endDate) filter.createdAt.lte = new Date(endDate);
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
async function getUserZoneIds(userId: number): Promise<number[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { serviceZones: true }
  });
  return user?.serviceZones.map((zone: { serviceZoneId: number }) => zone.serviceZoneId) || [];
}

// Export dashboard data as Excel
export async function exportDashboardReport(req: Request, res: Response) {
  try {
    const user = req.user as AuthUser;
    const zoneIds = await getUserZoneIds(user.id);
    
    // Build the filter based on query parameters
    const filter = buildTicketFilterFromQuery(req.query, zoneIds.length ? zoneIds : null);

    // Fetch tickets with related data
    const tickets = await prisma.ticket.findMany({
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
    }) as TicketWithRelations[];

    // Format data for Excel
    const data = tickets.map(ticket => {
      const customer = ticket.customer as (Customer & { serviceZone?: ServiceZone | null }) | undefined;
      const assignedTo = ticket.assignedTo as User | undefined;
      const asset = ticket.asset as Asset | undefined;
      
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
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=kardexcare-report-${new Date().toISOString().split('T')[0]}.xlsx`
    );

    // Send the Excel file
    return excel.write(workbook, { type: 'buffer', bookType: 'xlsx' }).then((buffer: Buffer) => {
      res.send(buffer);
    });

  } catch (error) {
    console.error('Error exporting report:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to export report',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
