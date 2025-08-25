"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCustomer = exports.updateCustomer = exports.createCustomer = exports.getCustomer = exports.listCustomers = void 0;
const db_1 = __importDefault(require("../config/db"));
const listCustomers = async (req, res) => {
    try {
        const { search = '', page = 1, limit = 10 } = req.query;
        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;
        const where = {};
        // Add search filter if provided
        if (search) {
            where.OR = [
                { companyName: { contains: search, mode: 'insensitive' } },
                { industry: { contains: search, mode: 'insensitive' } },
                {
                    contacts: {
                        some: {
                            OR: [
                                { name: { contains: search, mode: 'insensitive' } },
                                { email: { contains: search, mode: 'insensitive' } },
                                { phone: { contains: search } },
                            ]
                        }
                    }
                }
            ];
        }
        const [customers, total] = await Promise.all([
            db_1.default.customer.findMany({
                where,
                skip,
                take: limitNum,
                orderBy: { companyName: 'asc' },
                select: {
                    id: true,
                    companyName: true,
                    address: true,
                    industry: true,
                    timezone: true,
                    serviceZone: {
                        select: {
                            id: true,
                            name: true
                        }
                    },
                    isActive: true,
                    createdAt: true,
                    updatedAt: true,
                    _count: {
                        select: {
                            assets: true,
                            contacts: true,
                            tickets: true
                        }
                    },
                    serviceZoneId: true
                }
            }),
            db_1.default.customer.count({ where })
        ]);
        return res.json({
            data: customers,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    }
    catch (error) {
        console.error('Error listing customers:', error);
        return res.status(500).json({ error: 'Failed to fetch customers' });
    }
};
exports.listCustomers = listCustomers;
const getCustomer = async (req, res) => {
    try {
        const id = req.params?.id ? parseInt(req.params.id, 10) : NaN;
        if (isNaN(id)) {
            return res.status(400).json({ message: 'Invalid customer ID' });
        }
        const customer = await db_1.default.customer.findUnique({
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
    }
    catch (error) {
        console.error('Error fetching customer:', error);
        return res.status(500).json({ error: 'Failed to fetch customer' });
    }
};
exports.getCustomer = getCustomer;
const createCustomer = async (req, res) => {
    try {
        const { companyName, address, industry, timezone, serviceZoneId, isActive } = req.body;
        // Validate required fields
        if (!companyName) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        // Check if company name already exists
        const existingCustomer = await db_1.default.customer.findFirst({
            where: {
                companyName
            }
        });
        if (!req.user) {
            return res.status(401).json({ message: 'User not authenticated' });
        }
        // First, create the customer without the relations
        const customerData = {
            companyName,
            address: address || null,
            industry: industry || null,
            timezone: timezone || 'UTC',
            isActive: isActive !== undefined ? isActive : true,
            createdById: req.user.id,
            updatedById: req.user.id
        };
        // Add serviceZone relation if serviceZoneId is provided
        // Create the customer with basic data first
        const customer = await db_1.default.customer.create({
            data: {
                ...customerData,
                ...(serviceZoneId && { serviceZoneId })
            }
        });
        // Then fetch with all relations
        const customerWithRelations = await db_1.default.customer.findUnique({
            where: { id: customer.id },
            include: {
                serviceZone: true,
                createdBy: {
                    select: {
                        id: true,
                        email: true
                    }
                },
                updatedBy: {
                    select: {
                        id: true,
                        email: true
                    }
                }
            }
        });
        return res.status(201).json(customer);
    }
    catch (error) {
        console.error('Error creating customer:', error);
        return res.status(500).json({ error: 'Failed to create customer' });
    }
};
exports.createCustomer = createCustomer;
const updateCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const { companyName, address, industry, timezone, serviceZoneId, isActive } = req.body;
        const customerId = id ? parseInt(id, 10) : NaN;
        if (isNaN(customerId)) {
            return res.status(400).json({ message: 'Invalid customer ID' });
        }
        // Check if customer exists
        const existingCustomer = await db_1.default.customer.findUnique({
            where: { id: customerId }
        });
        if (!existingCustomer) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        // Check if company name is being changed and if it's already in use
        if (companyName && companyName !== existingCustomer.companyName) {
            const companyExists = await db_1.default.customer.findFirst({
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
        const updateData = {
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
        const updatedCustomer = await db_1.default.customer.update({
            where: { id: Number(id) },
            data: updateData,
        });
        return res.json(updatedCustomer);
    }
    catch (error) {
        console.error('Error updating customer:', error);
        return res.status(500).json({ error: 'Failed to update customer' });
    }
};
exports.updateCustomer = updateCustomer;
const deleteCustomer = async (req, res) => {
    try {
        const customerId = req.params?.id ? parseInt(req.params.id, 10) : NaN;
        if (isNaN(customerId)) {
            return res.status(400).json({ message: 'Invalid customer ID' });
        }
        // Check if customer exists
        const existingCustomer = await db_1.default.customer.findUnique({
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
        await db_1.default.customer.delete({
            where: { id: customerId }
        });
        return res.json({ message: 'Customer deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting customer:', error);
        return res.status(500).json({ error: 'Failed to delete customer' });
    }
};
exports.deleteCustomer = deleteCustomer;
