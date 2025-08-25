import { Response, NextFunction, Request } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../config/auth';
import { JWT_CONFIG } from '../config/auth';
import prisma from '../config/db';

// Import the centralized type definition
import { AuthUser, AuthenticatedRequest } from '../types/express';

// Re-export the AuthenticatedRequest type
export { AuthenticatedRequest };

// JWT Payload interface
export interface JwtPayload {
  id: number;
  role: UserRole;
  customerId?: number;
  iat?: number;
  exp?: number;
}

// Type guard to check if request is authenticated
export function isAuthenticatedRequest(
  req: Request | AuthenticatedRequest
): req is AuthenticatedRequest {
  return 'user' in req && req.user !== undefined;
}

// Type for requests with cookies
type AuthedRequest = Request & {
  user?: AuthUser;
  cookies: {
    accessToken?: string;
    refreshToken?: string;
    [key: string]: string | undefined;
  };
};

export const authenticate = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check for token in Authorization header first
    let token: string | undefined;
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Extract token from 'Bearer <token>'
      token = authHeader.substring(7);
    } else if (req.cookies?.accessToken) {
      // Fall back to cookie if no Authorization header
      token = req.cookies.accessToken;
    } else if (req.cookies?.refreshToken) {
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
    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, JWT_CONFIG.secret) as JwtPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return res.status(401).json({
          success: false,
          error: 'Token has expired',
          code: 'TOKEN_EXPIRED'
        });
      } else if (error instanceof jwt.JsonWebTokenError) {
        return res.status(401).json({
          success: false,
          error: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      }
      throw error; // Re-throw other errors
    }

    // Find user with minimal required fields
    const user = await prisma.user.findUnique({
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
    const userPayload: AuthUser = {
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
  } catch (error) {
    console.error('Authentication error:', error);
    
    // Handle specific JWT errors
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }
    
    if (error instanceof jwt.TokenExpiredError) {
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

// Role-based access control middleware
export const requireRole = (roles: UserRole | UserRole[]) => {
  const requiredRoles = Array.isArray(roles) ? roles : [roles];
  
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
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
    } catch (error) {
      console.error('Role check error:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Internal server error during authorization',
        code: 'INTERNAL_SERVER_ERROR'
      });
    }
  };
};

// Asset management permissions middleware
export const canManageAssets = (req: AuthedRequest, res: Response, next: NextFunction) => {
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
    if (role === 'CUSTOMER_OWNER') {
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
  } catch (error) {
    console.error('Asset management permission check error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error during authorization',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};
