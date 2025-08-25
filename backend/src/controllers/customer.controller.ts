import { Request, Response } from 'express';
import { Prisma, Customer, UserRole } from '@prisma/client';
import prisma from '../config/db';
import bcrypt from 'bcryptjs';

// Using the global type declaration from @types/express

// Interface for customer list response
export interface CustomerListResponse extends Omit<Customer, 'createdAt' | 'updatedAt' | 'createdById' | 'updatedById'> {
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
  try {
    const { search = '', includeAssets } = req.query;
    const where: Prisma.CustomerWhereInput = {};
    
    // Role-based filtering
    const userRole = req.user?.role;
    const userCustomerId = req.user?.customerId;
    
    if (userRole === 'ADMIN') {
      // Admin can view all customers
    } else if (userRole === 'CUSTOMER_OWNER' || userRole === 'CUSTOMER_CONTACT') {
      if (!userCustomerId) {
        return res.status(403).json({ error: 'Customer ID not found for user' });
      }
      where.id = userCustomerId;
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

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { companyName: 'asc' },
      include: {
        serviceZone: {
          select: { id: true, name: true }
        },
        _count: {
          select: { assets: true, contacts: true, tickets: true }
        },
        contacts: {   // always include full contact info
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
        assets: {     // always include full asset info
          select: {
            id: true,
            machineId: true,
            model: true,
            serialNo: true,
            purchaseDate: true,
            warrantyStart: true,
            warrantyEnd: true,
            amcStart: true,
            amcEnd: true,
            location: true,
            status: true,
            createdAt: true,
            updatedAt: true
          },
          orderBy: { machineId: 'asc' }
        },
        tickets: {   // if you want tickets in the list too
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });
    
    

    return res.json(customers);
  } catch (error) {
    console.error('Error listing customers:', error);
    return res.status(500).json({ error: 'Failed to fetch customers' });
  }
};


export const getCustomer = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params?.id ? parseInt(req.params.id, 10) : NaN;
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid customer ID' });
    }
    
    // Role-based access control
    const userRole = req.user?.role;
    const userCustomerId = req.user?.customerId;
    
    if (userRole === 'CUSTOMER_OWNER' || userRole === 'CUSTOMER_CONTACT') {
      if (!userCustomerId || userCustomerId !== id) {
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
        assets: {
          select: {
            id: true,
            machineId: true,
            model: true,
            serialNo: true,
            purchaseDate: true,
            warrantyStart: true,
            warrantyEnd: true,
            amcStart: true,
            amcEnd: true,
            location: true,
            status: true,
            createdAt: true,
            updatedAt: true
          },
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

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    return res.json(customer);
  } catch (error) {
    console.error('Error fetching customer:', error);
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
      ownerEmail,
      ownerPassword,
      ownerName,
      ownerPhone
    } = req.body;

    // Validate required fields
    if (!companyName || !ownerEmail || !ownerPassword || !ownerName) {
      return res.status(400).json({ 
        error: 'Missing required fields: companyName, ownerEmail, ownerPassword, ownerName are required' 
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

    // Check if owner email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: ownerEmail }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }

    // Hash the owner password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(ownerPassword, saltRounds);

    // Create customer and owner user in a single transaction
    const result = await prisma.$transaction(async (tx) => {
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

      // Then, create the owner user
      const ownerUser = await tx.user.create({
        data: {
          email: ownerEmail,
          password: hashedPassword,
          role: 'CUSTOMER_OWNER',
          customerId: customer.id
        }
      });

      // Finally, create the owner contact
      const ownerContact = await tx.contact.create({
        data: {
          name: ownerName,
          email: ownerEmail,
          phone: ownerPhone || null,
          role: 'ACCOUNT_OWNER',
          customerId: customer.id
        }
      });

      return {
        customer,
        ownerUser: {
          id: ownerUser.id,
          email: ownerUser.email,
          role: ownerUser.role
        },
        ownerContact: {
          id: ownerContact.id,
          name: ownerContact.name,
          email: ownerContact.email,
          role: ownerContact.role
        }
      };
    });

    return res.status(201).json({
      message: 'Customer and owner created successfully',
      data: result
    });
  } catch (error) {
    console.error('Error creating customer:', error);
    return res.status(500).json({ error: 'Failed to create customer' });
  }
};

export const updateCustomer = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { companyName, address, industry, timezone, serviceZoneId, isActive } = req.body;

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
      updatedBy: { connect: { id: req.user.id } },
    };

    // Only update serviceZone if serviceZoneId is provided
    if (serviceZoneId !== undefined) {
      updateData.serviceZone = serviceZoneId 
        ? { connect: { id: serviceZoneId } } 
        : { disconnect: true };
    }

    const updatedCustomer = await prisma.customer.update({
      where: { id: Number(id) },
      data: updateData,
    });

    return res.json(updatedCustomer);
  } catch (error) {
    console.error('Error updating customer:', error);
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
    console.error('Error deleting customer:', error);
    return res.status(500).json({ error: 'Failed to delete customer' });
  }
};
