import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/db';
import { AuthUser } from '../types/express';

// Define custom types for Prisma inputs
type AssetWhereInput = {
  id?: number;
  machineId?: { contains?: string; mode?: 'insensitive' };
  model?: { contains?: string; mode?: 'insensitive' };
  serialNo?: { contains?: string; mode?: 'insensitive' };
  customerId?: number | { in?: number[] };
  status?: string;
  customer?: {
    serviceZoneId?: { in?: number[] };
    companyName?: { contains?: string; mode?: 'insensitive' };
  };
  tickets?: {
    some?: {
      assignedToId?: number;
    };
  };
  OR?: AssetWhereInput[];
  AND?: AssetWhereInput[];
};

// Extended Request type
type AssetRequest = Request & {
  user?: AuthUser;
  params: {
    id?: string;
    customerId?: string;
  };
  query: {
    search?: string;
    page?: string;
    limit?: string;
    customerId?: string;
    status?: string;
  };
  body: any;
};

// Helper function to get user from request
function getUserFromRequest(req: AssetRequest): AuthUser | undefined {
  return req.user;
}

// Get all assets with pagination and search
export const listAssets = async (req: AssetRequest, res: Response) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { search = '', page = 1, limit = 10, customerId } = req.query;
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    const where: AssetWhereInput = {};
    
    // Role-based filtering
    const userRole = user.role;
    const userCustomerId = user.customerId;
    
    if (userRole === 'ADMIN') {
      // Admin can view all assets
      if (customerId) {
        where.customerId = parseInt(customerId as string);
      }
    } else if (userRole === 'ZONE_USER') {
      // Zone users: if bound to a customer, restrict to that customer
      if (userCustomerId) {
        where.customerId = userCustomerId;
        // Optionally narrow further if query customerId matches
        if (customerId && parseInt(customerId as string) !== userCustomerId) {
          return res.status(403).json({ error: 'Access denied to requested customer assets' });
        }
      } else {
        // If no direct customer mapping, allow assets in user's service zones
        const zones = await prisma.servicePersonZone.findMany({
          where: { userId: user.id },
          select: { serviceZoneId: true }
        });
        const zoneIds = zones.map(z => z.serviceZoneId);
        if (zoneIds.length === 0) {
          return res.status(403).json({ error: 'No assigned zones found for user' });
        }
        // Filter by customers that belong to those zones
        where.customer = { serviceZoneId: { in: zoneIds } } as any;
        if (customerId) {
          // Validate requested customer is within allowed zones
          const customer = await prisma.customer.findUnique({
            where: { id: parseInt(customerId as string) },
            select: { serviceZoneId: true }
          });
          if (!customer || !zoneIds.includes(customer.serviceZoneId)) {
            return res.status(403).json({ error: 'Access denied to requested customer assets' });
          }
          // Narrow by customer as requested
          delete (where as any).customer; // replace zone filter with exact customer filter
          where.customerId = parseInt(customerId as string);
        }
      }
    } else if (userRole === 'SERVICE_PERSON') {
      // ServicePerson can only view assets linked to tickets assigned to them
      where.tickets = {
        some: {
          assignedToId: user.id
        }
      };
    } else {
      return res.status(403).json({ error: 'Insufficient permissions to view assets' });
    }
    
    // Add search filter if provided
    if (search) {
      where.OR = [
        { machineId: { contains: search as string, mode: 'insensitive' } },
        { model: { contains: search as string, mode: 'insensitive' } },
        { serialNo: { contains: search as string, mode: 'insensitive' } },
        {
          customer: {
            companyName: { contains: search as string, mode: 'insensitive' }
          }
        }
      ];
    }

    const [assets, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { machineId: 'asc' },
        select: {
          id: true,
          machineId: true,
          model: true,
          serialNo: true,
          location: true,
          status: true,
          customer: {
            select: {
              id: true,
              companyName: true
            }
          },
          _count: {
            select: {
              tickets: true
            }
          },
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.asset.count({ where })
    ]);

    return res.json({
      data: assets,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch assets' });
  }
};

