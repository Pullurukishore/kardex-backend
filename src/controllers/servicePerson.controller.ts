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
    // Remove name if your User model doesn't have it
    password: string;
    serviceZoneIds?: number[];
  };
};

export const listServicePersons = async (req: Request, res: Response) => {
  try {
    const servicePersons = await prisma.user.findMany({
      where: { role: 'SERVICE_PERSON' },
      select: {
        id: true,
        email: true,
        // Remove name if your User model doesn't have it
        serviceZones: {
          include: {
            serviceZone: true
          }
        }
      }
    });
    
    res.json(servicePersons);
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
    const { email, password, serviceZoneIds = [] } = req.body;

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
        email,
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
    const { email, password, serviceZoneIds } = req.body;

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

    if (ticketsCount > 0 || serviceZonesCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete service person with associated records',
        details: {
          tickets: ticketsCount,
          serviceZones: serviceZonesCount
        }
      });
    }

    await prisma.user.delete({
      where: { id: Number(id) }
    });

    res.json({ message: 'Service person deleted successfully' });
  } catch (error) {
    console.error('Error deleting service person:', error);
    res.status(500).json({ error: 'Failed to delete service person' });
  }
};