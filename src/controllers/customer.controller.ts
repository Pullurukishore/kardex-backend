import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/db';
import bcrypt from 'bcryptjs';

// Using the global type declaration from @types/express

// Interface for customer list response
export interface CustomerListResponse {
  id: number;
  companyName: string;
  address?: string | null;
  industry?: string | null;
  timezone: string;
  serviceZoneId: number;
  isActive: boolean;
  serviceZone?: {
    id: number;
    name: string;
  };
  _count: {
    assets: number;
    contacts: number;
    tickets: number;
  };
}

// Import the extended Request type from express.d.ts
import { AuthenticatedRequest } from '../types/express';

export const listCustomers = async (req: AuthenticatedRequest, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { search = '', include, serviceZoneId } = req.query;
    const where: any = {};
    
    // Add serviceZoneId filter if provided
    if (serviceZoneId) {
      where.serviceZoneId = parseInt(serviceZoneId as string, 10);
    }
    
    // Parse include parameter (e.g., "contacts,assets,serviceZone")
    const includeParams = typeof include === 'string' ? include.split(',') : [];
    const shouldIncludeContacts = includeParams.includes('contacts');
    const shouldIncludeAssets = includeParams.includes('assets');
    
    // Role-based filtering
    const userRole = req.user?.role;
    const userId = req.user?.id;
    
    if (userRole === 'ADMIN') {
      // Admin can view all customers
    } else if (userRole === 'ZONE_USER') {
      // Zone users can only view customers in their assigned zones
      const userWithZones = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          serviceZones: {
            select: { serviceZoneId: true }
          }
        }
      });
      
      if (!userWithZones || !userWithZones.serviceZones.length) {
        return res.status(403).json({ error: 'No zones assigned to user' });
      }
      
      const zoneIds = userWithZones.serviceZones.map((sz: any) => sz.serviceZoneId);
      where.serviceZoneId = { in: zoneIds };
    } else if (userRole === 'SERVICE_PERSON') {
      // ServicePerson can view all customers
    } else {
      return res.status(403).json({ error: 'Insufficient permissions to view customers' });
    }
    
    // Add search filter if provided
    if (search) {
      where.OR = [
        { companyName: { contains: search as string, mode: 'insensitive' } },
        { industry: { contains: search as string, mode: 'insensitive' } },
        {
          contacts: {
            some: {
              OR: [
                { name: { contains: search as string, mode: 'insensitive' } },
                { email: { contains: search as string, mode: 'insensitive' } },
                { phone: { contains: search as string } },
              ]
            }
          }
        }
      ];
    }

    
    // Build dynamic query based on include parameters
    const selectQuery: any = {
      id: true,
      companyName: true,
      address: true,
      industry: true,
      timezone: true,
      isActive: true,
      serviceZoneId: true,
      createdAt: true,
      updatedAt: true,
      createdById: true,
      updatedById: true,
      serviceZone: {
        select: { id: true, name: true }
      },
      _count: {
        select: { assets: true, contacts: true, tickets: true }
      }
    };

    // Add contacts if requested
    if (shouldIncludeContacts) {
      selectQuery.contacts = {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { name: 'asc' }
      };
    }

    // Add assets if requested
    if (shouldIncludeAssets) {
      selectQuery.assets = {
        select: {
          id: true,
          machineId: true,
          model: true,
          serialNo: true,
          location: true,
          status: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { machineId: 'asc' }
      };
    }

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { companyName: 'asc' },
      select: selectQuery
    });
    
    const queryTime = Date.now() - startTime;

    // Transform the data for the frontend
    const response = customers.map((customer: any) => ({
      ...customer,
      // Ensure all fields are properly typed
      companyName: customer.companyName || '',
      address: customer.address || '',
      industry: customer.industry || '',
      timezone: customer.timezone || 'UTC',
      // Include assets and contacts if they were requested, otherwise empty arrays
      assets: shouldIncludeAssets ? (customer.assets || []) : [],
      contacts: shouldIncludeContacts ? (customer.contacts || []) : [],
      tickets: [] // Don't include full tickets in list view
    }));

    const totalTime = Date.now() - startTime;
    
    return res.json(response);
  } catch (error) {
    const totalTime = Date.now() - startTime;
    return res.status(500).json({ error: 'Failed to fetch customers' });
  }
};


export const getCustomer = async (req: AuthenticatedRequest, res: Response) => {
  const startTime = Date.now();
  
  try {
    const id = req.params?.id ? parseInt(req.params.id, 10) : NaN;
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid customer ID' });
    }
    
    // Get query parameters for asset pagination
    const { assetsLimit, includeAssets } = req.query;
    const assetLimit = assetsLimit ? parseInt(assetsLimit as string, 10) : (includeAssets === 'true' ? 1000 : 5);
    
    // Role-based access control
    const userRole = req.user?.role;
    const userId = req.user?.id;
    
    if (userRole === 'ZONE_USER') {
      // Allow ZONE_USER to view customers in their assigned service zones
      const userWithZones = await prisma.user.findUnique({
        where: { id: userId },
        include: { serviceZones: { select: { serviceZoneId: true } } }
      });
      const zoneIds = (userWithZones?.serviceZones || []).map((sz: any) => sz.serviceZoneId);
      if (zoneIds.length === 0) {
        return res.status(403).json({ error: 'No zones assigned to user' });
      }
      const target = await prisma.customer.findUnique({ where: { id }, select: { serviceZoneId: true } });
      if (!target || !zoneIds.includes(target.serviceZoneId)) {
        return res.status(403).json({ error: 'Access denied to this customer' });
      }
    }
    
    
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        serviceZone: {
          select: {
            id: true,
            name: true
          }
        },
        contacts: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            createdAt: true,
            updatedAt: true
          },
          orderBy: { name: 'asc' }
        },
        // Dynamic asset limit based on query parameters
        assets: {
          select: {
            id: true,
            machineId: true,
            model: true,
            serialNo: true,
            location: true,
            status: true,
            createdAt: true,
            updatedAt: true
          } as const,
          take: assetLimit,
          orderBy: { machineId: 'asc' }
        },
        _count: {
          select: {
            assets: true,
            contacts: true,
            tickets: true
          }
        }
      }
    });
    
    const queryTime = Date.now() - startTime;

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const totalTime = Date.now() - startTime;
    
    return res.json(customer);
  } catch (error) {
    const totalTime = Date.now() - startTime;
    return res.status(500).json({ error: 'Failed to fetch customer' });
  }
};

