"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorLogger = exports.requestLogger = void 0;
// Request logging middleware
const requestLogger = (req, res, next) => {
    const timestamp = new Date().toISOString();
    const method = req.method;
    const url = req.originalUrl || req.url;
    // Check if request is authenticated
    const authReq = req;
    const userRole = authReq.user?.role || 'UNAUTHENTICATED';
    console.log(`--- API Request ---`);
    console.log(`[${timestamp}] ${method} ${url}`);
    console.log(`User Role: ${userRole}`);
    // Log unauthorized access attempts for protected routes
    if (!authReq.user && url.startsWith('/api/') && !url.includes('/auth/')) {
        console.log('Unauthorized API access attempt');
    }
    next();
};
exports.requestLogger = requestLogger;
// Error logging middleware
const errorLogger = (err, req, res, next) => {
    const timestamp = new Date().toISOString();
    const method = req.method;
    const url = req.originalUrl || req.url;
    console.error(`--- API Error ---`);
    console.error(`[${timestamp}] ${method} ${url}`);
    console.error(`Error: ${err.message}`);
    console.error(`Stack: ${err.stack}`);
    next(err);
};
exports.errorLogger = errorLogger;
