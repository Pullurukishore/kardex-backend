import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';

// Request logging middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl || req.url;
  
  // Check if request is authenticated
  const authReq = req as AuthenticatedRequest;
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

// Error logging middleware
export const errorLogger = (err: any, req: Request, res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl || req.url;
  
  console.error(`--- API Error ---`);
  console.error(`[${timestamp}] ${method} ${url}`);
  console.error(`Error: ${err.message}`);
  console.error(`Stack: ${err.stack}`);
  
  next(err);
};
