import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { body, validationResult, ValidationChain } from 'express-validator';
import { UserRole } from '@prisma/client';
import { 
  register, 
  login, 
  logout, 
  getCurrentUser,
  refreshToken,
  forgotPassword,
  resetPassword
} from '../controllers/auth.controller';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.middleware';

// Type guard for UserRole
const isUserRole = (value: unknown): value is UserRole => {
  return typeof value === 'string' && 
    (value === 'ADMIN' || 
     value === 'ZONE_USER' || 
     value === 'SERVICE_PERSON' || 
     value === 'CUSTOMER_OWNER');
};

// Role validation middleware
const validateRole = (value: unknown) => {
  if (!isUserRole(value)) {
    throw new Error('Invalid role');
  }
  return true;
};

// Helper function to validate request
const validateRequest = (validations: any[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    await Promise.all(validations.map((validation: any) => validation.run(req)));
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }
    return res.status(400).json({ errors: errors.array() });
  };
};
const router = Router();

// Register route
router.post(
  '/register',
  validateRequest([
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('role').custom(validateRole),
    body('customerId').optional().isInt(),
    body('phone').optional().isMobilePhone('any'),
    body('name').optional().isString().trim()
  ]),
  (register as unknown) as RequestHandler
);

// Login route
router.post(
  '/login',
  validateRequest([
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ]),
  (login as unknown) as RequestHandler
);

// Request OTP route (placeholder for future implementation)
router.post(
  '/request-otp',
  validateRequest([
    body('email').isEmail().normalizeEmail()
  ]),
  (req: Request, res: Response) => {
    return res.status(501).json({ message: 'OTP functionality not yet implemented' });
  }
);

// Login with OTP route (placeholder for future implementation)
router.post(
  '/login-with-otp',
  validateRequest([
    body('email').isEmail().normalizeEmail(),
    body('otp').isLength({ min: 6, max: 6 })
  ]),
  (req: Request, res: Response) => {
    return res.status(501).json({ message: 'OTP login not yet implemented' });
  }
);

// Protected routes - require authentication
router.get('/me', authenticate, (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;
  return getCurrentUser(authReq, res).catch(next);
});

router.post('/logout', authenticate, (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;
  return logout(authReq, res).catch(next);
});

// Refresh token route (no authentication required)
router.post('/refresh-token', (req, res, next) => {
  return refreshToken(req, res).catch(next);
});

// Forgot password route
router.post(
  '/forgot-password',
  validateRequest([
    body('email').isEmail().normalizeEmail()
  ]),
  (req: Request, res: Response, next: NextFunction) => {
    return forgotPassword(req, res).catch(next);
  }
);

// Reset password route
router.post(
  '/reset-password',
  validateRequest([
    body('token').notEmpty().isString(),
    body('password').isLength({ min: 6 })
  ]),
  (req: Request, res: Response, next: NextFunction) => {
    return resetPassword(req, res).catch(next);
  }
);

export default router;
