import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import prisma from '../config/db';
import { AuthUser } from '../types/express'; // Import AuthUser type
import bcrypt from 'bcrypt'; // For password hashing

// Password hashing utility
const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

// Types
type ServicePersonRequest = Request & {
  user?: AuthUser;
  params: {
    id?: string;
  };
  body: {
    email: string;
    name?: string;
    phone?: string;
    password: string;
    serviceZoneIds?: number[];
  };
};

export const listServicePersons = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 30;
    const search = req.query.search as string || '';
    const offset = (page - 1) * limit;

    // Build where clause for search
    const where: any = { role: 'SERVICE_PERSON' };
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { id: { equals: parseInt(search) || 0 } }
      ];
    }

    const [servicePersons, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          serviceZones: {
            include: {
              serviceZone: true
            }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { id: 'desc' }
      }),
      prisma.user.count({ where })
    ]);
    
    const totalPages = Math.ceil(total / limit);
    
    res.json({
      data: servicePersons,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error listing service persons:', error);
    res.status(500).json({ error: 'Failed to fetch service persons' });
  }
};

export const getServicePerson = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const servicePerson = await prisma.user.findUnique({
      where: { 
        id: Number(id),
        role: 'SERVICE_PERSON'
      },
      include: {
        serviceZones: {
          include: {
            serviceZone: true
          }
        }
      }
    });

    if (!servicePerson) {
      return res.status(404).json({ error: 'Service person not found' });
    }

    res.json(servicePerson);
  } catch (error) {
    console.error('Error fetching service person:', error);
    res.status(500).json({ error: 'Failed to fetch service person' });
  }
};

export const createServicePerson = async (req: ServicePersonRequest, res: Response) => {
  try {
    const { name, email, phone, password, serviceZoneIds = [] } = req.body;

    console.log('📝 createServicePerson: Creating service person with data:', {
      name,
      email,
      phone,
      serviceZoneIds
    });
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    // Validate service zones if provided
    if (serviceZoneIds.length > 0) {
      const zones = await prisma.serviceZone.findMany({
        where: { id: { in: serviceZoneIds } }
      });
      if (zones.length !== serviceZoneIds.length) {
        return res.status(400).json({ error: 'One or more service zones are invalid' });
      }
    }

    // Create the service person
    const servicePerson = await prisma.user.create({
      data: {
        name: name || null,
        email,
        phone: phone || null, // Add phone field
        password: await hashPassword(password),
        role: 'SERVICE_PERSON',
        tokenVersion: '0', // Initialize token version
        serviceZones: serviceZoneIds.length > 0 ? {
          create: serviceZoneIds.map((zoneId: number) => ({
            serviceZoneId: zoneId
          }))
        } : undefined
      },
      include: {
        serviceZones: {
          include: {
            serviceZone: true
          }
        }
      }
    });

    // Don't return the password hash
    const { password: _, ...safeUser } = servicePerson;
    res.status(201).json(safeUser);
  } catch (error) {
    console.error('Error creating service person:', error);
    res.status(500).json({ error: 'Failed to create service person' });
  }
};

export const updateServicePerson = async (req: ServicePersonRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { email, name, phone, password, serviceZoneIds } = req.body;

    // Check if service person exists
    const existingPerson = await prisma.user.findUnique({
      where: { 
        id: Number(id),
        role: 'SERVICE_PERSON'
      }
    });

    if (!existingPerson) {
      return res.status(404).json({ error: 'Service person not found' });
    }

    // Validate service zones if provided
    if (serviceZoneIds && serviceZoneIds.length > 0) {
      const zones = await prisma.serviceZone.findMany({
        where: { id: { in: serviceZoneIds } }
      });
      if (zones.length !== serviceZoneIds.length) {
        return res.status(400).json({ error: 'One or more service zones are invalid' });
      }
    }

    // Update the service person
    const [updatedPerson] = await prisma.$transaction([
      prisma.user.update({
        where: { id: Number(id) },
        data: {
          ...(email && { email }),
          ...(name !== undefined && { name: name || null }),
          ...(phone !== undefined && { phone: phone || null }),
          ...(password && { password: await hashPassword(password) }),
        }
      }),
      // Update service zone relationships
      prisma.servicePersonZone.deleteMany({
        where: { userId: Number(id) }
      }),
      ...(serviceZoneIds && serviceZoneIds.length > 0 ? [
        prisma.servicePersonZone.createMany({
          data: serviceZoneIds.map((zoneId: number) => ({
            userId: Number(id),
            serviceZoneId: zoneId
          })),
          skipDuplicates: true
        })
      ] : [])
    ]);

    // Fetch the updated person with relationships
    const servicePerson = await prisma.user.findUnique({
      where: { id: Number(id) },
      include: {
        serviceZones: {
          include: {
            serviceZone: true
          }
        }
      }
    });

    if (!servicePerson) {
      return res.status(404).json({ error: 'Service person not found after update' });
    }

    // Don't return the password hash
    const { password: _, ...safeUser } = servicePerson;
    res.json(safeUser);
  } catch (error) {
    console.error('Error updating service person:', error);
    res.status(500).json({ error: 'Failed to update service person' });
  }
};

export const deleteServicePerson = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if service person exists
    const servicePerson = await prisma.user.findUnique({
      where: { 
        id: Number(id),
        role: 'SERVICE_PERSON'
      }
    });

    if (!servicePerson) {
      return res.status(404).json({ error: 'Service person not found' });
    }

    // Check for associated tickets or other relationships
    const [ticketsCount, serviceZonesCount] = await Promise.all([
      prisma.ticket.count({ where: { assignedToId: Number(id) } }),
      prisma.servicePersonZone.count({ where: { userId: Number(id) } })
    ]);

    // If there are associated tickets, we cannot delete
    if (ticketsCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete service person with assigned tickets',
        details: {
          tickets: ticketsCount,
          serviceZones: serviceZonesCount
        }
      });
    }

    // If there are service zone assignments, clean them up first
    if (serviceZonesCount > 0) {
      await prisma.servicePersonZone.deleteMany({
        where: { userId: Number(id) }
      });
    }

    await prisma.user.delete({
      where: { id: Number(id) }
    });

    res.json({ 
      message: 'Service person deleted successfully',
      cleanedRecords: {
        serviceZones: serviceZonesCount
      }
    });
  } catch (error) {
    console.error('Error deleting service person:', error);
    res.status(500).json({ error: 'Failed to delete service person' });
  }
};