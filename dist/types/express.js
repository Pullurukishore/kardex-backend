"use strict";
// This file defines custom Express types for our application
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAuthenticatedRequest = isAuthenticatedRequest;
// Type guard to check if a request is authenticated
function isAuthenticatedRequest(req) {
    return 'user' in req && req.user !== undefined;
}
