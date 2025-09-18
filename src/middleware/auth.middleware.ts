import { Response, NextFunction, Request } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../config/auth';
import { JWT_CONFIG, REFRESH_TOKEN_CONFIG } from '../config/auth';
import prisma from '../config/db';

// Import the centralized type definition
import { AuthUser, AuthenticatedRequest } from '../types/express';

// Re-export the AuthenticatedRequest type
export { AuthenticatedRequest };

// JWT Payload interfaces
export interface JwtPayload {
  id: number;
  role: UserRole;
  customerId?: number;
  version?: string; // Token version for invalidation
  iat?: number;
  exp?: number;
}

interface RefreshTokenPayload extends JwtPayload {
  version: string; // Required for refresh tokens
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

// Helper function to verify and decode JWT token
const verifyToken = (token: string, secret: string): JwtPayload | null => {
  try {
    return jwt.verify(token, secret) as JwtPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError || error instanceof jwt.JsonWebTokenError) {
      return null;
    }
    throw error;
  }
};

// Helper to generate new access token
const generateAccessToken = (user: { id: number; role: UserRole; customerId?: number }, version: string) => {
  return jwt.sign(
    { 
      id: user.id, 
      role: user.role, 
      customerId: user.customerId,
      version 
    },
    JWT_CONFIG.secret,
    { expiresIn: '1d' } // 1 day expiry for access token
  );
};

export const authenticate = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check for token in Authorization header first
    let accessToken: string | undefined;
    let refreshToken: string | undefined;
    
    // Get access token from Authorization header or cookie
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7);
    } else if (req.cookies?.accessToken) {
      accessToken = req.cookies.accessToken;
    } else if (req.cookies?.token) {
      accessToken = req.cookies.token;
    }
    
    // Get refresh token from cookie
    refreshToken = req.cookies?.refreshToken;
    
    // If no tokens provided
    if (!accessToken && !refreshToken) {
      return res.status(401).json({ 
        success: false,
        error: 'No authentication token provided',
        code: 'MISSING_AUTH_TOKEN'
      });
    }
    
    // Try to verify access token first
    let decoded: JwtPayload | null = null;
    let isRefreshing = false;
    
    if (accessToken) {
      decoded = verifyToken(accessToken, JWT_CONFIG.secret);
      
      // If access token is expired but we have a refresh token, try to refresh
      if (!decoded && refreshToken) {
        isRefreshing = true;
      }
    }
    
    // If we need to refresh the token
    if ((!decoded || isRefreshing) && refreshToken) {
      const refreshPayload = verifyToken(refreshToken, REFRESH_TOKEN_CONFIG.secret) as RefreshTokenPayload | null;
      
      if (!refreshPayload?.id) {
        return res.status(401).json({
          success: false,
          error: 'Invalid refresh token',
          code: 'INVALID_REFRESH_TOKEN'
        });
      }
      
      // Find user with refresh token
      const user = await prisma.user.findUnique({
        where: { id: refreshPayload.id, isActive: true },
        select: { 
          id: true, 
          email: true, 
          role: true, 
          customerId: true, 
          tokenVersion: true,
          refreshToken: true
        }
      });
      
      // Validate refresh token
      if (!user || user.refreshToken !== refreshToken) {
        return res.status(401).json({
          success: false,
          error: 'Invalid refresh token',
          code: 'INVALID_REFRESH_TOKEN'
        });
      }
      
      // Check token version
      if (refreshPayload.version !== user.tokenVersion) {
        return res.status(401).json({
          success: false,
          error: 'Token has been revoked',
          code: 'TOKEN_REVOKED'
        });
      }
      
      // Generate new access token with proper null check for customerId
      const newAccessToken = generateAccessToken(
        {
          id: user.id,
          role: user.role,
          customerId: user.customerId ?? undefined // Convert null to undefined
        },
        user.tokenVersion
      );
      
      // Set new access token in response cookie
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        maxAge: 24 * 60 * 60 * 1000, // 1 day
        path: '/'
      };
      
      res.cookie('accessToken', newAccessToken, cookieOptions);
      res.cookie('token', newAccessToken, cookieOptions);
      
      // Set the new token in the request for the current request
      accessToken = newAccessToken;
      decoded = verifyToken(newAccessToken, JWT_CONFIG.secret);
    }

    // If we still don't have a valid decoded token
    if (!decoded) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    // Find user with minimal required fields
    try {
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
          tokenVersion: true,
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
        return res.status(401).json({
          success: false,
          error: 'User not found or inactive',
          code: 'USER_NOT_FOUND'
        });
      }

      // Check token version for access token (not needed for refresh token flow)
      if (decoded.version && decoded.version !== user.tokenVersion) {
        return res.status(401).json({
          success: false,
          error: 'Token has been revoked',
          code: 'TOKEN_REVOKED'
        });
      }

      // Get user's service zones if they have any
      const serviceZones = await prisma.servicePersonZone.findMany({
        where: { userId: user.id },
        select: { serviceZoneId: true }
      });
      
      const zoneIds = serviceZones.map(sz => sz.serviceZoneId);
      
      // Create user object with only necessary properties
      const userPayload: AuthUser = {
        id: user.id,
        email: user.email,
        role: user.role,
        customerId: user.customerId ?? undefined,
        isActive: user.isActive,
        zoneIds: zoneIds.length > 0 ? zoneIds : undefined,
        customer: user.customer ? {
          id: user.customer.id,
          companyName: user.customer.companyName,
          isActive: user.customer.isActive
        } : undefined
      };

      // Update last active timestamp (don't await to avoid blocking)
      prisma.user.update({
        where: { id: user.id },
        data: { lastActiveAt: new Date() }
      }).catch(console.error);

      // Attach user to request
      req.user = userPayload;
      next();
    } catch (error: unknown) {
      console.error('User lookup error:', error);
      
      // Handle Prisma errors
      if (error instanceof Error && 'code' in error) {
        if (error.code === 'P2025') { // Record not found
          return res.status(404).json({
            success: false,
            error: 'User not found',
            code: 'USER_NOT_FOUND'
          });
        }
      }
      
      // Handle other errors
      return res.status(500).json({
        success: false,
        error: 'Error looking up user',
        code: 'USER_LOOKUP_ERROR',
        ...(process.env.NODE_ENV === 'development' && error instanceof Error ? {
          details: error.message,
          stack: error.stack
        } : {})
      });
    }
  } catch (error: unknown) {
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
      code: 'AUTH_FAILED',
      ...(process.env.NODE_ENV === 'development' && error instanceof Error ? {
        details: error.message,
        stack: error.stack
      } : {})
    });
  }
};

