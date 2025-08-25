"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAssetDetails = exports.getAssetStats = exports.getCustomerAssets = exports.deleteAsset = exports.updateAsset = exports.createAsset = exports.getAsset = exports.listAssets = void 0;
const db_1 = __importDefault(require("../config/db"));
// Get all assets with pagination and search (Admin only)
const listAssets = async (req, res) => {
    try {
        const { search = '', page = 1, limit = 10, customerId } = req.query;
        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;
        const where = {};
        // Role-based filtering
        const userRole = req.user?.role;
        const userCustomerId = req.user?.customerId;
        if (userRole === 'ADMIN') {
            // Admin can view all assets
            if (customerId) {
                where.customerId = parseInt(customerId);
            }
        }
        else if (userRole === 'CUSTOMER_ACCOUNT_OWNER' || userRole === 'CUSTOMER_CONTACT') {
            // CustomerOwner and CustomerContact can only view their own customer's assets
            if (!userCustomerId) {
                return res.status(403).json({ error: 'Customer ID not found for user' });
            }
            where.customerId = userCustomerId;
        }
        else if (userRole === 'SERVICE_PERSON') {
            // ServicePerson can only view assets linked to tickets assigned to them
            where.tickets = {
                some: {
                    assignedToId: req.user?.id
                }
            };
        }
        else {
            return res.status(403).json({ error: 'Insufficient permissions to view assets' });
        }
        // Add search filter if provided
        if (search) {
            where.OR = [
                { machineId: { contains: search, mode: 'insensitive' } },
                { model: { contains: search, mode: 'insensitive' } },
                { serialNo: { contains: search, mode: 'insensitive' } },
                {
                    customer: {
                        companyName: { contains: search, mode: 'insensitive' }
                    }
                }
            ];
        }
        const [assets, total] = await Promise.all([
            db_1.default.asset.findMany({
                where,
                skip,
                take: limitNum,
                orderBy: { machineId: 'asc' },
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
            db_1.default.asset.count({ where })
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
    }
    catch (error) {
        console.error('Error listing assets:', error);
        return res.status(500).json({ error: 'Failed to fetch assets' });
    }
};
exports.listAssets = listAssets;
// Get asset by ID
const getAsset = async (req, res) => {
    try {
        const id = req.params?.id ? parseInt(req.params.id, 10) : NaN;
        if (isNaN(id)) {
            return res.status(400).json({ message: 'Invalid asset ID' });
        }
        const asset = await db_1.default.asset.findUnique({
            where: { id },
            include: {
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
            }
        });
        if (!asset) {
            return res.status(404).json({ error: 'Asset not found' });
        }
        // Role-based access control
        const userRole = req.user?.role;
        const userCustomerId = req.user?.customerId;
        if (userRole === 'ADMIN') {
            // Admin can view any asset
        }
        else if (userRole === 'CUSTOMER_ACCOUNT_OWNER' || userRole === 'CUSTOMER_CONTACT') {
            // CustomerOwner and CustomerContact can only view their own customer's assets
            if (!userCustomerId || asset.customerId !== userCustomerId) {
                return res.status(403).json({ error: 'Access denied to this asset' });
            }
        }
        else if (userRole === 'SERVICE_PERSON') {
            // ServicePerson can only view assets linked to tickets assigned to them
            const hasAssignedTickets = await db_1.default.ticket.findFirst({
                where: {
                    assetId: id,
                    assignedToId: req.user?.id
                }
            });
            if (!hasAssignedTickets) {
                return res.status(403).json({ error: 'Access denied to this asset' });
            }
        }
        else {
            return res.status(403).json({ error: 'Insufficient permissions to view this asset' });
        }
        return res.json(asset);
    }
    catch (error) {
        console.error('Error fetching asset:', error);
        return res.status(500).json({ error: 'Failed to fetch asset' });
    }
};
exports.getAsset = getAsset;
// Create a new asset
const createAsset = async (req, res) => {
    try {
        const { machineId, model, serialNo, purchaseDate, warrantyStart, warrantyEnd, amcStart, amcEnd, location, status, customerId } = req.body;
        // Validate required fields
        if (!machineId || !customerId) {
            return res.status(400).json({ error: 'Machine ID and Customer ID are required' });
        }
        // Check if machineId already exists
        const existingMachine = await db_1.default.asset.findUnique({
            where: { machineId }
        });
        if (existingMachine) {
            return res.status(400).json({ error: 'Machine ID already exists' });
        }
        // Check if serialNo is unique for this customer
        if (serialNo) {
            const existingSerial = await db_1.default.asset.findFirst({
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
        const customer = await db_1.default.customer.findUnique({
            where: { id: parseInt(customerId) }
        });
        if (!customer) {
            return res.status(400).json({ error: 'Customer not found' });
        }
        const asset = await db_1.default.asset.create({
            data: {
                machineId,
                model,
                serialNo,
                purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
                warrantyStart: warrantyStart ? new Date(warrantyStart) : null,
                warrantyEnd: warrantyEnd ? new Date(warrantyEnd) : null,
                amcStart: amcStart ? new Date(amcStart) : null,
                amcEnd: amcEnd ? new Date(amcEnd) : null,
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
    }
    catch (error) {
        console.error('Error creating asset:', error);
        return res.status(500).json({ error: 'Failed to create asset' });
    }
};
exports.createAsset = createAsset;
// Update asset
const updateAsset = async (req, res) => {
    try {
        const { id } = req.params;
        const { machineId, model, serialNo, purchaseDate, warrantyStart, warrantyEnd, amcStart, amcEnd, location, status, customerId } = req.body;
        const assetId = id ? parseInt(id, 10) : NaN;
        if (isNaN(assetId)) {
            return res.status(400).json({ message: 'Invalid asset ID' });
        }
        // Check if asset exists
        const existingAsset = await db_1.default.asset.findUnique({
            where: { id: assetId }
        });
        if (!existingAsset) {
            return res.status(404).json({ error: 'Asset not found' });
        }
        // Check if machineId is being changed and if it's already in use
        if (machineId && machineId !== existingAsset.machineId) {
            const machineExists = await db_1.default.asset.findUnique({
                where: { machineId }
            });
            if (machineExists) {
                return res.status(400).json({ error: 'Machine ID already exists' });
            }
        }
        // Check if serialNo is being changed and if it's unique for this customer
        if (serialNo && serialNo !== existingAsset.serialNo) {
            const serialExists = await db_1.default.asset.findFirst({
                where: {
                    serialNo,
                    customerId: customerId || existingAsset.customerId,
                    id: { not: assetId }
                }
            });
            if (serialExists) {
                return res.status(400).json({ error: 'Serial number already exists for this customer' });
            }
        }
        const updateData = {
            machineId,
            model,
            serialNo,
            purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
            warrantyStart: warrantyStart ? new Date(warrantyStart) : null,
            warrantyEnd: warrantyEnd ? new Date(warrantyEnd) : null,
            amcStart: amcStart ? new Date(amcStart) : null,
            amcEnd: amcEnd ? new Date(amcEnd) : null,
            location,
            status
        };
        // Only update customer if provided
        if (customerId) {
            updateData.customer = { connect: { id: parseInt(customerId) } };
        }
        const updatedAsset = await db_1.default.asset.update({
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
    }
    catch (error) {
        console.error('Error updating asset:', error);
        return res.status(500).json({ error: 'Failed to update asset' });
    }
};
exports.updateAsset = updateAsset;
// Delete asset
const deleteAsset = async (req, res) => {
    try {
        const assetId = req.params?.id ? parseInt(req.params.id, 10) : NaN;
        if (isNaN(assetId)) {
            return res.status(400).json({ message: 'Invalid asset ID' });
        }
        // Check if asset exists
        const existingAsset = await db_1.default.asset.findUnique({
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
        // Prevent deletion if asset has related tickets
        if (existingAsset._count.tickets > 0) {
            return res.status(400).json({
                error: 'Cannot delete asset with related tickets',
                details: {
                    tickets: existingAsset._count.tickets
                }
            });
        }
        await db_1.default.asset.delete({
            where: { id: assetId }
        });
        return res.json({ message: 'Asset deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting asset:', error);
        return res.status(500).json({ error: 'Failed to delete asset' });
    }
};
exports.deleteAsset = deleteAsset;
// Legacy functions for backward compatibility
const getCustomerAssets = async (req, res) => {
    try {
        const customerId = parseInt(req.params.customerId);
        const { status } = req.query;
        // Check if the authenticated user has access to this customer's assets
        const user = req.user;
        if (user.role !== 'ADMIN' && user.customerId !== customerId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const assets = await db_1.default.asset.findMany({
            where: {
                customerId,
                ...(status ? { status: String(status) } : {})
            },
            select: {
                id: true,
                machineId: true,
                model: true,
                serialNo: true,
                purchaseDate: true,
                warrantyEnd: true,
                amcEnd: true,
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
    }
    catch (error) {
        console.error('Error fetching customer assets:', error);
        return res.status(500).json({ error: 'Failed to fetch assets' });
    }
};
exports.getCustomerAssets = getCustomerAssets;
const getAssetStats = async (req, res) => {
    try {
        const userRole = req.user?.role;
        const userCustomerId = req.user?.customerId;
        let where = {};
        // Role-based filtering
        if (userRole === 'CUSTOMER_ACCOUNT_OWNER' || userRole === 'CUSTOMER_CONTACT') {
            if (!userCustomerId) {
                return res.status(403).json({ error: 'Customer ID not found for user' });
            }
            where.customerId = userCustomerId;
        }
        else if (userRole === 'SERVICE_PERSON') {
            // ServicePerson can only view assets linked to tickets assigned to them
            where.tickets = {
                some: {
                    assignedToId: req.user?.id
                }
            };
        }
        // Admin can view all assets (no additional filtering)
        const [total, active, maintenance, inactive] = await Promise.all([
            db_1.default.asset.count({ where }),
            db_1.default.asset.count({ where: { ...where, status: 'ACTIVE' } }),
            db_1.default.asset.count({ where: { ...where, status: 'MAINTENANCE' } }),
            db_1.default.asset.count({ where: { ...where, status: 'INACTIVE' } })
        ]);
        return res.json({
            total,
            active,
            maintenance,
            inactive
        });
    }
    catch (error) {
        console.error('Error fetching asset stats:', error);
        return res.status(500).json({ error: 'Failed to fetch asset statistics' });
    }
};
exports.getAssetStats = getAssetStats;
const getAssetDetails = async (req, res) => {
    try {
        const assetId = parseInt(req.params.id);
        const asset = await db_1.default.asset.findUnique({
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
        const user = req.user;
        if (user.role !== 'ADMIN' && user.customerId !== asset.customerId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        return res.json(asset);
    }
    catch (error) {
        console.error('Error fetching asset details:', error);
        return res.status(500).json({ error: 'Failed to fetch asset details' });
    }
};
exports.getAssetDetails = getAssetDetails;
