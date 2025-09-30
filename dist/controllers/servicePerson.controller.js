"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteServicePerson = exports.updateServicePerson = exports.createServicePerson = exports.getServicePerson = exports.listServicePersons = void 0;
const db_1 = __importDefault(require("../config/db"));
const bcrypt_1 = __importDefault(require("bcrypt")); // For password hashing
// Password hashing utility
const hashPassword = async (password) => {
    const saltRounds = 10;
    return await bcrypt_1.default.hash(password, saltRounds);
};
const listServicePersons = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;
        // Build where clause for search
        const where = { role: 'SERVICE_PERSON' };
        if (search) {
            where.OR = [
                { email: { contains: search, mode: 'insensitive' } },
                { id: { equals: parseInt(search) || 0 } }
            ];
        }
        const [servicePersons, total] = await Promise.all([
            db_1.default.user.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    role: true,
                    isActive: true,
                    serviceZones: {
                        include: {
                            serviceZone: true
                        }
                    }
                },
                skip: offset,
                take: limit,
                orderBy: { id: 'desc' }
            }),
            db_1.default.user.count({ where })
        ]);
        const totalPages = Math.ceil(total / limit);
        res.json({
            data: servicePersons,
            pagination: {
                page,
                limit,
                total,
                totalPages
            }
        });
    }
    catch (error) {
        console.error('Error listing service persons:', error);
        res.status(500).json({ error: 'Failed to fetch service persons' });
    }
};
exports.listServicePersons = listServicePersons;
const getServicePerson = async (req, res) => {
    try {
        const { id } = req.params;
        const servicePerson = await db_1.default.user.findUnique({
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
    }
    catch (error) {
        console.error('Error fetching service person:', error);
        res.status(500).json({ error: 'Failed to fetch service person' });
    }
};
exports.getServicePerson = getServicePerson;
const createServicePerson = async (req, res) => {
    try {
        const { name, email, phone, password, serviceZoneIds = [] } = req.body;
        console.log('📝 createServicePerson: Creating service person with data:', {
            name,
            email,
            phone,
            serviceZoneIds
        });
        // Validate input
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        // Check if email already exists
        const existingUser = await db_1.default.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already in use' });
        }
        // Validate service zones if provided
        if (serviceZoneIds.length > 0) {
            const zones = await db_1.default.serviceZone.findMany({
                where: { id: { in: serviceZoneIds } }
            });
            if (zones.length !== serviceZoneIds.length) {
                return res.status(400).json({ error: 'One or more service zones are invalid' });
            }
        }
        // Create the service person
        const servicePerson = await db_1.default.user.create({
            data: {
                name: name || null,
                email,
                phone: phone || null, // Add phone field
                password: await hashPassword(password),
                role: 'SERVICE_PERSON',
                tokenVersion: '0', // Initialize token version
                serviceZones: serviceZoneIds.length > 0 ? {
                    create: serviceZoneIds.map((zoneId) => ({
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
    }
    catch (error) {
        console.error('Error creating service person:', error);
        res.status(500).json({ error: 'Failed to create service person' });
    }
};
exports.createServicePerson = createServicePerson;
const updateServicePerson = async (req, res) => {
    try {
        const { id } = req.params;
        const { email, password, serviceZoneIds } = req.body;
        // Check if service person exists
        const existingPerson = await db_1.default.user.findUnique({
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
            const zones = await db_1.default.serviceZone.findMany({
                where: { id: { in: serviceZoneIds } }
            });
            if (zones.length !== serviceZoneIds.length) {
                return res.status(400).json({ error: 'One or more service zones are invalid' });
            }
        }
        // Update the service person
        const [updatedPerson] = await db_1.default.$transaction([
            db_1.default.user.update({
                where: { id: Number(id) },
                data: {
                    ...(email && { email }),
                    ...(password && { password: await hashPassword(password) }),
                }
            }),
            // Update service zone relationships
            db_1.default.servicePersonZone.deleteMany({
                where: { userId: Number(id) }
            }),
            ...(serviceZoneIds && serviceZoneIds.length > 0 ? [
                db_1.default.servicePersonZone.createMany({
                    data: serviceZoneIds.map((zoneId) => ({
                        userId: Number(id),
                        serviceZoneId: zoneId
                    })),
                    skipDuplicates: true
                })
            ] : [])
        ]);
        // Fetch the updated person with relationships
        const servicePerson = await db_1.default.user.findUnique({
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
    }
    catch (error) {
        console.error('Error updating service person:', error);
        res.status(500).json({ error: 'Failed to update service person' });
    }
};
exports.updateServicePerson = updateServicePerson;
const deleteServicePerson = async (req, res) => {
    try {
        const { id } = req.params;
        // Check if service person exists
        const servicePerson = await db_1.default.user.findUnique({
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
            db_1.default.ticket.count({ where: { assignedToId: Number(id) } }),
            db_1.default.servicePersonZone.count({ where: { userId: Number(id) } })
        ]);
        // If there are associated tickets, we cannot delete
        if (ticketsCount > 0) {
            return res.status(400).json({
                error: 'Cannot delete service person with assigned tickets',
                details: {
                    tickets: ticketsCount,
                    serviceZones: serviceZonesCount
                }
            });
        }
        // If there are service zone assignments, clean them up first
        if (serviceZonesCount > 0) {
            await db_1.default.servicePersonZone.deleteMany({
                where: { userId: Number(id) }
            });
        }
        await db_1.default.user.delete({
            where: { id: Number(id) }
        });
        res.json({
            message: 'Service person deleted successfully',
            cleanedRecords: {
                serviceZones: serviceZonesCount
            }
        });
    }
    catch (error) {
        console.error('Error deleting service person:', error);
        res.status(500).json({ error: 'Failed to delete service person' });
    }
};
exports.deleteServicePerson = deleteServicePerson;
