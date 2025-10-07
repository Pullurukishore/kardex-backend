"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteContactAdmin = exports.updateContactAdmin = exports.createContactAdmin = exports.getContactById = exports.listAllContacts = exports.deleteContact = exports.updateContact = exports.createContact = exports.getContact = exports.listContacts = void 0;
const db_1 = __importDefault(require("../config/db"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
// Helper function to get user from request
function getUserFromRequest(req) {
    return req.user;
}
const listContacts = async (req, res) => {
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
        const where = {
            customerId: parseInt(customerId)
        };
        // Add search filter if provided
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { role: search }
            ];
        }
        const [contacts, total] = await Promise.all([
            db_1.default.contact.findMany({
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
            db_1.default.contact.count({ where })
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
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to fetch contacts' });
    }
};
exports.listContacts = listContacts;
const getContact = async (req, res) => {
    try {
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { id: customerId, contactId } = req.params;
        const contact = await db_1.default.contact.findFirst({
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
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to fetch contact' });
    }
};
exports.getContact = getContact;
const createContact = async (req, res) => {
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
            const existingUser = await db_1.default.user.findUnique({
                where: { email }
            });
            if (existingUser) {
                return res.status(400).json({ error: 'A user with this email already exists' });
            }
        }
        // If this is set as ACCOUNT_OWNER, unset any existing ACCOUNT_OWNER
        if (role === 'ACCOUNT_OWNER') {
            await db_1.default.contact.updateMany({
                where: {
                    customerId: parseInt(customerId),
                    role: 'ACCOUNT_OWNER'
                },
                data: { role: 'CONTACT' }
            });
        }
        // Create contact and user in a single transaction
        const result = await db_1.default.$transaction(async (tx) => {
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
                const hashedPassword = await bcryptjs_1.default.hash(password, saltRounds);
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
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to create contact' });
    }
};
exports.createContact = createContact;
const updateContact = async (req, res) => {
    try {
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { id, contactId } = req.params;
        const { name, email, phone, designation, isPrimary, status, notes } = req.body;
        // Check if contact exists
        const existingContact = await db_1.default.contact.findFirst({
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
            const emailExists = await db_1.default.contact.findFirst({
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
            await db_1.default.contact.updateMany({
                where: {
                    customerId: parseInt(id),
                    role: 'ACCOUNT_OWNER',
                    id: { not: parseInt(contactId) }
                },
                data: { role: 'CONTACT' }
            });
        }
        // Prepare update data with only the fields that exist on the Contact model
        const updateData = {
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
        const updatedContact = await db_1.default.contact.update({
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
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to update contact' });
    }
};
exports.updateContact = updateContact;
const deleteContact = async (req, res) => {
    try {
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { id, contactId } = req.params;
        // Check if contact exists
        const contact = await db_1.default.contact.findFirst({
            where: {
                id: parseInt(contactId),
                customerId: parseInt(id)
            }
        });
        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }
        // Check if this is the last contact for the customer
        const contactCount = await db_1.default.contact.count({
            where: {
                customerId: parseInt(id)
            }
        });
        if (contactCount <= 1) {
            return res.status(400).json({
                error: 'Cannot delete the only contact for this customer.'
            });
        }
        await db_1.default.contact.delete({
            where: { id: parseInt(contactId) }
        });
        return res.json({ message: 'Contact deleted successfully' });
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to delete contact' });
    }
};
exports.deleteContact = deleteContact;
// Admin: Get all contacts with pagination and search
const listAllContacts = async (req, res) => {
    try {
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { search = '', page = 1, limit = 10, customerId } = req.query;
        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;
        const where = {};
        // Add customer filter if provided
        if (customerId) {
            where.customerId = parseInt(customerId);
        }
        // Add search filter if provided
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { role: search },
                {
                    customer: {
                        companyName: { contains: search, mode: 'insensitive' }
                    }
                }
            ];
        }
        const [contacts, total] = await Promise.all([
            db_1.default.contact.findMany({
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
            db_1.default.contact.count({ where })
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
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to fetch contacts' });
    }
};
exports.listAllContacts = listAllContacts;
// Admin: Get contact by ID
const getContactById = async (req, res) => {
    try {
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const id = req.params?.id ? parseInt(req.params.id, 10) : NaN;
        if (isNaN(id)) {
            return res.status(400).json({ message: 'Invalid contact ID' });
        }
        const contact = await db_1.default.contact.findUnique({
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
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to fetch contact' });
    }
};
exports.getContactById = getContactById;
// Admin: Create a new contact
const createContactAdmin = async (req, res) => {
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
            const existingEmailContact = await db_1.default.contact.findFirst({
                where: { email }
            });
            if (existingEmailContact) {
                return res.status(400).json({ error: 'Contact with this email already exists' });
            }
        }
        // Check if customer exists
        const customer = await db_1.default.customer.findUnique({
            where: { id: parseInt(customerId) }
        });
        if (!customer) {
            return res.status(400).json({ error: 'Customer not found' });
        }
        // If this is set as ACCOUNT_OWNER, unset any existing ACCOUNT_OWNER for this customer
        if (role === 'ACCOUNT_OWNER') {
            await db_1.default.contact.updateMany({
                where: {
                    customerId: parseInt(customerId),
                    role: 'ACCOUNT_OWNER'
                },
                data: { role: 'CONTACT' }
            });
        }
        const contact = await db_1.default.contact.create({
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
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to create contact' });
    }
};
exports.createContactAdmin = createContactAdmin;
// Admin: Update contact
const updateContactAdmin = async (req, res) => {
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
        const existingContact = await db_1.default.contact.findUnique({
            where: { id: contactId }
        });
        if (!existingContact) {
            return res.status(404).json({ error: 'Contact not found' });
        }
        // If email is being updated, check for duplicates
        if (email && email !== existingContact.email) {
            const emailExists = await db_1.default.contact.findFirst({
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
            const customer = await db_1.default.customer.findUnique({
                where: { id: parseInt(customerId) }
            });
            if (!customer) {
                return res.status(400).json({ error: 'Customer not found' });
            }
        }
        // If this is set as ACCOUNT_OWNER, unset any existing ACCOUNT_OWNER for the customer
        if (role === 'ACCOUNT_OWNER') {
            const targetCustomerId = customerId || existingContact.customerId;
            await db_1.default.contact.updateMany({
                where: {
                    customerId: parseInt(targetCustomerId.toString()),
                    role: 'ACCOUNT_OWNER',
                    id: { not: contactId }
                },
                data: { role: 'CONTACT' }
            });
        }
        const updateData = {
            name,
            email,
            phone,
            role
        };
        // Only update customer if provided
        if (customerId) {
            updateData.customer = { connect: { id: parseInt(customerId) } };
        }
        const updatedContact = await db_1.default.contact.update({
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
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to update contact' });
    }
};
exports.updateContactAdmin = updateContactAdmin;
// Admin: Delete contact
const deleteContactAdmin = async (req, res) => {
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
        const contact = await db_1.default.contact.findUnique({
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
        const contactCount = await db_1.default.contact.count({
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
        await db_1.default.contact.delete({
            where: { id: contactId }
        });
        return res.json({ message: 'Contact deleted successfully' });
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to delete contact' });
    }
};
exports.deleteContactAdmin = deleteContactAdmin;