// Role-based access control middleware
export const requireRole = (roles: UserRole | UserRole[]) => {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!isAuthenticatedRequest(req)) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    // Admin has access to everything
    if (userRole === UserRole.ADMIN) {
      return next();
    }

    // Check if user has any of the allowed roles
    if (allowedRoles.includes(userRole)) {
      return next();
    }

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        message: 'Insufficient permissions',
        requiredRoles: allowedRoles,
        userRole,
      });
    }

    next();
  };
};

// Check if user has any of the required roles
export const hasAnyRole = (userRole: UserRole, requiredRoles: UserRole[]): boolean => {
  if (userRole === 'ADMIN') return true;
  if (userRole === 'ZONE_USER' && requiredRoles.includes('SERVICE_PERSON' as UserRole)) return true;
  return requiredRoles.includes(userRole);
};

// Check if user can manage tickets
export const canManageTickets = (userRole: UserRole): boolean => {
  return ['ADMIN', 'ZONE_USER', 'SERVICE_PERSON'].includes(userRole);
};

// Asset management permissions middleware (for route handlers)
export const canManageAssets = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    // Check if request is authenticated
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { role, customerId } = req.user;

    // Admins and ZONE_USERs can manage assets
    if (role === UserRole.ADMIN || role === UserRole.ZONE_USER) {
      return next();
    }

    // Only ADMIN and ZONE_USER can manage assets
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
