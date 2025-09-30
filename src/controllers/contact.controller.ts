import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/db';
import bcrypt from 'bcryptjs';

// Define enum types based on Prisma schema
type ContactRole = 'ACCOUNT_OWNER' | 'CONTACT';

// Define custom types for Prisma inputs
type ContactWhereInput = {
  id?: number;
  customerId?: number;
  name?: { contains?: string; mode?: 'insensitive' };
  email?: { contains?: string; mode?: 'insensitive' };
  phone?: { contains?: string };
  role?: ContactRole;
  customer?: {
    companyName?: { contains?: string; mode?: 'insensitive' };
  };
  OR?: ContactWhereInput[];
  AND?: ContactWhereInput[];
};

// Helper function to get user from request
function getUserFromRequest(req: Request) {
  return (req as any).user;
}

export const listContacts = async (req: Request, res: Response) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id: customerId } = req.params;
    const { search = '', page = 1, limit = 10 } = req.query;
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    const where: ContactWhereInput = {
      customerId: parseInt(customerId)
    };
    
    // Add search filter if provided
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string } },
        { role: search as ContactRole }
      ];
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          customer: {
            select: {
              id: true,
              companyName: true
            }
          },
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.contact.count({ where })
    ]);

    return res.json({
      data: contacts,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch contacts' });
  }
};

export const getContact = async (req: Request, res: Response) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id: customerId, contactId } = req.params;
    
    const contact = await prisma.contact.findFirst({
      where: { 
        id: parseInt(contactId),
        customerId: parseInt(customerId)
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

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    return res.json(contact);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch contact' });
  }
};

// Interface for contact create/update data
interface ContactData {
  name: string;
  email?: string | null;
  phone: string;
  role: ContactRole;
  customerId: number;
}

export const createContact = async (req: Request, res: Response) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id: customerId } = req.params;
    const { name, email, phone, role = 'CONTACT', password } = req.body;

    // Validate required fields
    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    // Allow multiple contacts with same phone number for same customer
    // Removed phone number uniqueness validation

    // If email is provided, check if user with email already exists globally
    if (email) {
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        return res.status(400).json({ error: 'A user with this email already exists' });
      }
    }

    // If this is set as ACCOUNT_OWNER, unset any existing ACCOUNT_OWNER
    if (role === 'ACCOUNT_OWNER') {
      await prisma.contact.updateMany({
        where: { 
          customerId: parseInt(customerId),
          role: 'ACCOUNT_OWNER'
        },
        data: { role: 'CONTACT' }
      });
    }

    // Create contact and user in a single transaction
    const result = await prisma.$transaction(async (tx: any) => {
      // Create the contact
      const contact = await tx.contact.create({
        data: {
          name,
          email: email || null,
          phone,
          role,
          customer: {
            connect: { id: parseInt(customerId) }
          }
        }
      });

      // If password is provided, create a user account
      let user = null;
      if (password && email) {
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        user = await tx.user.create({
          data: {
            email,
            password: hashedPassword,
            role: 'ZONE_USER',
            customerId: parseInt(customerId),
            tokenVersion: '1', // Initialize token version
            name: name || email.split('@')[0] // Use contact name or email prefix as name
          }
        });

        // Note: passwordHash field is not in the current Contact model
        // We'll need to add it via migration if needed
      }

      return {
        contact,
        user: user ? {
          id: user.id,
          email: user.email,
          role: user.role
        } : null
      };
    });

    return res.status(201).json({
      message: 'Contact created successfully',
      data: result
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create contact' });
  }
};

export const updateContact = async (req: Request, res: Response) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id, contactId } = req.params;
    const {
      name,
      email,
      phone,
      designation,
      isPrimary,
      status,
      notes
    } = req.body;

    // Check if contact exists
    const existingContact = await prisma.contact.findFirst({
      where: { 
        id: parseInt(contactId),
        customerId: parseInt(id)
      }
    });

    if (!existingContact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // If email is being updated, check for duplicates
    if (email && email !== existingContact.email) {
      const emailExists = await prisma.contact.findFirst({
        where: { 
          email,
          customerId: parseInt(id),
          id: { not: parseInt(contactId) }
        }
      });

      if (emailExists) {
        return res.status(400).json({ error: 'Email already in use by another contact for this customer' });
      }
    }

    // If this is set as primary, unset any existing primary contact
    if (isPrimary === true) {
      await prisma.contact.updateMany({
        where: { 
          customerId: parseInt(id),
          role: 'ACCOUNT_OWNER',
          id: { not: parseInt(contactId) }
        },
        data: { role: 'CONTACT' }
      });
    }

    // Prepare update data with only the fields that exist on the Contact model
    const updateData: any = {
      name,
      email,
      phone,
      role: req.body.role || existingContact.role,
      updatedAt: new Date()
    };

    // Only include designation if it exists in the request
    if (designation !== undefined) {
      updateData.designation = designation;
    }

    const updatedContact = await prisma.contact.update({
      where: { id: parseInt(contactId) },
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

    return res.json(updatedContact);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update contact' });
  }
};

export const deleteContact = async (req: Request, res: Response) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id, contactId } = req.params;

    // Check if contact exists
    const contact = await prisma.contact.findFirst({
      where: { 
        id: parseInt(contactId),
        customerId: parseInt(id)
      }
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Check if this is the last contact for the customer
    const contactCount = await prisma.contact.count({
      where: { 
        customerId: parseInt(id)
      }
    });

    if (contactCount <= 1) {
      return res.status(400).json({ 
        error: 'Cannot delete the only contact for this customer.'
      });
    }

    await prisma.contact.delete({
      where: { id: parseInt(contactId) }
    });

    return res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete contact' });
  }
};

