"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllUsersForZoneAssignment = exports.createZoneUserWithZones = exports.deleteZoneUser = exports.removeZoneUserAssignments = exports.updateZoneUserAssignments = exports.assignUserToZones = exports.getZoneUser = exports.listZoneUsers = void 0;
const client_1 = require("@prisma/client");
const bcrypt_1 = require("bcrypt");
const db_1 = __importDefault(require("../config/db"));
const listZoneUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search;
        const role = req.query.role;
        const offset = (page - 1) * limit;
        // Build where clause for search
        const whereClause = {
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
            db_1.default.user.findMany({
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
            db_1.default.user.count({ where: whereClause })
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
    }
    catch (error) {
        console.error('Error listing zone users:', error);
        res.status(500).json({ error: 'Failed to fetch zone users' });
    }
};
exports.listZoneUsers = listZoneUsers;
const getZoneUser = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await db_1.default.user.findUnique({
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
    }
    catch (error) {
        console.error('Error fetching zone user:', error);
        res.status(500).json({ error: 'Failed to fetch zone user' });
    }
};
exports.getZoneUser = getZoneUser;
const assignUserToZones = async (req, res) => {
    try {
        const { userId, serviceZoneIds = [] } = req.body;
        // Validate input
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        // Check if user exists
        const user = await db_1.default.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, role: true, isActive: true }
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Validate service zones if provided
        if (serviceZoneIds.length > 0) {
            const zones = await db_1.default.serviceZone.findMany({
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
        await db_1.default.servicePersonZone.deleteMany({
            where: { userId: userId }
        });
        // Create new zone assignments
        if (serviceZoneIds.length > 0) {
            await db_1.default.servicePersonZone.createMany({
                data: serviceZoneIds.map((zoneId) => ({
                    userId: userId,
                    serviceZoneId: zoneId
                })),
                skipDuplicates: true
            });
        }
        // Fetch updated user with zones
        const updatedUser = await db_1.default.user.findUnique({
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
    }
    catch (error) {
        console.error('Error assigning user to zones:', error);
        res.status(500).json({ error: 'Failed to assign user to zones' });
    }
};
exports.assignUserToZones = assignUserToZones;
const updateZoneUserAssignments = async (req, res) => {
    try {
        const { id } = req.params;
        const { serviceZoneIds = [] } = req.body;
        const userId = Number(id);
        // Check if user exists
        const user = await db_1.default.user.findUnique({
            where: { id: userId }
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Validate service zones if provided
        if (serviceZoneIds.length > 0) {
            const zones = await db_1.default.serviceZone.findMany({
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
        await db_1.default.$transaction([
            // Remove existing assignments
            db_1.default.servicePersonZone.deleteMany({
                where: { userId: userId }
            }),
            // Create new assignments
            ...(serviceZoneIds.length > 0 ? [
                db_1.default.servicePersonZone.createMany({
                    data: serviceZoneIds.map((zoneId) => ({
                        userId: userId,
                        serviceZoneId: zoneId
                    })),
                    skipDuplicates: true
                })
            ] : [])
        ]);
        // Fetch updated user
        const updatedUser = await db_1.default.user.findUnique({
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
    }
    catch (error) {
        console.error('Error updating zone user assignments:', error);
        res.status(500).json({ error: 'Failed to update zone assignments' });
    }
};
exports.updateZoneUserAssignments = updateZoneUserAssignments;
const removeZoneUserAssignments = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = Number(id);
        // Check if user exists
        const user = await db_1.default.user.findUnique({
            where: { id: userId }
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Remove all zone assignments
        await db_1.default.servicePersonZone.deleteMany({
            where: { userId: userId }
        });
        res.json({ message: 'Zone assignments removed successfully' });
    }
    catch (error) {
        console.error('Error removing zone user assignments:', error);
        res.status(500).json({ error: 'Failed to remove zone assignments' });
    }
};
exports.removeZoneUserAssignments = removeZoneUserAssignments;
const deleteZoneUser = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = Number(id);
        // Check if user exists
        const user = await db_1.default.user.findUnique({
            where: { id: userId }
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Remove all zone assignments first (foreign key constraint)
        await db_1.default.servicePersonZone.deleteMany({
            where: { userId: userId }
        });
        // Delete the user
        await db_1.default.user.delete({
            where: { id: userId }
        });
        res.json({
            success: true,
            message: 'Zone user deleted successfully'
        });
    }
    catch (error) {
        console.error('Error deleting zone user:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete zone user'
        });
    }
};
exports.deleteZoneUser = deleteZoneUser;
const createZoneUserWithZones = async (req, res) => {
    const { name, email, phone, password, serviceZoneIds, isActive = true } = req.body;
    const prisma = new client_1.PrismaClient();
    try {
        console.log('📝 createZoneUserWithZones: Creating user with data:', {
            name,
            email,
            phone,
            serviceZoneIds,
            isActive
        });
        // Hash the password before saving
        const hashedPassword = await (0, bcrypt_1.hash)(password, 10);
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
            await Promise.all(serviceZoneIds.map((zoneId) => tx.user.update({
                where: { id: user.id },
                data: {
                    serviceZones: {
                        create: {
                            serviceZoneId: zoneId,
                        },
                    },
                },
            })));
            return user;
        });
        // Omit sensitive data from the response
        const { password: _, ...userWithoutPassword } = result;
        res.status(201).json({
            success: true,
            data: userWithoutPassword,
        });
    }
    catch (error) {
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
    }
    finally {
        await prisma.$disconnect();
    }
};
exports.createZoneUserWithZones = createZoneUserWithZones;
const getAllUsersForZoneAssignment = async (req, res) => {
    try {
        const search = req.query.search;
        const role = req.query.role;
        // Build where clause
        const whereClause = {
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
        const users = await db_1.default.user.findMany({
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
    }
    catch (error) {
        console.error('Error fetching users for zone assignment:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
};
exports.getAllUsersForZoneAssignment = getAllUsersForZoneAssignment;
