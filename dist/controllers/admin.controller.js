"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserById = exports.toggleUserStatus = exports.resetUserPassword = exports.deleteUser = exports.updateUser = exports.createUser = exports.getUsers = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// Get all users with optional role filter
const getUsers = async (req, res) => {
    try {
        // Check if user is admin
        if (req.user?.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Access denied. Admin role required.' });
        }
        const { role, page = 1, limit = 50, search } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        // Build where clause
        const where = {};
        if (role && typeof role === 'string') {
            where.role = role;
        }
        if (search && typeof search === 'string') {
            where.OR = [
                { email: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } }
            ];
        }
        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    email: true,
                    name: true,
                    phone: true,
                    role: true,
                    isActive: true,
                    createdAt: true,
                    lastLoginAt: true,
                    lastActiveAt: true,
                    customerId: true,
                    zoneId: true,
                    customer: {
                        select: {
                            id: true,
                            companyName: true,
                            isActive: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: Number(limit)
            }),
            prisma.user.count({ where })
        ]);
        res.json({
            users,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit))
            }
        });
    }
    catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.getUsers = getUsers;
// Create new user
const createUser = async (req, res) => {
    try {
        // Check if user is admin
        if (req.user?.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Access denied. Admin role required.' });
        }
        const { email, password, role, name, phone, customerId, zoneId } = req.body;
        // Validate required fields
        if (!email || !password || !role) {
            return res.status(400).json({ message: 'Email, password, and role are required' });
        }
        // Validate role
        const validRoles = ['ADMIN', 'ZONE_USER', 'SERVICE_PERSON'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ message: 'Invalid role' });
        }
        // Check if user already exists
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email already exists' });
        }
        // Hash password
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        // Create user data
        const userData = {
            email,
            password: hashedPassword,
            role,
            name: name || null,
            phone: phone || null,
            isActive: true,
            tokenVersion: Math.random().toString(36).substring(2, 15)
        };
        if (customerId) {
            userData.customerId = Number(customerId);
        }
        if (zoneId) {
            userData.zoneId = zoneId;
        }
        // Create user
        const user = await prisma.user.create({
            data: userData,
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                role: true,
                isActive: true,
                createdAt: true,
                customerId: true,
                zoneId: true,
                customer: {
                    select: {
                        id: true,
                        companyName: true,
                        isActive: true
                    }
                }
            }
        });
        res.status(201).json({ user });
    }
    catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.createUser = createUser;
// Update user
const updateUser = async (req, res) => {
    try {
        // Check if user is admin
        if (req.user?.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Access denied. Admin role required.' });
        }
        const { id } = req.params;
        const { email, name, phone, role, isActive, customerId, zoneId } = req.body;
        // Check if user exists
        const existingUser = await prisma.user.findUnique({ where: { id: Number(id) } });
        if (!existingUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        // Check if email is already taken by another user
        if (email && email !== existingUser.email) {
            const emailExists = await prisma.user.findUnique({ where: { email } });
            if (emailExists) {
                return res.status(400).json({ message: 'Email is already taken' });
            }
        }
        // Prepare update data
        const updateData = {};
        if (email !== undefined)
            updateData.email = email;
        if (name !== undefined)
            updateData.name = name || null;
        if (phone !== undefined)
            updateData.phone = phone || null;
        if (role !== undefined)
            updateData.role = role;
        if (isActive !== undefined)
            updateData.isActive = isActive;
        if (customerId !== undefined)
            updateData.customerId = customerId ? Number(customerId) : null;
        if (zoneId !== undefined)
            updateData.zoneId = zoneId || null;
        // Update user
        const user = await prisma.user.update({
            where: { id: Number(id) },
            data: updateData,
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
                customerId: true,
                zoneId: true,
                customer: {
                    select: {
                        id: true,
                        companyName: true,
                        isActive: true
                    }
                }
            }
        });
        res.json({ user });
    }
    catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.updateUser = updateUser;
// Delete user
const deleteUser = async (req, res) => {
    try {
        // Check if user is admin
        if (req.user?.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Access denied. Admin role required.' });
        }
        const { id } = req.params;
        // Check if user exists
        const existingUser = await prisma.user.findUnique({ where: { id: Number(id) } });
        if (!existingUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        // Prevent admin from deleting themselves
        if (Number(id) === req.user?.id) {
            return res.status(400).json({ message: 'You cannot delete your own account' });
        }
        // Delete user
        await prisma.user.delete({
            where: { id: Number(id) }
        });
        res.json({ message: 'User deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.deleteUser = deleteUser;
// Reset user password
const resetUserPassword = async (req, res) => {
    try {
        // Check if user is admin
        if (req.user?.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Access denied. Admin role required.' });
        }
        const { id } = req.params;
        const { newPassword } = req.body;
        // Check if user exists
        const existingUser = await prisma.user.findUnique({ where: { id: Number(id) } });
        if (!existingUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        // Use provided password or generate new one
        const passwordToUse = newPassword || crypto_1.default.randomBytes(8).toString('hex');
        // Validate password if provided
        if (newPassword && newPassword.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters long' });
        }
        const hashedPassword = await bcrypt_1.default.hash(passwordToUse, 10);
        // Update user password and clear any existing tokens
        await prisma.user.update({
            where: { id: Number(id) },
            data: {
                password: hashedPassword,
                refreshToken: null,
                tokenVersion: Math.random().toString(36).substring(2, 15),
                failedLoginAttempts: 0,
                accountLockedUntil: null,
                lastPasswordChange: new Date()
            }
        });
        res.json({
            message: 'Password reset successfully',
            newPassword: passwordToUse // Return the password that was actually set
        });
    }
    catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.resetUserPassword = resetUserPassword;
// Toggle user active status
const toggleUserStatus = async (req, res) => {
    try {
        // Check if user is admin
        if (req.user?.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Access denied. Admin role required.' });
        }
        const { id } = req.params;
        // Check if user exists
        const existingUser = await prisma.user.findUnique({ where: { id: Number(id) } });
        if (!existingUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        // Prevent admin from deactivating themselves
        if (Number(id) === req.user?.id) {
            return res.status(400).json({ message: 'You cannot deactivate your own account' });
        }
        // Toggle active status
        const user = await prisma.user.update({
            where: { id: Number(id) },
            data: { isActive: !existingUser.isActive },
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true
            }
        });
        res.json({
            user,
            message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`
        });
    }
    catch (error) {
        console.error('Error toggling user status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.toggleUserStatus = toggleUserStatus;
// Get user by ID
const getUserById = async (req, res) => {
    try {
        // Check if user is admin
        if (req.user?.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Access denied. Admin role required.' });
        }
        const { id } = req.params;
        const user = await prisma.user.findUnique({
            where: { id: Number(id) },
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
                lastLoginAt: true,
                lastActiveAt: true,
                customerId: true,
                zoneId: true,
                customer: {
                    select: {
                        id: true,
                        companyName: true,
                        isActive: true
                    }
                }
            }
        });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ user });
    }
    catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.getUserById = getUserById;
