"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPassword = exports.forgotPassword = exports.refreshToken = exports.logout = exports.getCurrentUser = exports.login = exports.register = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const auth_1 = require("../config/auth");
const email_1 = require("../utils/email");
const prisma = new client_1.PrismaClient();
const register = async (req, res) => {
    try {
        const { email, password, role, name, phone, companyName } = req.body;
        // Validate required fields
        if (!email || !password || !role) {
            return res.status(400).json({ message: 'Email, password and role are required' });
        }
        // Check if user already exists
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }
        // Hash password
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        // Create user data
        const userData = {
            email,
            password: hashedPassword,
            role,
            isActive: true,
            tokenVersion: '0' // Initialize token version as string
        };
        // Handle customer owner registration
        if (role === 'CUSTOMER_OWNER' && companyName) {
            // Get admin user or system user ID for createdBy/updatedBy
            const adminUser = await prisma.user.findFirst({
                where: { role: 'ADMIN' },
                select: { id: true }
            });
            const systemUserId = adminUser?.id || 1; // Fallback to 1 if no admin found
            // Get the first active service zone or create a default one if none exists
            let serviceZone = await prisma.serviceZone.findFirst({
                where: { isActive: true }
            });
            if (!serviceZone) {
                // Create a default service zone if none exists
                serviceZone = await prisma.serviceZone.create({
                    data: {
                        name: 'Default Service Zone',
                        description: 'Default service zone for new customers',
                        isActive: true
                    }
                });
            }
            // Create customer with the service zone
            const customer = await prisma.customer.create({
                data: {
                    companyName,
                    isActive: true,
                    serviceZone: {
                        connect: { id: serviceZone.id }
                    },
                    createdBy: {
                        connect: { id: systemUserId }
                    },
                    updatedBy: {
                        connect: { id: systemUserId }
                    }
                }
            });
            // Create contact
            await prisma.contact.create({
                data: {
                    name: name || '',
                    email,
                    phone: phone || '',
                    role: 'ACCOUNT_OWNER',
                    customerId: customer.id
                }
            });
            userData.customerId = customer.id;
        }
        // Create user
        const user = await prisma.user.create({
            data: userData,
            select: {
                id: true,
                email: true,
                role: true,
                customerId: true,
                isActive: true,
                customer: {
                    select: {
                        id: true,
                        companyName: true,
                        isActive: true
                    }
                }
            }
        });
        // Generate tokens
        const token = jsonwebtoken_1.default.sign({ id: user.id, role: user.role, customerId: user.customerId }, auth_1.JWT_CONFIG.secret, { expiresIn: '1d' });
        const refreshToken = jsonwebtoken_1.default.sign({ id: user.id }, auth_1.REFRESH_TOKEN_CONFIG.secret, { expiresIn: '7d' });
        // Save refresh token to database
        await prisma.user.update({
            where: { id: user.id },
            data: { refreshToken }
        });
        // Set HTTP-only cookies
        res.cookie('accessToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000, // 1 day
            path: '/'
        });
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000, // 1 day
            path: '/'
        });
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: '/'
        });
        // Return user and token
        res.status(201).json({
            user,
            token // Also return token for clients that need it
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
        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required',
                code: 'MISSING_CREDENTIALS'
            });
        }
        // Find user with customer info
        const user = await prisma.user.findUnique({
            where: { email },
            include: {
                customer: true
            }
        });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password',
                code: 'INVALID_CREDENTIALS'
            });
        }
        // Check if user is active
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been deactivated. Please contact support.',
                code: 'ACCOUNT_DEACTIVATED'
            });
        }
        // Check for account lockout
        if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
            return res.status(403).json({
                success: false,
                message: 'Account locked due to too many failed login attempts. Please try again later or reset your password.',
                code: 'ACCOUNT_LOCKED',
                retryAfter: Math.ceil((user.accountLockedUntil.getTime() - Date.now()) / 1000) // seconds until unlock
            });
        }
        // Check password
        const isPasswordValid = await bcrypt_1.default.compare(password, user.password);
        if (!isPasswordValid) {
            // Update failed login attempts
            const failedAttempts = (user.failedLoginAttempts || 0) + 1;
            const MAX_ATTEMPTS = 5;
            const LOCKOUT_MINUTES = 15;
            const updateData = {
                failedLoginAttempts: failedAttempts,
                lastFailedLogin: new Date()
            };
            if (failedAttempts >= MAX_ATTEMPTS) {
                const lockoutTime = new Date();
                lockoutTime.setMinutes(lockoutTime.getMinutes() + LOCKOUT_MINUTES);
                updateData.accountLockedUntil = lockoutTime;
                updateData.failedLoginAttempts = 0; // Reset after lockout
            }
            await prisma.user.update({
                where: { id: user.id },
                data: updateData
            });
            const attemptsLeft = MAX_ATTEMPTS - failedAttempts;
            return res.status(401).json({
                success: false,
                message: attemptsLeft > 0
                    ? `Invalid email or password. ${attemptsLeft} attempt(s) left.`
                    : 'Account locked due to too many failed attempts. Please try again later.',
                code: attemptsLeft > 0 ? 'INVALID_CREDENTIALS' : 'ACCOUNT_LOCKED',
                ...(attemptsLeft <= 0 && {
                    retryAfter: LOCKOUT_MINUTES * 60 // seconds
                })
            });
        }
        // Reset failed login attempts on successful login
        if (user.failedLoginAttempts > 0 || user.accountLockedUntil) {
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    failedLoginAttempts: 0,
                    accountLockedUntil: null
                }
            });
        }
        // Generate new token version
        const tokenVersion = Math.random().toString(36).substring(2, 15);
        // Generate tokens with version
        const token = jsonwebtoken_1.default.sign({
            id: user.id,
            role: user.role,
            customerId: user.customerId,
            version: tokenVersion
        }, auth_1.JWT_CONFIG.secret, { expiresIn: '1d' });
        const refreshToken = jsonwebtoken_1.default.sign({
            id: user.id,
            version: tokenVersion
        }, auth_1.REFRESH_TOKEN_CONFIG.secret, { expiresIn: '7d' });
        // Update user with new tokens and version
        await prisma.user.update({
            where: { id: user.id },
            data: {
                refreshToken,
                tokenVersion: tokenVersion,
                lastLoginAt: new Date(),
                lastActiveAt: new Date()
            }
        });
        // Set HTTP-only cookies with secure settings
        const isProduction = process.env.NODE_ENV === 'production';
        const cookieOptions = {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax', // Using 'lax' for better compatibility
            maxAge: 24 * 60 * 60 * 1000, // 1 day for access token
            path: '/'
        };
        res.cookie('accessToken', token, cookieOptions);
        res.cookie('token', token, cookieOptions);
        res.cookie('refreshToken', refreshToken, {
            ...cookieOptions,
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days for refresh token
        });
        // Return user data without sensitive information
        const { password: _, refreshToken: rt, tokenVersion: tv, ...userData } = user;
        // For backward compatibility, include both token and accessToken
        res.json({
            success: true,
            user: {
                ...userData,
                customer: user.customer
            },
            token, // For backward compatibility
            accessToken: token, // New standard field
            refreshToken: rt // Include refresh token in the response
        });
    }
    catch (error) {
        console.error('Login error:', error);
        const errorResponse = {
            success: false,
            message: 'An error occurred during login',
            code: 'INTERNAL_SERVER_ERROR'
        };
        if (error instanceof Error) {
            if (process.env.NODE_ENV === 'development') {
                errorResponse.error = error.message;
                if ('stack' in error) {
                    errorResponse.stack = error.stack;
                }
            }
        }
        res.status(500).json(errorResponse);
    }
};
exports.login = login;
const getCurrentUser = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Not authenticated' });
        }
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                email: true,
                role: true,
                customerId: true,
                zoneId: true,
                isActive: true,
                customer: {
                    select: {
                        id: true,
                        companyName: true,
                        isActive: true,
                        serviceZoneId: true,
                        serviceZone: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    }
                },
                serviceZones: {
                    select: {
                        serviceZoneId: true,
                        serviceZone: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    }
                },
                createdAt: true,
                updatedAt: true
            }
        });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    }
    catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.getCurrentUser = getCurrentUser;
