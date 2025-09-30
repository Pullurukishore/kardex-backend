"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = exports.REFRESH_TOKEN_CONFIG = exports.JWT_CONFIG = exports.OTP_CONFIG = exports.UserRole = void 0;
exports.verifyToken = verifyToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
// Import the UserRole enum from Prisma client
const client_1 = require("@prisma/client");
Object.defineProperty(exports, "UserRole", { enumerable: true, get: function () { return client_1.UserRole; } });
// Fallback JWT secret for development
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-7f3a1b9e5d8c2f6a4e0b7d5f8a3c1e9b2f6d4a8c7e1b3f9a5d8c2e6b4f0a7d9-extra-long-secret-key';
// Fallback refresh token secret for development
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'refresh-secret-9f4b2e8d6c1a5f9e2b7d4c8a1e6b3f9a5d8c2e7b4f0a9d6c1e5b2f8a7d4c9e1b3f9a5d8c2e6b4f0a7d9-extra-long-secret-key';
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
}
if (!REFRESH_TOKEN_SECRET || REFRESH_TOKEN_SECRET.length < 32) {
    throw new Error('REFRESH_TOKEN_SECRET must be at least 32 characters long');
}
// Using JWT_SECRET from environment or fallback value
// OTP configuration
exports.OTP_CONFIG = {
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || '10'), // Default 10 minutes
    length: 6
};
exports.JWT_CONFIG = {
    secret: JWT_SECRET,
    expiresIn: '1d'
};
exports.REFRESH_TOKEN_CONFIG = {
    secret: REFRESH_TOKEN_SECRET,
    expiresIn: '7d'
};
const generateToken = (userId, role) => {
    if (!exports.JWT_CONFIG.secret) {
        throw new Error('JWT secret is not configured');
    }
    return jsonwebtoken_1.default.sign({ id: userId, role }, exports.JWT_CONFIG.secret, { expiresIn: exports.JWT_CONFIG.expiresIn });
};
exports.generateToken = generateToken;
function verifyToken(token) {
    if (!exports.JWT_CONFIG.secret) {
        throw new Error('JWT secret is not configured');
    }
    return jsonwebtoken_1.default.verify(token, exports.JWT_CONFIG.secret);
}
