// This file extends the Express Request type to include the user property
// This is the single source of truth for the Request type in our application

import 'express';
import { UserRole } from '../config/auth';

export {}; // This makes the file a module

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

// Base request interface with common properties
interface BaseRequest extends Express.Request {
  body: any;
  query: {
    [key: string]: string | string[] | undefined;
  };
  params: {
    [key: string]: string | undefined;
  };
  [key: string]: any;
}

// Extend Express namespace to include our custom types
declare global {
  namespace Express {
    // Extend the base Request interface
    interface Request extends BaseRequest {
      user?: AuthUser;
    }
  }
}

// Export a type that can be used throughout the application
export interface AuthenticatedRequest extends BaseRequest {
  user: AuthUser;
}

// Type guard to check if a request is authenticated
export function isAuthenticatedRequest(
  req: Express.Request | AuthenticatedRequest
): req is AuthenticatedRequest {
  return 'user' in req && req.user !== undefined;
}

// Type for request handlers that require authentication
export type AuthenticatedRequestHandler = (
  req: AuthenticatedRequest,
  res: Express.Response,
  next: Express.NextFunction
) => any;

// Type for request handlers that don't require authentication
export type UnauthenticatedRequestHandler = (
  req: Express.Request,
  res: Express.Response,
  next: Express.NextFunction
) => any;