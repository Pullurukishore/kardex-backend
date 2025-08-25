"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.canManageAssets = exports.requireRole = exports.authenticate = void 0;
exports.isAuthenticatedRequest = isAuthenticatedRequest;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const auth_1 = require("../config/auth");
const db_1 = __importDefault(require("../config/db"));
// Type guard to check if request is authenticated
function isAuthenticatedRequest(req) {
    return 'user' in req && req.user !== undefined;
}
const authenticate = async (req, res, next) => {
    try {
        // Check for token in Authorization header first
        let token;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            // Extract token from 'Bearer <token>'
            token = authHeader.substring(7);
        }
        else if (req.cookies?.accessToken) {
            // Fall back to cookie if no Authorization header
            token = req.cookies.accessToken;
        }
        else if (req.cookies?.refreshToken) {
            // Try refresh token if access token is not available
            token = req.cookies.refreshToken;
        }
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'No authentication token provided',
                code: 'MISSING_AUTH_TOKEN'
            });
        }
        // Verify token
        let decoded;
        try {
            decoded = jsonwebtoken_1.default.verify(token, auth_1.JWT_CONFIG.secret);
        }
        catch (error) {
            if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
                return res.status(401).json({
                    success: false,
                    error: 'Token has expired',
                    code: 'TOKEN_EXPIRED'
                });
            }
            else if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid token',
                    code: 'INVALID_TOKEN'
                });
            }
            throw error; // Re-throw other errors
        }
        // Find user with minimal required fields
        const user = await db_1.default.user.findUnique({
            where: {
                id: decoded.id,
                isActive: true // Only allow active users
            },
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
                },
                createdTickets: {
                    take: 1,
                    select: {
                        customerId: true
                    },
                    orderBy: {
                        createdAt: 'desc' // Get the most recent ticket
                    }
                }
            }
        });
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User not found or inactive',
                code: 'USER_NOT_FOUND'
            });
        }
        // Create user object with only necessary properties
        const userPayload = {
            id: user.id,
            email: user.email,
            role: user.role,
            customerId: user.customerId ?? undefined, // Convert null to undefined to match AuthUser type
            isActive: user.isActive,
            customer: user.customer ? {
                id: user.customer.id,
                companyName: user.customer.companyName,
                isActive: user.customer.isActive
            } : undefined
        };
        // Attach user to request
        req.user = userPayload;
        next();
    }
    catch (error) {
        console.error('Authentication error:', error);
        // Handle specific JWT errors
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
        }
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            return res.status(401).json({
                success: false,
                error: 'Token expired',
                code: 'TOKEN_EXPIRED'
            });
        }
        // Generic error response
        return res.status(500).json({
            success: false,
            error: 'Authentication failed',
            code: 'AUTH_FAILED'
        });
    }
};
exports.authenticate = authenticate;
// Role-based access control middleware
const requireRole = (roles) => {
    const requiredRoles = Array.isArray(roles) ? roles : [roles];
    return (req, res, next) => {
        try {
            // Check if request is authenticated
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required',
                    code: 'UNAUTHORIZED'
                });
            }
            // Check if user has required role
            if (!requiredRoles.includes(req.user.role)) {
                return res.status(403).json({
                    success: false,
                    error: 'Insufficient permissions',
                    code: 'FORBIDDEN',
                    requiredRoles,
                    userRole: req.user.role
                });
            }
            // User has required role, proceed
            next();
        }
        catch (error) {
            console.error('Role check error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error during authorization',
                code: 'INTERNAL_SERVER_ERROR'
            });
        }
    };
};
exports.requireRole = requireRole;
// Asset management permissions middleware
const canManageAssets = (req, res, next) => {
    try {
        // Check if request is authenticated
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
                code: 'UNAUTHORIZED'
            });
        }
        const { role, customerId: userCustomerId } = req.user;
        // Admin has full access
        if (role === 'ADMIN') {
            return next();
        }
        // CustomerOwner can only manage assets for their own customer
        if (role === 'CUSTOMER_ACCOUNT_OWNER') {
            const requestCustomerId = req.body.customerId || req.params.customerId;
            if (!requestCustomerId) {
                return res.status(400).json({
                    success: false,
                    error: 'Customer ID is required',
                    code: 'MISSING_CUSTOMER_ID'
                });
            }
            if (parseInt(requestCustomerId) !== userCustomerId) {
                return res.status(403).json({
                    success: false,
                    error: 'You can only manage assets for your own customer',
                    code: 'FORBIDDEN'
                });
            }
            return next();
        }
        // CustomerContact and ServicePerson cannot manage assets
        return res.status(403).json({
            success: false,
            error: 'Insufficient permissions to manage assets',
            code: 'FORBIDDEN'
        });
    }
    catch (error) {
        console.error('Asset management permission check error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error during authorization',
            code: 'INTERNAL_SERVER_ERROR'
        });
    }
};
exports.canManageAssets = canManageAssets;