export const getAsset = async (req: AssetRequest, res: Response) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Asset ID is required' });
    }
    const assetId = parseInt(id);

    if (isNaN(assetId)) {
      return res.status(400).json({ error: 'Invalid asset ID' });
    }

    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        customer: {
          select: {
            id: true,
            companyName: true
          }
        },
        tickets: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            createdAt: true,
            assignedTo: {
              select: {
                id: true,
                email: true,
                name: true
              }
            }
          }
        },
        serviceHistory: {
          take: 5,
          orderBy: { performedAt: 'desc' },
          include: {
            performedBy: {
              select: {
                id: true,
                email: true,
                name: true
              }
            },
            ticket: {
              select: {
                id: true,
                title: true
              }
            }
          }
        },
        _count: {
          select: {
            tickets: true
          }
        }
      }
    });

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Role-based access control
    const userRole = user.role;
    const userCustomerId = user.customerId;

    if (userRole === 'ADMIN') {
      // Admin can view any asset
    } else if (userRole === 'ZONE_USER') {
      // Zone users can only view their own customer's assets
      if (!userCustomerId || userCustomerId !== asset.customerId) {
        return res.status(403).json({ error: 'Access denied to this asset' });
      }
    } else if (userRole === 'SERVICE_PERSON') {
      // ServicePerson can view assets in their service zones
      const serviceZones = await prisma.servicePersonZone.findMany({
        where: { userId: user.id },
        select: { serviceZoneId: true }
      });
      
      const hasZoneAccess = serviceZones.some((sz: any) => 
        asset.customer && 'serviceZoneId' in asset.customer && 
        asset.customer.serviceZoneId === sz.serviceZoneId
      );
      
      const hasTicketAccess = await prisma.ticket.findFirst({
        where: {
          assetId: assetId,
          assignedToId: user.id
        }
      });
      
      if (!hasZoneAccess && !hasTicketAccess) {
        return res.status(403).json({ error: 'Access denied to this asset' });
      }
    } else {
      return res.status(403).json({ error: 'Insufficient permissions to view this asset' });
    }

    return res.json(asset);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch asset' });
  }
};

// Create a new asset
export const createAsset = async (req: AssetRequest, res: Response) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const {
      machineId,
      model,
      serialNo,
      purchaseDate,
      warrantyStart,
      warrantyEnd,
      amcStart,
      amcEnd,
      location,
      status,
      customerId
    } = req.body;

    // Validate required fields
    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    // Auto-generate machineId if not provided
    let finalMachineId = machineId;
    if (!finalMachineId || finalMachineId.trim() === '') {
      finalMachineId = `MACHINE_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Role-based access control
    const userRole = user.role;
    const userCustomerId = user.customerId;

    if (userRole === 'ADMIN') {
      // Admin can create assets for any customer
    } else if (userRole === 'ZONE_USER') {
      // Zone users can only create assets for their own customer
      if (!userCustomerId || userCustomerId !== parseInt(customerId)) {
        return res.status(403).json({ error: 'You can only create assets for your own customer' });
      }
    } else {
      return res.status(403).json({ error: 'Insufficient permissions to create assets' });
    }

    // Check if machineId already exists
    const existingMachine = await prisma.asset.findUnique({
      where: { machineId: finalMachineId }
    });

    if (existingMachine) {
      // If auto-generated ID conflicts, generate a new one
      if (!machineId || machineId.trim() === '') {
        finalMachineId = `MACHINE_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      } else {
        return res.status(400).json({ error: 'Machine ID already exists' });
      }
    }

    // Check if serialNo is unique for this customer
    if (serialNo) {
      const existingSerial = await prisma.asset.findFirst({
        where: {
          serialNo,
          customerId: parseInt(customerId)
        }
      });

      if (existingSerial) {
        return res.status(400).json({ error: 'Serial number already exists for this customer' });
      }
    }

    // Check if customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: parseInt(customerId) }
    });

    if (!customer) {
      return res.status(400).json({ error: 'Customer not found' });
    }

    const asset = await prisma.asset.create({
      data: {
        machineId: finalMachineId,
        model,
        serialNo,
        location,
        status: status || 'ACTIVE',
        customer: {
          connect: { id: parseInt(customerId) }
        }
      },
      include: {
        customer: {
          select: {
            id: true,
            companyName: true
          }
        }
      }
    });

    return res.status(201).json(asset);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create asset' });
  }
};

// Update asset
export const updateAsset = async (req: AssetRequest, res: Response) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const {
      machineId,
      model,
      serialNo,
      purchaseDate,
      warrantyStart,
      warrantyEnd,
      amcStart,
      amcEnd,
      location,
      status,
      customerId
    } = req.body;

    const assetId = id ? parseInt(id, 10) : NaN;
    if (isNaN(assetId)) {
      return res.status(400).json({ message: 'Invalid asset ID' });
    }
    
    // Check if asset exists
    const existingAsset = await prisma.asset.findUnique({
      where: { id: assetId }
    });

    if (!existingAsset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Role-based access control
    const userRole = user.role;
    const userCustomerId = user.customerId;

    if (userRole === 'ADMIN') {
      // Admin can update any asset
    } else if (userRole === 'ZONE_USER') {
      // Zone users can only update assets for their own customer
      if (!userCustomerId || existingAsset.customerId !== userCustomerId) {
        return res.status(403).json({ error: 'You can only update assets for your own customer' });
      }
      // Prevent changing customerId for non-admin users
      if (customerId && parseInt(customerId) !== userCustomerId) {
        return res.status(403).json({ error: 'You cannot change the customer for this asset' });
      }
    } else {
      return res.status(403).json({ error: 'Insufficient permissions to update assets' });
    }

    // Check if machineId is being changed and if it's already in use
    if (machineId && machineId !== existingAsset.machineId) {
      const machineExists = await prisma.asset.findUnique({
        where: { machineId }
      });

      if (machineExists) {
        return res.status(400).json({ error: 'Machine ID already exists' });
      }
    }

    // Check if serialNo is being changed and if it's unique for this customer
    if (serialNo && serialNo !== existingAsset.serialNo) {
      const targetCustomerId = customerId || existingAsset.customerId;
      const serialExists = await prisma.asset.findFirst({
        where: {
          serialNo,
          customerId: targetCustomerId,
          id: { not: assetId }
        }
      });

      if (serialExists) {
        return res.status(400).json({ error: 'Serial number already exists for this customer' });
      }
    }

    const updateData: any = {
      machineId,
      model,
      serialNo,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
      warrantyStart: warrantyStart ? new Date(warrantyStart) : null,
      warrantyEnd: warrantyEnd ? new Date(warrantyEnd) : null,
      amcEnd: amcEnd ? new Date(amcEnd) : null,
      location,
      status
    };

    // Only update customer if provided and user has permission
    if (customerId && userRole === 'ADMIN') {
      updateData.customer = { connect: { id: parseInt(customerId) } };
    }

    const updatedAsset = await prisma.asset.update({
      where: { id: assetId },
      data: updateData,
      include: {
        customer: {
          select: {
            id: true,
            companyName: true
          }
        }
      }
    });

    return res.json(updatedAsset);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update asset' });
  }
};

