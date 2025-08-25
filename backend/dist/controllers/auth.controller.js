"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshToken = exports.logout = exports.getCurrentUser = exports.loginWithOTP = exports.requestOTP = exports.login = exports.register = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const email_1 = require("../utils/email");
const auth_1 = require("../config/auth");
const prisma = new client_1.PrismaClient();
const register = async (req, res) => {
    try {
        const { email, password, role, customerId, phone, name } = req.body;
        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }
        // Hash password
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        // Create user first
        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                role,
                isActive: true,
                ...(customerId ? { customer: { connect: { id: customerId } } } : {})
            },
            select: {
                id: true,
                email: true,
                role: true,
                customerId: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
                customer: customerId ? {
                    select: {
                        id: true,
                        companyName: true,
                        isActive: true
                    }
                } : undefined
            }
        });
        // Create contact if name and customerId are provided
        if (name && customerId) {
            await prisma.contact.create({
                data: {
                    name,
                    email,
                    phone: phone || '',
                    role: role === 'CUSTOMER_ACCOUNT_OWNER' ? 'ACCOUNT_OWNER' : 'CONTACT',
                    customer: { connect: { id: customerId } }
                }
            });
        }
        // Generate JWT token
        const token = jsonwebtoken_1.default.sign({ id: user.id, role: user.role, customerId: user.customerId }, auth_1.JWT_CONFIG.secret, { expiresIn: '1d' });
        // Generate refresh token
        const refreshToken = jsonwebtoken_1.default.sign({ id: user.id }, auth_1.REFRESH_TOKEN_CONFIG.secret, { expiresIn: '7d' });
        // Save refresh token to database
        await prisma.user.update({
            where: { id: user.id },
            data: { refreshToken }
        });
        // Set refresh token as HTTP-only cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
        // Return user and token
        res.status(201).json({
            user,
            token
        });
    }
    catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.register = register;
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        // Find user by email with customer info
        const user = await prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                email: true,
                password: true,
                role: true,
                customerId: true,
                isActive: true,
                // Removed phone as it's not in the schema
                // Removed name as it's not in the schema
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
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        // Check if user is active
        if (!user.isActive) {
            return res.status(403).json({ message: 'Account is deactivated' });
        }
        // Check password
        const isPasswordValid = await bcrypt_1.default.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        // Generate JWT token
        const token = jsonwebtoken_1.default.sign({ id: user.id, role: user.role, customerId: user.customerId }, auth_1.JWT_CONFIG.secret, { expiresIn: '1d' });
        // Generate refresh token
        const refreshToken = jsonwebtoken_1.default.sign({ id: user.id }, auth_1.REFRESH_TOKEN_CONFIG.secret, { expiresIn: '7d' });
        // Save refresh token to database
        await prisma.user.update({
            where: { id: user.id },
            data: { refreshToken }
        });
        // Set access token as HTTP-only cookie
        res.cookie('accessToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // Only true in production
            sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'none',
            maxAge: 24 * 60 * 60 * 1000, // 1 day
            path: '/',
        });
        // Set refresh token as HTTP-only cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // Only true in production
            sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'none',
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
        // Return user data without sensitive information
        const { password: userPassword, ...userData } = user;
        const responseData = { ...userData };
        // Optionally include tokens in response for clients that don't use cookies
        if (process.env.NODE_ENV === 'development') {
            responseData.token = token;
            responseData.refreshToken = refreshToken;
        }
        else {
            responseData.token = token;
        }
        return res.json(responseData);
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.login = login;
const requestOTP = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        // Find user by email with customer relation
        const user = await prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                email: true,
                password: true,
                role: true,
                customerId: true,
                isActive: true,
                // Removed phone as it's not in the schema
                // Removed name as it's not in the schema
                createdAt: true,
                updatedAt: true,
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
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        // Don't reveal if user exists or not for security
        if (!user || !user.isActive) {
            // Still return success to prevent email enumeration
            return res.json({
                success: true,
                message: 'If your email is registered, you will receive an OTP'
            });
        }
        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = new Date(Date.now() + auth_1.OTP_CONFIG.expiryMinutes * 60 * 1000);
        // Save OTP to user record
        await prisma.user.update({
            where: { id: user.id },
            data: {
                otp: otp,
                otpExpiresAt: otpExpiry
            }
        });
        // Send OTP via email
        await (0, email_1.sendOTP)(email, otp);
        return res.json({
            success: true,
            message: 'OTP sent to your email',
            // For development/testing only - remove in production
            debug: { otp, expiresIn: auth_1.OTP_CONFIG.expiryMinutes }
        });
    }
    catch (error) {
        console.error('OTP request error:', error);
        return res.status(500).json({ error: 'Failed to send OTP' });
    }
};
exports.requestOTP = requestOTP;
const loginWithOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return res.status(400).json({ error: 'Email and OTP are required' });
        }
        // Find user with OTP fields
        const user = await prisma.user.findUnique({
            where: { email },
            include: {
                customer: true
            }
        });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        // Check if user is active
        if (!user.isActive) {
            return res.status(401).json({ error: 'Account is not active' });
        }
        // Check OTP
        if (!user.otp || user.otp !== otp) {
            return res.status(401).json({ error: 'Invalid OTP' });
        }
        // Check if OTP is expired
        if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) {
            return res.status(401).json({ error: 'OTP has expired' });
        }
        // Clear OTP after successful verification
        await prisma.user.update({
            where: { id: user.id },
            data: {
                otp: null,
                otpExpiresAt: null
            }
        });
        // Generate JWT token
        const token = jsonwebtoken_1.default.sign({
            id: user.id,
            role: user.role,
            customerId: user.customerId
        }, auth_1.JWT_CONFIG.secret, { expiresIn: '7d' });
        // Remove OTP from response
        return res.json({
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                customerId: user.customerId,
                isActive: user.isActive,
                ...(user.customer ? { customer: user.customer } : {})
            },
            token
        });
    }
    catch (error) {
        console.error('OTP login error:', error);
        return res.status(500).json({ error: 'Login failed' });
    }
};
exports.loginWithOTP = loginWithOTP;
const getCurrentUser = async (req, res) => {
    try {
        // User is attached to request by auth middleware
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        // Get fresh user data with proper typing
        const userData = await prisma.user.findUnique({
            where: { id: user.id },
            select: {
                id: true,
                // Removed name as it's not in the schema
                email: true,
                role: true,
                // Removed phone as it's not in the schema
                customerId: true,
                isActive: true,
                customer: {
                    select: {
                        id: true,
                        companyName: true,
                        address: true,
                        industry: true,
                        timezone: true,
                        isActive: true,
                        createdAt: true,
                        updatedAt: true
                    }
                },
                createdAt: true,
                updatedAt: true,
                lastLoginAt: true
            }
        });
        if (!userData) {
            return res.status(404).json({ error: 'User not found' });
        }
        return res.json(userData);
    }
    catch (error) {
        console.error('Get user error:', error);
        return res.status(500).json({ error: 'Failed to fetch user data' });
    }
};
exports.getCurrentUser = getCurrentUser;
const logout = async (req, res) => {
    try {
        const userId = req.user?.id;
        // Clear the refresh token from the database
        if (userId) {
            await prisma.user.update({
                where: { id: userId },
                data: { refreshToken: null }
            });
        }
        // Clear access token cookie
        res.clearCookie('accessToken', {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });
        // Clear refresh token cookie
        res.clearCookie('refreshToken', {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });
        return res.json({ success: true, message: 'Logged out successfully' });
    }
    catch (error) {
        console.error('Logout error:', error);
        return res.status(500).json({ success: false, error: 'Failed to log out' });
    }
};
exports.logout = logout;
const refreshToken = async (req, res) => {
    try {
        // Get refresh token from cookies
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                error: 'No refresh token provided',
                code: 'MISSING_REFRESH_TOKEN'
            });
        }
        // Verify refresh token
        const decoded = jsonwebtoken_1.default.verify(refreshToken, auth_1.REFRESH_TOKEN_CONFIG.secret);
        // Find user by ID
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: {
                id: true,
                email: true,
                role: true,
                customerId: true,
                isActive: true,
                refreshToken: true,
                customer: {
                    select: {
                        id: true,
                        companyName: true,
                        isActive: true
                    }
                }
            }
        });
        // Check if user exists and refresh token matches
        if (!user || user.refreshToken !== refreshToken) {
            return res.status(401).json({
                success: false,
                error: 'Invalid refresh token',
                code: 'INVALID_REFRESH_TOKEN'
            });
        }
        // Generate new access token
        const newToken = jsonwebtoken_1.default.sign({ id: user.id, role: user.role, customerId: user.customerId }, auth_1.JWT_CONFIG.secret, { expiresIn: '15m' });
        // Set new access token in HTTP-only cookie
        res.cookie('accessToken', newToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'none',
            maxAge: 15 * 60 * 1000, // 15 minutes
            path: '/',
        });
        // Return the new token in the response
        return res.json({
            success: true,
            token: newToken,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                customerId: user.customerId,
                isActive: user.isActive,
                customer: user.customer
            }
        });
    }
    catch (error) {
        console.error('Token refresh error:', error);
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            return res.status(401).json({
                success: false,
                error: 'Refresh token expired',
                code: 'REFRESH_TOKEN_EXPIRED'
            });
        }
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return res.status(401).json({
                success: false,
                error: 'Invalid refresh token',
                code: 'INVALID_REFRESH_TOKEN'
            });
        }
        return res.status(500).json({
            success: false,
            error: 'Failed to refresh token',
            code: 'TOKEN_REFRESH_FAILED'
        });
    }
};
exports.refreshToken = refreshToken;
