import { Request, Response } from 'express';
import { Prisma, ServiceZone, TicketStatus, PrismaClient, ServicePersonZone } from '@prisma/client';
import prisma from '../config/db';
import { AuthUser } from '../types/express';

type ServicePersonWithUser = {
  user: {
    id: number;
    email: string;
  };
  userId: number;
  serviceZoneId: number;
  serviceZone: ServiceZone;
};

type ServiceZoneWithRelations = ServiceZone & {
  servicePersons: ServicePersonWithUser[];
  _count?: {
    servicePersons?: number;
    zoneUsers?: number;
    customers?: number;
    tickets?: number;
  };
  // Add missing properties from the ServiceZone model
  city?: string;
  state?: string;
  country?: string;
  status?: string;
};

type TicketWithCustomer = Prisma.TicketGetPayload<{
  include: {
    customer: {
      select: {
        id: true;
        companyName: true;
      };
    };
  };
}>;

// Define the response type for service zone stats
interface ServiceZoneStatsResponse {
  id: number;
  name: string;
  counts: {
    servicePersons: number;
    customers: number;
    tickets: number;
    activeTickets: number;
  };
  recentTickets: Array<{
    id: number;
    title: string;
    status: TicketStatus;
    priority: string;
    createdAt: Date;
    customer: {
      id: number;
      companyName: string | null;
    };
  }>;
}

// Extend the base Request type to include user
type ServiceZoneRequest = Request & {
  user?: AuthUser;
  params: {
    id?: string;
  };
  query: {
    search?: string;
    page?: string;
    limit?: string;
  };
  body: any;
};

export const listServiceZones = async (req: ServiceZoneRequest, res: Response) => {
  try {
    const { search, page = '1', limit = '10' } = req.query;
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.ServiceZoneWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [zones, total] = await Promise.all([
      prisma.serviceZone.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { name: 'asc' },
        include: {
          servicePersons: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
      prisma.serviceZone.count({ where }),
    ]);

    const zonesWithCounts = await Promise.all(
      zones.map(async (zone) => {
        const [servicePersonsCount, zoneUsersCount, customersCount, ticketsCount] = await Promise.all([
          prisma.servicePersonZone.count({
            where: { 
              serviceZoneId: zone.id,
              user: { role: 'SERVICE_PERSON' }
            },
          }),
          prisma.servicePersonZone.count({
            where: { serviceZoneId: zone.id },
          }),
          prisma.customer.count({
            where: { serviceZoneId: zone.id },
          }),
          prisma.ticket.count({
            where: {
              customer: {
                serviceZoneId: zone.id
              }
            },
          }),
        ]);

        const servicePersons = zone.servicePersons.map((spz) => ({
          id: spz.userId,
          user: spz.user,
        }));

        return {
          ...zone,
          servicePersons,
          _count: {
            servicePersons: servicePersonsCount,
            zoneUsers: zoneUsersCount,
            customers: customersCount,
            tickets: ticketsCount,
          },
        };
      })
    );

    res.json({
      data: zonesWithCounts,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Error listing service zones:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getServiceZone = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const serviceZone = await prisma.serviceZone.findUnique({
      where: { id: Number(id) },
      include: {
        servicePersons: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!serviceZone) {
      return res.status(404).json({ error: 'Service zone not found' });
    }

    const [servicePersonsCount, customersCount, ticketsCount] = await Promise.all([
      prisma.servicePersonZone.count({
        where: { serviceZoneId: Number(id) },
      }),
      prisma.customer.count({
        where: { serviceZoneId: Number(id) },
      }),
      prisma.ticket.count({
        where: {
          customer: {
            serviceZoneId: Number(id)
          }
        },
      })
    ]);

    const response = {
      ...serviceZone,
      servicePersons: serviceZone.servicePersons.map(spz => ({
        id: spz.userId,
        user: spz.user,
      })),
      _count: {
        servicePersons: servicePersonsCount,
        customers: customersCount,
        tickets: ticketsCount,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching service zone:', error);
    res.status(500).json({ error: 'Failed to fetch service zone' });
  }
};

export const createServiceZone = async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      isActive = true
    } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({ 
        error: 'Name is a required field'
      });
    }

    // Get the authenticated user ID from the request
    const currentUserId = (req.user as AuthUser)?.id;
    if (!currentUserId) {
      return res.status(401).json({ error: 'Unauthorized - User not authenticated' });
    }

    // Create the service zone without assignments
    const serviceZone = await prisma.serviceZone.create({
      data: {
        name,
        description,
        isActive,
      },
      include: {
        servicePersons: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
      },
    });

    // Log the creation
    console.log(`Service zone '${name}' created by user ${currentUserId}`);

    res.status(201).json(serviceZone);
  } catch (error) {
    console.error('Error creating service zone:', error);
    res.status(500).json({ error: 'Failed to create service zone' });
  }
};

export const updateServiceZone = async (req: ServiceZoneRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, city, state, country, status, servicePersonIds = [] } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Service zone ID is required' });
    }

    const serviceZoneId = parseInt(id, 10);
    
    if (isNaN(serviceZoneId)) {
      return res.status(400).json({ error: 'Invalid service zone ID' });
    }

    // Check if service zone exists
    const existingZone = await prisma.serviceZone.findUnique({
      where: { id: serviceZoneId },
      include: {
        servicePersons: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!existingZone) {
      return res.status(404).json({ error: 'Service zone not found' });
    }

    // Check for duplicate name if name is being updated
    if (name && name !== existingZone.name) {
      const duplicateZone = await prisma.serviceZone.findFirst({
        where: { 
          name,
          id: { not: serviceZoneId },
        },
      });

      if (duplicateZone) {
        return res.status(400).json({ 
          error: 'Service zone with this name already exists',
        });
      }
    }

    // Validate service persons if provided
    if (servicePersonIds && servicePersonIds.length > 0) {
      const servicePersons = await prisma.user.findMany({
        where: { 
          id: { in: servicePersonIds },
          role: 'SERVICE_PERSON'
        },
      });
      
      if (servicePersons.length !== servicePersonIds.length) {
        return res.status(400).json({ 
          error: 'One or more service person IDs are invalid',
        });
      }
    }

    // Update service zone
    const [updatedZone] = await prisma.$transaction([
      prisma.serviceZone.update({
        where: { id: serviceZoneId },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(city && { city }),
          ...(state && { state }),
          ...(country && { country }),
          ...(status && { status }),
        },
      }),
      // Update service person relationships
      prisma.servicePersonZone.deleteMany({
        where: { serviceZoneId },
      }),
      ...(servicePersonIds.length > 0 ? [
        prisma.servicePersonZone.createMany({
          data: servicePersonIds.map((personId: number) => ({
            serviceZoneId,
            servicePersonId: personId,
          })),
          skipDuplicates: true,
        }),
      ] : []),
    ]);

    // Fetch the updated zone with relationships
    const serviceZone = await prisma.serviceZone.findUnique({
      where: { id: Number(id) },
      include: {
        servicePersons: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
        _count: true
      },
    }) as unknown as ServiceZoneWithRelations;

    if (!serviceZone) {
      return res.status(404).json({ error: 'Failed to fetch updated service zone' });
    }

    // Map the service person data to match expected format
    const formattedResult = {
      ...serviceZone,
      servicePersons: serviceZone.servicePersons.map((spz) => ({
        id: spz.userId,
        user: spz.user,
      })),
    };

    res.json(formattedResult);
  } catch (error) {
    console.error('Error updating service zone:', error);
    res.status(500).json({ error: 'Failed to update service zone' });
  }
};

export const deleteServiceZone = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if service zone exists
    const [zone, counts] = await Promise.all([
      prisma.serviceZone.findUnique({
        where: { id: parseInt(id) }
      }),
      Promise.all([
        prisma.servicePersonZone.count({ where: { serviceZoneId: parseInt(id) } }),
        prisma.customer.count({ where: { serviceZoneId: parseInt(id) } }),
        prisma.ticket.count({ 
          where: { 
            customer: { 
              serviceZoneId: parseInt(id) 
            } 
          } 
        })
      ])
    ]);

    const [servicePersonsCount, customersCount, ticketsCount] = counts;

    if (!zone) {
      return res.status(404).json({ error: 'Service zone not found' });
    }

    // Prevent deletion if there are associated records
    if (servicePersonsCount > 0 || customersCount > 0 || ticketsCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete service zone with associated records',
        details: {
          servicePersons: servicePersonsCount,
          customers: customersCount,
          tickets: ticketsCount
        }
      });
    }

    await prisma.serviceZone.delete({
      where: { id: parseInt(id) }
    });

    return res.json({ message: 'Service zone deleted successfully' });
  } catch (error) {
    console.error('Error deleting service zone:', error);
    return res.status(500).json({ error: 'Failed to delete service zone' });
  }
};