// Delete asset
export const deleteAsset = async (req: AssetRequest, res: Response) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const assetId = req.params?.id ? parseInt(req.params.id, 10) : NaN;
    if (isNaN(assetId)) {
      return res.status(400).json({ message: 'Invalid asset ID' });
    }
    
    // Check if asset exists
    const existingAsset = await prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        _count: {
          select: {
            tickets: true
          }
        }
      }
    });

    if (!existingAsset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Role-based access control
    const userRole = user.role;
    const userCustomerId = user.customerId;

    if (userRole === 'ADMIN') {
      // Admin can delete any asset
    } else if (userRole === 'ZONE_USER') {
      // Zone users can only delete assets for their own customer
      if (!userCustomerId || existingAsset.customerId !== userCustomerId) {
        return res.status(403).json({ error: 'You can only delete assets for your own customer' });
      }
    } else {
      return res.status(403).json({ error: 'Insufficient permissions to delete assets' });
    }

    // Prevent deletion if asset has related tickets
    if (existingAsset._count.tickets > 0) {
      return res.status(400).json({
        error: 'Cannot delete asset with related tickets',
        details: {
          tickets: existingAsset._count.tickets
        }
      });
    }

    await prisma.asset.delete({
      where: { id: assetId }
    });

    return res.json({ message: 'Asset deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete asset' });
  }
};

// Legacy functions for backward compatibility
export const getCustomerAssets = async (req: AssetRequest, res: Response) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { customerId: customerIdParam } = req.params;
    if (!customerIdParam) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }
    const customerId = parseInt(customerIdParam);
    const { status } = req.query;

    // Check if the authenticated user has access to this customer's assets
    if (user.role !== 'ADMIN' && user.customerId !== customerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const assets = await prisma.asset.findMany({
      where: {
        customerId,
        ...(status ? { status: String(status) } : {})
      },
      select: {
        id: true,
        machineId: true,
        model: true,
        serialNo: true,
        location: true,
        status: true,
        customer: {
          select: {
            id: true,
            companyName: true
          }
        },
        _count: {
          select: {
            tickets: true
          }
        }
      },
      orderBy: {
        machineId: 'asc'
      }
    });

    return res.json(assets);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch assets' });
  }
};

export const getAssetStats = async (req: AssetRequest, res: Response) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = user.role;
    const userCustomerId = user.customerId;

    const where: AssetWhereInput = {};
    
    // Role-based filtering
    if (userRole === 'ZONE_USER') {
      if (!userCustomerId) {
        return res.status(403).json({ error: 'Customer ID not found for user' });
      }
      where.customerId = userCustomerId;
    } else if (userRole === 'SERVICE_PERSON') {
      // ServicePerson can only view assets linked to tickets assigned to them
      where.tickets = {
        some: {
          assignedToId: user.id
        }
      };
    }
    // Admin can view all assets (no additional filtering)

    const [total, active, maintenance, inactive] = await Promise.all([
      prisma.asset.count({ where }),
      prisma.asset.count({ where: { ...where, status: 'ACTIVE' } }),
      prisma.asset.count({ where: { ...where, status: 'MAINTENANCE' } }),
      prisma.asset.count({ where: { ...where, status: 'INACTIVE' } })
    ]);

    return res.json({
      total,
      active,
      maintenance,
      inactive
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch asset statistics' });
  }
};

export const getAssetDetails = async (req: AssetRequest, res: Response) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Asset ID is required' });
    }
    const assetId = parseInt(id);
    
    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        customer: {
          select: {
            id: true,
            companyName: true
          }
        },
        tickets: {
          take: 10,
          orderBy: {
            createdAt: 'desc'
          },
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Check permissions
    if (user.role !== 'ADMIN' && user.customerId !== asset.customerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    return res.json(asset);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch asset details' });
  }
};