const logout = async (req, res) => {
    try {
        if (req.user?.id) {
            // Clear refresh token from database
            await prisma.user.update({
                where: { id: req.user.id },
                data: { refreshToken: null }
            });
        }
        // Clear cookies
        const clearCookieOptions = {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        };
        res.clearCookie('accessToken', clearCookieOptions);
        res.clearCookie('token', clearCookieOptions);
        res.clearCookie('refreshToken', clearCookieOptions);
        res.json({ message: 'Logged out successfully' });
    }
    catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.logout = logout;
const refreshToken = async (req, res) => {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ message: 'Refresh token required' });
        }
        // Verify refresh token
        const decoded = jsonwebtoken_1.default.verify(refreshToken, auth_1.REFRESH_TOKEN_CONFIG.secret);
        // Find user with refresh token
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: {
                id: true,
                email: true,
                role: true,
                customerId: true,
                isActive: true,
                refreshToken: true
            }
        });
        // Validate user and refresh token
        if (!user || user.refreshToken !== refreshToken) {
            return res.status(401).json({ message: 'Invalid refresh token' });
        }
        // Generate new access token
        const newToken = jsonwebtoken_1.default.sign({ id: user.id, role: user.role, customerId: user.customerId }, auth_1.JWT_CONFIG.secret, { expiresIn: '1d' });
        // Set new access token cookie
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000, // 1 day
            path: '/'
        };
        res.cookie('accessToken', newToken, cookieOptions);
        res.cookie('token', newToken, cookieOptions);
        res.cookie('userRole', user.role, cookieOptions);
        res.json({
            accessToken: newToken,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                customerId: user.customerId
            }
        });
    }
    catch (error) {
        console.error('Refresh token error:', error);
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            return res.status(401).json({ message: 'Refresh token expired' });
        }
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return res.status(401).json({ message: 'Invalid refresh token' });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.refreshToken = refreshToken;
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required',
                code: 'MISSING_EMAIL'
            });
        }
        // Find user by email
        const user = await prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                email: true,
                isActive: true
            }
        });
        // Always return success to prevent email enumeration attacks
        const successResponse = {
            success: true,
            message: 'If an account with that email exists, we have sent a password reset link.',
            code: 'RESET_EMAIL_SENT'
        };
        if (!user || !user.isActive) {
            // Still return success but don't send email
            return res.json(successResponse);
        }
        // Generate reset token
        const resetToken = crypto_1.default.randomBytes(32).toString('hex');
        const resetTokenExpiry = new Date();
        resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1); // 1 hour expiry
        // Save reset token to database
        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordResetToken: resetToken,
                passwordResetExpires: resetTokenExpiry
            }
        });
        // Create reset URL
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/reset-password?token=${resetToken}`;
        // Send reset email
        try {
            await (0, email_1.sendEmail)({
                to: user.email,
                subject: 'Password Reset Request - KardexCare',
                template: 'password-reset',
                context: {
                    resetUrl,
                    currentYear: new Date().getFullYear()
                }
            });
        }
        catch (emailError) {
            console.error('Failed to send password reset email:', emailError);
            // Don't reveal email sending failure to prevent enumeration
        }
        res.json(successResponse);
    }
    catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while processing your request',
            code: 'INTERNAL_SERVER_ERROR'
        });
    }
};
exports.forgotPassword = forgotPassword;
const resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) {
            return res.status(400).json({
                success: false,
                message: 'Token and new password are required',
                code: 'MISSING_REQUIRED_FIELDS'
            });
        }
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long',
                code: 'INVALID_PASSWORD_LENGTH'
            });
        }
        // Find user with valid reset token
        const user = await prisma.user.findFirst({
            where: {
                passwordResetToken: token,
                passwordResetExpires: {
                    gt: new Date() // Token must not be expired
                },
                isActive: true
            },
            select: {
                id: true,
                email: true
            }
        });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token',
                code: 'INVALID_RESET_TOKEN'
            });
        }
        // Hash new password
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        // Update user password and clear reset token
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                passwordResetToken: null,
                passwordResetExpires: null,
                failedLoginAttempts: 0, // Reset failed attempts
                accountLockedUntil: null, // Clear any account locks
                lastPasswordChange: new Date()
            }
        });
        res.json({
            success: true,
            message: 'Password has been reset successfully',
            code: 'PASSWORD_RESET_SUCCESS'
        });
    }
    catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while resetting your password',
            code: 'INTERNAL_SERVER_ERROR'
        });
    }
};
exports.resetPassword = resetPassword;
