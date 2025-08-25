"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const auth_1 = require("../config/auth");
const db_1 = __importDefault(require("../config/db"));
// Using the centralized type definition from src/types/express.d.ts
// Validate if a string is a valid UserRole
const isValidUserRole = (role) => {
    return ['CUSTOMER', 'CUSTOMER_SUB_USER', 'SERVICE_PERSON', 'ADMIN'].includes(role);
};
const authMiddleware = (roles = []) => async (req, res, next) => {
    try {
        // Get token from Authorization header
        const authHeader = req.header('Authorization');
        if (!authHeader) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        // Extract token from 'Bearer <token>' format
        const token = authHeader.replace(/^Bearer\s+/i, '');
        if (!token) {
            return res.status(401).json({ error: 'Invalid token format' });
        }
        // Verify and decode the token
        const decoded = (0, auth_1.verifyToken)(token);
        // Validate token payload structure
        if (!decoded || typeof decoded !== 'object' || !('id' in decoded) || !('role' in decoded)) {
            return res.status(401).json({ error: 'Invalid token payload' });
        }
        // Ensure the role from token is valid
        const userRole = String(decoded.role).toUpperCase();
        if (!isValidUserRole(userRole)) {
            return res.status(403).json({ error: 'Invalid user role in token' });
        }
        // Check if user has required role
        if (roles.length > 0 && !roles.includes(userRole)) {
            return res.status(403).json({
                error: 'Insufficient permissions',
                requiredRoles: roles,
                userRole: userRole
            });
        }
        // Look up basic user info
        const userRecord = await db_1.default.user.findUnique({
            where: { id: decoded.id },
            select: {
                id: true,
                role: true
            }
        });
        if (!userRecord) {
            return res.status(401).json({ error: 'User not found' });
        }
        // Get the user's role and ensure it's in the correct case
        const dbRole = userRecord.role.toUpperCase();
        // Ensure database role matches token role
        if (dbRole !== userRole) {
            return res.status(403).json({
                error: 'Role mismatch',
                tokenRole: userRole,
                dbRole: dbRole
            });
        }
        // For now, we'll use the user's ID as customerId
        // In a production app, you'd want to handle parent-child relationships here
        const customerId = userRecord.id;
        // Attach user info to request object
        req.user = {
            id: userRecord.id,
            role: userRole,
            customerId
        };
        next();
    }
    catch (error) {
        console.error('Authentication error:', error);
        // Handle specific JWT errors
        if (error && typeof error === 'object' && 'name' in error) {
            const err = error;
            if (err.name === 'JsonWebTokenError') {
                return res.status(401).json({ error: 'Invalid token' });
            }
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expired' });
            }
        }
        // Default error response
        const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
        return res.status(500).json({
            error: 'Authentication failed',
            details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        });
    }
};
exports.authMiddleware = authMiddleware;
