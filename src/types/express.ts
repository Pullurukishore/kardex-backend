// This file defines custom Express types for our application

import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../config/auth';

// Define the user type that will be attached to the request
export interface AuthUser {
  id: number;
  role: UserRole;
  customerId?: number;
  email?: string;
  isActive?: boolean;
  zoneIds?: number[];
  customer?: {
    id: number;
    companyName: string;
    isActive: boolean;
  };
  [key: string]: any; // Allow additional properties
}

// Export a type that can be used throughout the application
export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

// Type guard to check if a request is authenticated
export function isAuthenticatedRequest(
  req: Request | AuthenticatedRequest
): req is AuthenticatedRequest {
  return 'user' in req && req.user !== undefined;
}

// Type for request handlers that require authentication
export type AuthenticatedRequestHandler = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => any;

// Type for request handlers that don't require authentication
export type UnauthenticatedRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => any;
