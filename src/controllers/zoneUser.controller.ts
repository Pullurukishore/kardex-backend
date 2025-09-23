import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcrypt';
import prisma from '../config/db';
import { AuthUser } from '../types/express';

// Types
type ZoneUserRequest = Request & {
  user?: AuthUser;
  params: {
    id?: string;
  };
  body: {
    userId: number;
    serviceZoneIds?: number[];
  };
};

export const listZoneUsers = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const role = req.query.role as string;
    const offset = (page - 1) * limit;

    // Build where clause for search
    const whereClause: any = {
      // Filter by role - default to ZONE_USER if not specified
      role: role || 'ZONE_USER',
      serviceZones: {
        some: {} // Only users who have zone assignments
      }
    };

    if (search) {
      whereClause.email = {
        contains: search,
        mode: 'insensitive'
      };
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          serviceZones: {
            include: {
              serviceZone: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  isActive: true
                }
              }
            }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { email: 'asc' }
      }),
      prisma.user.count({ where: whereClause })
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      data: users,
      pagination: {
        total,
        page,
        limit,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error listing zone users:', error);
    res.status(500).json({ error: 'Failed to fetch zone users' });
  }
};

export const getZoneUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const user = await prisma.user.findUnique({
      where: { id: Number(id) },
      include: {
        serviceZones: {
          include: {
            serviceZone: {
              select: {
                id: true,
                name: true,
                description: true,
                isActive: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching zone user:', error);
    res.status(500).json({ error: 'Failed to fetch zone user' });
  }
};

export const assignUserToZones = async (req: ZoneUserRequest, res: Response) => {
  try {
    const { userId, serviceZoneIds = [] } = req.body;

    // Validate input
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({ 
      where: { id: userId },
      select: { id: true, email: true, role: true, isActive: true }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Validate service zones if provided
    if (serviceZoneIds.length > 0) {
      const zones = await prisma.serviceZone.findMany({
        where: { 
          id: { in: serviceZoneIds },
          isActive: true
        }
      });
      if (zones.length !== serviceZoneIds.length) {
        return res.status(400).json({ error: 'One or more service zones are invalid or inactive' });
      }
    }

    // Remove existing zone assignments
    await prisma.servicePersonZone.deleteMany({
      where: { userId: userId }
    });

    // Create new zone assignments
    if (serviceZoneIds.length > 0) {
      await prisma.servicePersonZone.createMany({
        data: serviceZoneIds.map((zoneId: number) => ({
          userId: userId,
          serviceZoneId: zoneId
        })),
        skipDuplicates: true
      });
    }

    // Fetch updated user with zones
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        serviceZones: {
          include: {
            serviceZone: {
              select: {
                id: true,
                name: true,
                description: true,
                isActive: true
              }
            }
          }
        }
      }
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Error assigning user to zones:', error);
    res.status(500).json({ error: 'Failed to assign user to zones' });
  }
};

export const updateZoneUserAssignments = async (req: ZoneUserRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { serviceZoneIds = [] } = req.body;
    const userId = Number(id);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Validate service zones if provided
    if (serviceZoneIds.length > 0) {
      const zones = await prisma.serviceZone.findMany({
        where: { 
          id: { in: serviceZoneIds },
          isActive: true
        }
      });
      if (zones.length !== serviceZoneIds.length) {
        return res.status(400).json({ error: 'One or more service zones are invalid or inactive' });
      }
    }

    // Update zone assignments using transaction
    await prisma.$transaction([
      // Remove existing assignments
      prisma.servicePersonZone.deleteMany({
        where: { userId: userId }
      }),
      // Create new assignments
      ...(serviceZoneIds.length > 0 ? [
        prisma.servicePersonZone.createMany({
          data: serviceZoneIds.map((zoneId: number) => ({
            userId: userId,
            serviceZoneId: zoneId
          })),
          skipDuplicates: true
        })
      ] : [])
    ]);

    // Fetch updated user
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        serviceZones: {
          include: {
            serviceZone: {
              select: {
                id: true,
                name: true,
                description: true,
                isActive: true
              }
            }
          }
        }
      }
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating zone user assignments:', error);
    res.status(500).json({ error: 'Failed to update zone assignments' });
  }
};

export const removeZoneUserAssignments = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = Number(id);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove all zone assignments
    await prisma.servicePersonZone.deleteMany({
      where: { userId: userId }
    });

    res.json({ message: 'Zone assignments removed successfully' });
  } catch (error) {
    console.error('Error removing zone user assignments:', error);
    res.status(500).json({ error: 'Failed to remove zone assignments' });
  }
};

export const deleteZoneUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = Number(id);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove all zone assignments first (foreign key constraint)
    await prisma.servicePersonZone.deleteMany({
      where: { userId: userId }
    });

    // Delete the user
    await prisma.user.delete({
      where: { id: userId }
    });

    res.json({ 
      success: true, 
      message: 'Zone user deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting zone user:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete zone user' 
    });
  }
};

export const createZoneUserWithZones = async (req: Request, res: Response) => {
  const { name, email, phone, password, serviceZoneIds, isActive = true } = req.body;
  const prisma = new PrismaClient();

  try {
    console.log('📝 createZoneUserWithZones: Creating user with data:', {
      name,
      email,
      phone,
      serviceZoneIds,
      isActive
    });
    
    // Hash the password before saving
    const hashedPassword = await hash(password, 10);
    
    // Start a transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the user with all required fields
      const user = await tx.user.create({
        data: {
          name,
          email,
          phone: phone || null, // Add phone field
          password: hashedPassword,
          role: 'ZONE_USER',
          isActive,
          tokenVersion: Math.floor(Math.random() * 1000000).toString(),
          refreshToken: null,
          refreshTokenExpires: null,
          lastLoginAt: null,
          failedLoginAttempts: 0,
          lastFailedLogin: null,
          lastPasswordChange: new Date(),
          passwordResetToken: null,
          passwordResetExpires: null,
          lastActiveAt: null,
          ipAddress: null,
          userAgent: null,
        },
      });

      // 2. Assign zones to the user using the correct relation
      await Promise.all(
        serviceZoneIds.map((zoneId: number) =>
          tx.user.update({
            where: { id: user.id },
            data: {
              serviceZones: {
                create: {
                  serviceZoneId: zoneId,
                },
              },
            },
          })
        )
      );

      return user;
    });

    // Omit sensitive data from the response
    const { password: _, ...userWithoutPassword } = result;
    
    res.status(201).json({
      success: true,
      data: userWithoutPassword,
    });
  } catch (error: any) {
    console.error('Error creating zone user:', error);
    
    // Handle duplicate email error
    if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
      return res.status(400).json({
        success: false,
        error: 'Email already exists',
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to create zone user',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    await prisma.$disconnect();
  }
};

export const getAllUsersForZoneAssignment = async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string;
    const role = req.query.role as string;

    // Build where clause
    const whereClause: any = {
      isActive: true
    };

    if (search) {
      whereClause.email = {
        contains: search,
        mode: 'insensitive'
      };
    }

    if (role) {
      whereClause.role = role;
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        serviceZones: {
          include: {
            serviceZone: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: { email: 'asc' },
      take: 100 // Limit for dropdown/selection
    });

    res.json(users);
  } catch (error) {
    console.error('Error fetching users for zone assignment:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};