export const getServiceZoneStats = async (req: ServiceZoneRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: 'Service zone ID is required' });
    }

    const serviceZoneId = parseInt(id, 10);
    
    if (isNaN(serviceZoneId)) {
      return res.status(400).json({ error: 'Invalid service zone ID' });
    }

    // Get all data in parallel
    const [
      serviceZone, 
      servicePersonsCount, 
      customersCount, 
      ticketsCount, 
      activeTicketsCount, 
      recentTickets
    ] = await Promise.all([
      prisma.serviceZone.findUnique({
        where: { id: serviceZoneId },
      }),
      prisma.servicePersonZone.count({
        where: { serviceZoneId },
      }),
      prisma.customer.count({
        where: { serviceZoneId },
      }),
      prisma.ticket.count({
        where: { 
          customer: {
            serviceZoneId: serviceZoneId
          }
        },
      }),
      prisma.ticket.count({
        where: {
          customer: {
            serviceZoneId: serviceZoneId
          },
          status: {
            in: ['OPEN', 'ASSIGNED', 'IN_PROCESS'] as const
          },
        },
      }),
      prisma.ticket.findMany({
        where: { 
          customer: {
            serviceZoneId: serviceZoneId
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          customer: {
            select: {
              id: true,
              companyName: true,
            },
          },
        },
      }),
    ]);

    if (!serviceZone) {
      return res.status(404).json({ error: 'Service zone not found' });
    }

    // Format the response with proper null checks
    const stats = {
      id: serviceZone.id,
      name: serviceZone.name,
      counts: {
        servicePersons: servicePersonsCount,
        customers: customersCount,
        tickets: ticketsCount,
        activeTickets: activeTicketsCount,
      },
      recentTickets: (recentTickets as Array<any>).map((ticket) => {
        // Ensure we have a valid ticket and customer
        if (!ticket) return null;
        
        const customerInfo = ticket.customer ? {
          id: ticket.customer.id || null,
          companyName: ticket.customer?.companyName || null,
        } : {
          id: null,
          companyName: null
        };

        return {
          id: ticket.id || null,
          title: ticket.title || 'No Title',
          status: ticket.status || 'UNKNOWN',
          priority: ticket.priority ? String(ticket.priority) : 'MEDIUM',
          createdAt: ticket.createdAt || new Date(),
          customer: customerInfo,
        };
      }).filter(ticket => ticket !== null), // Remove any null entries
    };

    res.json(stats);
  } catch (error) {
    console.error('Error getting service zone stats:', error);
    res.status(500).json({ error: 'Failed to fetch service zone stats' });
  }
};