export const createCustomer = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { 
      companyName, 
      address, 
      industry, 
      timezone, 
      serviceZoneId, 
      isActive,
      contactName,
      contactPhone,
      contactEmail
    } = req.body;

    // Validate required fields
    if (!companyName || !contactName || !contactPhone) {
      return res.status(400).json({ 
        error: 'Missing required fields: companyName, contactName, and contactPhone are required' 
      });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Check if company name already exists
    const existingCustomer = await prisma.customer.findFirst({
      where: { companyName }
    });

    if (existingCustomer) {
      return res.status(400).json({ error: 'A customer with this company name already exists' });
    }

    // Create customer and contact in a single transaction
    const result = await prisma.$transaction(async (tx: any) => {
      // First, create the customer
      const customer = await tx.customer.create({
        data: {
          companyName,
          address: address || null,
          industry: industry || null,
          timezone: timezone || 'UTC',
          isActive: isActive !== undefined ? isActive : true,
          createdById: req.user!.id,
          updatedById: req.user!.id,
          ...(serviceZoneId && { serviceZoneId })
        }
      });

      // Then, create the contact
      const contact = await tx.contact.create({
        data: {
          name: contactName,
          email: contactEmail || null,
          phone: contactPhone,
          role: 'ACCOUNT_OWNER',
          customerId: customer.id
        }
      });

      return {
        customer,
        contact: {
          id: contact.id,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          role: contact.role
        }
      };
    });

    return res.status(201).json({
      message: 'Customer and contact created successfully',
      data: result
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create customer' });
  }
};

export const updateCustomer = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      companyName, 
      address, 
      industry, 
      timezone, 
      serviceZoneId, 
      isActive,
      contactName,
      contactPhone
    } = req.body;

    const customerId = id ? parseInt(id, 10) : NaN;
    if (isNaN(customerId)) {
      return res.status(400).json({ message: 'Invalid customer ID' });
    }
    
    // Check if customer exists
    const existingCustomer = await prisma.customer.findUnique({
      where: { id: customerId }
    });

    if (!existingCustomer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check if company name is being changed and if it's already in use
    if (companyName && companyName !== existingCustomer.companyName) {
      const companyExists = await prisma.customer.findFirst({
        where: { 
          companyName,
          id: { not: Number(id) }
        }
      });

      if (companyExists) {
        return res.status(400).json({ error: 'A customer with this company name already exists' });
      }
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const updateData: any = {
      companyName,
      address,
      industry,
      timezone: timezone || existingCustomer.timezone || 'UTC',
      isActive: isActive !== undefined ? isActive : existingCustomer.isActive,
      updatedById: req.user.id,
    };

    // Only update serviceZone if serviceZoneId is provided
    if (serviceZoneId !== undefined) {
      updateData.serviceZoneId = serviceZoneId;
    }

    // Update customer and contact in a single transaction
    const result = await prisma.$transaction(async (tx: any) => {
      // First, update the customer
      const updatedCustomer = await tx.customer.update({
        where: { id: Number(id) },
        data: updateData,
      });

      // Then, update or create the contact if contact data is provided
      if (contactName || contactPhone) {
        // Check if customer already has a contact with ACCOUNT_OWNER role
        const existingContact = await tx.contact.findFirst({
          where: { 
            customerId: Number(id),
            role: 'ACCOUNT_OWNER'
          }
        });

        if (existingContact) {
          // Update existing contact
          await tx.contact.update({
            where: { id: existingContact.id },
            data: {
              name: contactName || existingContact.name,
              phone: contactPhone || existingContact.phone
            }
          });
        } else {
          // Create new contact if none exists
          await tx.contact.create({
            data: {
              name: contactName || '',
              phone: contactPhone || '',
              role: 'ACCOUNT_OWNER',
              customerId: Number(id)
            }
          });
        }
      }

      return updatedCustomer;
    });

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update customer' });
  }
};

export const deleteCustomer = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const customerId = req.params?.id ? parseInt(req.params.id, 10) : NaN;
    if (isNaN(customerId)) {
      return res.status(400).json({ message: 'Invalid customer ID' });
    }
    
    // Check if customer exists
    const existingCustomer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        _count: {
          select: {
            assets: true,
            contacts: true,
            tickets: true
          }
        }
      }
    });

    if (!existingCustomer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Prevent deletion if customer has related records
    if (existingCustomer._count.assets > 0 || existingCustomer._count.contacts > 0 || existingCustomer._count.tickets > 0) {
      return res.status(400).json({
        error: 'Cannot delete customer with related records',
        details: {
          assets: existingCustomer._count.assets,
          contacts: existingCustomer._count.contacts,
          tickets: existingCustomer._count.tickets
        }
      });
    }

    await prisma.customer.delete({
      where: { id: customerId }
    });

    return res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete customer' });
  }
};