// Admin: Get all contacts with pagination and search
export const listAllContacts = async (req: Request, res: Response) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { search = '', page = 1, limit = 10, customerId } = req.query;
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    const where: ContactWhereInput = {};
    
    // Add customer filter if provided
    if (customerId) {
      where.customerId = parseInt(customerId as string);
    }
    
    // Add search filter if provided
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string } },
        { role: search as ContactRole },
        {
          customer: {
            companyName: { contains: search as string, mode: 'insensitive' }
          }
        }
      ];
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          customer: {
            select: {
              id: true,
              companyName: true
            }
          },
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.contact.count({ where })
    ]);

    return res.json({
      data: contacts,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch contacts' });
  }
};

// Admin: Get contact by ID
export const getContactById = async (req: Request, res: Response) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const id = req.params?.id ? parseInt(req.params.id, 10) : NaN;
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid contact ID' });
    }
    
    const contact = await prisma.contact.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            companyName: true
          }
        }
      }
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    return res.json(contact);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch contact' });
  }
};

// Admin: Create a new contact
export const createContactAdmin = async (req: Request, res: Response) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { name, email, phone, role = 'CONTACT', customerId } = req.body;

    // Validate required fields
    if (!name || !phone || !customerId) {
      return res.status(400).json({ error: 'Name, phone, and customer ID are required' });
    }

    // Allow multiple contacts with same phone number for same customer
    // Removed phone number uniqueness validation

    // If email is provided, check if contact with email already exists globally
    if (email) {
      const existingEmailContact = await prisma.contact.findFirst({
        where: { email }
      });

      if (existingEmailContact) {
        return res.status(400).json({ error: 'Contact with this email already exists' });
      }
    }

    // Check if customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: parseInt(customerId) }
    });

    if (!customer) {
      return res.status(400).json({ error: 'Customer not found' });
    }

    // If this is set as ACCOUNT_OWNER, unset any existing ACCOUNT_OWNER for this customer
    if (role === 'ACCOUNT_OWNER') {
      await prisma.contact.updateMany({
        where: { 
          customerId: parseInt(customerId),
          role: 'ACCOUNT_OWNER'
        },
        data: { role: 'CONTACT' }
      });
    }

    const contact = await prisma.contact.create({
      data: {
        name,
        email: email || null,
        phone,
        role,
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

    return res.status(201).json(contact);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create contact' });
  }
};

// Admin: Update contact
export const updateContactAdmin = async (req: Request, res: Response) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const { name, email, phone, role, customerId } = req.body;

    const contactId = id ? parseInt(id, 10) : NaN;
    if (isNaN(contactId)) {
      return res.status(400).json({ message: 'Invalid contact ID' });
    }
    
    // Check if contact exists
    const existingContact = await prisma.contact.findUnique({
      where: { id: contactId }
    });

    if (!existingContact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // If email is being updated, check for duplicates
    if (email && email !== existingContact.email) {
      const emailExists = await prisma.contact.findFirst({
        where: { 
          email,
          id: { not: parseInt(id) } // Exclude current contact from check
        }
      });

      if (emailExists) {
        return res.status(400).json({ error: 'Email already in use by another contact' });
      }
    }

    // If customer is being changed, check if new customer exists
    if (customerId && customerId !== existingContact.customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: parseInt(customerId) }
      });

      if (!customer) {
        return res.status(400).json({ error: 'Customer not found' });
      }
    }

    // If this is set as ACCOUNT_OWNER, unset any existing ACCOUNT_OWNER for the customer
    if (role === 'ACCOUNT_OWNER') {
      const targetCustomerId = customerId || existingContact.customerId;
      await prisma.contact.updateMany({
        where: { 
          customerId: parseInt(targetCustomerId.toString()),
          role: 'ACCOUNT_OWNER',
          id: { not: contactId }
        },
        data: { role: 'CONTACT' }
      });
    }

    const updateData: any = {
      name,
      email,
      phone,
      role
    };

    // Only update customer if provided
    if (customerId) {
      updateData.customer = { connect: { id: parseInt(customerId) } };
    }

    const updatedContact = await prisma.contact.update({
      where: { id: contactId },
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

    return res.json(updatedContact);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update contact' });
  }
};

// Admin: Delete contact
export const deleteContactAdmin = async (req: Request, res: Response) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const contactId = req.params?.id ? parseInt(req.params.id, 10) : NaN;
    if (isNaN(contactId)) {
      return res.status(400).json({ message: 'Invalid contact ID' });
    }
    
    // Check if contact exists
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        _count: {
          select: {
            tickets: true
          }
        }
      }
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Check if this is the last contact for the customer
    const contactCount = await prisma.contact.count({
      where: { 
        customerId: contact.customerId
      }
    });

    if (contactCount <= 1) {
      return res.status(400).json({ 
        error: 'Cannot delete the only contact for this customer.'
      });
    }

    // Prevent deletion if contact has related tickets
    if (contact._count.tickets > 0) {
      return res.status(400).json({
        error: 'Cannot delete contact with related tickets',
        details: {
          tickets: contact._count.tickets
        }
      });
    }

    await prisma.contact.delete({
      where: { id: contactId }
    });

    return res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete contact' });
  }
};
