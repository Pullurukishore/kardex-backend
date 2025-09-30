"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAssetDetails = exports.getAssetStats = exports.getCustomerAssets = exports.deleteAsset = exports.updateAsset = exports.createAsset = exports.getAsset = exports.listAssets = void 0;
const db_1 = __importDefault(require("../config/db"));
// Helper function to get user from request
function getUserFromRequest(req) {
    return req.user;
}
// Get all assets with pagination and search
const listAssets = async (req, res) => {
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
        // Role-based filtering
        const userRole = user.role;
        const userCustomerId = user.customerId;
        if (userRole === 'ADMIN') {
            // Admin can view all assets
            if (customerId) {
                where.customerId = parseInt(customerId);
            }
        }
        else if (userRole === 'ZONE_USER') {
            // Zone users: if bound to a customer, restrict to that customer
            if (userCustomerId) {
                where.customerId = userCustomerId;
                // Optionally narrow further if query customerId matches
                if (customerId && parseInt(customerId) !== userCustomerId) {
                    return res.status(403).json({ error: 'Access denied to requested customer assets' });
                }
            }
            else {
                // If no direct customer mapping, allow assets in user's service zones
                const zones = await db_1.default.servicePersonZone.findMany({
                    where: { userId: user.id },
                    select: { serviceZoneId: true }
                });
                const zoneIds = zones.map(z => z.serviceZoneId);
                if (zoneIds.length === 0) {
                    return res.status(403).json({ error: 'No assigned zones found for user' });
                }
                // Filter by customers that belong to those zones
                where.customer = { serviceZoneId: { in: zoneIds } };
                if (customerId) {
                    // Validate requested customer is within allowed zones
                    const customer = await db_1.default.customer.findUnique({
                        where: { id: parseInt(customerId) },
                        select: { serviceZoneId: true }
                    });
                    if (!customer || !zoneIds.includes(customer.serviceZoneId)) {
                        return res.status(403).json({ error: 'Access denied to requested customer assets' });
                    }
                    // Narrow by customer as requested
                    delete where.customer; // replace zone filter with exact customer filter
                    where.customerId = parseInt(customerId);
                }
            }
        }
        else if (userRole === 'SERVICE_PERSON') {
            // ServicePerson can only view assets linked to tickets assigned to them
            where.tickets = {
                some: {
                    assignedToId: user.id
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
        return res.status(500).json({ error: 'Failed to fetch assets' });
    }
};
exports.listAssets = listAssets;
const getAsset = async (req, res) => {
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
        }
        else if (userRole === 'ZONE_USER') {
            // Zone users can only view their own customer's assets
            if (!userCustomerId || userCustomerId !== asset.customerId) {
                return res.status(403).json({ error: 'Access denied to this asset' });
            }
        }
        else if (userRole === 'SERVICE_PERSON') {
            // ServicePerson can view assets in their service zones
            const serviceZones = await db_1.default.servicePersonZone.findMany({
                where: { userId: user.id },
                select: { serviceZoneId: true }
            });
            const hasZoneAccess = serviceZones.some((sz) => asset.customer && 'serviceZoneId' in asset.customer &&
                asset.customer.serviceZoneId === sz.serviceZoneId);
            const hasTicketAccess = await db_1.default.ticket.findFirst({
                where: {
                    assetId: assetId,
                    assignedToId: user.id
                }
            });
            if (!hasZoneAccess && !hasTicketAccess) {
                return res.status(403).json({ error: 'Access denied to this asset' });
            }
        }
        else {
            return res.status(403).json({ error: 'Insufficient permissions to view this asset' });
        }
        return res.json(asset);
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to fetch asset' });
    }
};
exports.getAsset = getAsset;
// Create a new asset
const createAsset = async (req, res) => {
    try {
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { machineId, model, serialNo, purchaseDate, warrantyStart, warrantyEnd, amcStart, amcEnd, location, status, customerId } = req.body;
        // Validate required fields
        if (!machineId || !customerId) {
            return res.status(400).json({ error: 'Machine ID and Customer ID are required' });
        }
        // Role-based access control
        const userRole = user.role;
        const userCustomerId = user.customerId;
        if (userRole === 'ADMIN') {
            // Admin can create assets for any customer
        }
        else if (userRole === 'ZONE_USER') {
            // Zone users can only create assets for their own customer
            if (!userCustomerId || userCustomerId !== parseInt(customerId)) {
                return res.status(403).json({ error: 'You can only create assets for your own customer' });
            }
        }
        else {
            return res.status(403).json({ error: 'Insufficient permissions to create assets' });
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
        return res.status(500).json({ error: 'Failed to create asset' });
    }
};
exports.createAsset = createAsset;
// Update asset
const updateAsset = async (req, res) => {
    try {
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
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
        // Role-based access control
        const userRole = user.role;
        const userCustomerId = user.customerId;
        if (userRole === 'ADMIN') {
            // Admin can update any asset
        }
        else if (userRole === 'ZONE_USER') {
            // Zone users can only update assets for their own customer
            if (!userCustomerId || existingAsset.customerId !== userCustomerId) {
                return res.status(403).json({ error: 'You can only update assets for your own customer' });
            }
            // Prevent changing customerId for non-admin users
            if (customerId && parseInt(customerId) !== userCustomerId) {
                return res.status(403).json({ error: 'You cannot change the customer for this asset' });
            }
        }
        else {
            return res.status(403).json({ error: 'Insufficient permissions to update assets' });
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
            const targetCustomerId = customerId || existingAsset.customerId;
            const serialExists = await db_1.default.asset.findFirst({
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
        const updateData = {
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
        return res.status(500).json({ error: 'Failed to update asset' });
    }
};
exports.updateAsset = updateAsset;
// Delete asset
const deleteAsset = async (req, res) => {
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
        // Role-based access control
        const userRole = user.role;
        const userCustomerId = user.customerId;
        if (userRole === 'ADMIN') {
            // Admin can delete any asset
        }
        else if (userRole === 'ZONE_USER') {
            // Zone users can only delete assets for their own customer
            if (!userCustomerId || existingAsset.customerId !== userCustomerId) {
                return res.status(403).json({ error: 'You can only delete assets for your own customer' });
            }
        }
        else {
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
        await db_1.default.asset.delete({
            where: { id: assetId }
        });
        return res.json({ message: 'Asset deleted successfully' });
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to delete asset' });
    }
};
exports.deleteAsset = deleteAsset;
// Legacy functions for backward compatibility
const getCustomerAssets = async (req, res) => {
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
        return res.status(500).json({ error: 'Failed to fetch assets' });
    }
};
exports.getCustomerAssets = getCustomerAssets;
const getAssetStats = async (req, res) => {
    try {
        const user = getUserFromRequest(req);
        if (!user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const userRole = user.role;
        const userCustomerId = user.customerId;
        const where = {};
        // Role-based filtering
        if (userRole === 'ZONE_USER') {
            if (!userCustomerId) {
                return res.status(403).json({ error: 'Customer ID not found for user' });
            }
            where.customerId = userCustomerId;
        }
        else if (userRole === 'SERVICE_PERSON') {
            // ServicePerson can only view assets linked to tickets assigned to them
            where.tickets = {
                some: {
                    assignedToId: user.id
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
        return res.status(500).json({ error: 'Failed to fetch asset statistics' });
    }
};
exports.getAssetStats = getAssetStats;
const getAssetDetails = async (req, res) => {
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
        if (user.role !== 'ADMIN' && user.customerId !== asset.customerId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        return res.json(asset);
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to fetch asset details' });
    }
};
exports.getAssetDetails = getAssetDetails;
