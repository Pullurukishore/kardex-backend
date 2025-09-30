import { Router, Request, Response } from 'express';
import {
  listZoneUsers,
  getZoneUser,
  assignUserToZones,
  updateZoneUserAssignments,
  removeZoneUserAssignments,
  deleteZoneUser,
  getAllUsersForZoneAssignment,
  createZoneUserWithZones
} from '../controllers/zoneUser.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate-request';
import { body, param, query } from 'express-validator';
import prisma from '../config/db';
import { AuthUser } from '../types/express';

type AuthRequest = Request & {
  user?: AuthUser;
};

const router = Router();

router.use(authenticate);

// Create a new zone user with zone assignments
router.post(
  '/create-with-zones',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('phone').optional().isMobilePhone('any').withMessage('Please provide a valid phone number'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('serviceZoneIds')
      .isArray({ min: 1 })
      .withMessage('At least one service zone is required'),
    body('serviceZoneIds.*').isInt().withMessage('Invalid service zone ID'),
    body('isActive').optional().isBoolean(),
    validateRequest
  ],
  requireRole(['ADMIN']),
  createZoneUserWithZones
);

// Get all zone users with pagination and search
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
    validateRequest
  ],
  requireRole(['ADMIN']),
  listZoneUsers
);

// Get all zone users (simplified for dropdowns)
router.get(
  '/zone-users',
  [
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']),
  async (req: AuthRequest, res: Response) => {
    try {
      const users = await prisma.user.findMany({
        where: {
          role: 'ZONE_USER',
          isActive: true
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          serviceZones: {
            select: {
              userId: true,
              serviceZoneId: true,
              serviceZone: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  isActive: true
                }
              }
            }
          }
        },
        orderBy: {
          name: 'asc'
        }
      });
      res.json(users);
    } catch (error) {
      console.error('Error fetching zone users:', error);
      res.status(500).json({ error: 'Failed to fetch zone users' });
    }
  }
);

// Get all users available for zone assignment
router.get(
  '/available',
  [
    query('search').optional().trim(),
    query('role').optional().isIn(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER']),
    validateRequest
  ],
  requireRole(['ADMIN']),
  getAllUsersForZoneAssignment
);

// Get a specific zone user
router.get(
  '/:id',
  [
    param('id').isInt().toInt().withMessage('Invalid user ID'),
    validateRequest
  ],
  requireRole(['ADMIN']),
  getZoneUser
);

// Assign user to zones (create new assignment)
router.post(
  '/',
  [
    body('userId').isInt().withMessage('Valid user ID is required'),
    body('serviceZoneIds').optional().isArray().withMessage('serviceZoneIds must be an array'),
    body('serviceZoneIds.*').optional().isInt().withMessage('Each service zone ID must be an integer'),
    validateRequest
  ],
  requireRole(['ADMIN']),
  assignUserToZones
);

// Update zone assignments for a user
router.put(
  '/:id',
  [
    param('id').isInt().toInt().withMessage('Invalid user ID'),
    body('serviceZoneIds').optional().isArray().withMessage('serviceZoneIds must be an array'),
    body('serviceZoneIds.*').optional().isInt().withMessage('Each service zone ID must be an integer'),
    validateRequest
  ],
  requireRole(['ADMIN']),
  updateZoneUserAssignments
);

// Remove all zone assignments for a user
router.delete(
  '/:id',
  [
    param('id').isInt().toInt().withMessage('Invalid user ID'),
    validateRequest
  ],
  requireRole(['ADMIN']),
  deleteZoneUser
);

export default router;
