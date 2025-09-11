import { Response, NextFunction, Request } from 'express';

// Helper function to get user from request
function getUserFromRequest(req: Request) {
  return (req as any).user;
}

// Middleware to check if user can manage customers
export const canManageCustomers = (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
    }

    const { role } = user;

    // Only ADMIN can manage customers
    if (role === 'ADMIN') {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'Only administrators can manage customers',
      code: 'FORBIDDEN'
    });
  } catch (error) {
    console.error('Customer management permission check error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error during authorization',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Middleware to check if user can manage contacts
export const canManageContacts = (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
    }

    const { role, customerId: userCustomerId } = user;
    const customerId = parseInt(req.params.id);

    if (isNaN(customerId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid customer ID',
        code: 'INVALID_CUSTOMER_ID'
      });
    }

    // ADMIN can manage contacts for any customer
    if (role === 'ADMIN') {
      return next();
    }

    // CUSTOMER_OWNER can only manage contacts for their own customer
    if (role === 'CUSTOMER_OWNER') {
      if (!userCustomerId || userCustomerId !== customerId) {
        return res.status(403).json({
          success: false,
          error: 'You can only manage contacts for your own customer',
          code: 'FORBIDDEN'
        });
      }
      return next();
    }

    // CUSTOMER_CONTACT and SERVICE_PERSON cannot manage contacts
    return res.status(403).json({
      success: false,
      error: 'Insufficient permissions to manage contacts',
      code: 'FORBIDDEN'
    });
  } catch (error) {
    console.error('Contact management permission check error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error during authorization',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Middleware to check if user can view customers
export const canViewCustomers = (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
    }

    const { role } = user;

    // ADMIN and SERVICE_PERSON can view all customers
    if (role === 'ADMIN' || role === 'SERVICE_PERSON') {
      return next();
    }

    // CUSTOMER_OWNER and CUSTOMER_CONTACT can only view their own customer
    if (role === 'CUSTOMER_OWNER' || role === 'CUSTOMER_CONTACT') {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'Insufficient permissions to view customers',
      code: 'FORBIDDEN'
    });
  } catch (error) {
    console.error('Customer view permission check error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error during authorization',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};
