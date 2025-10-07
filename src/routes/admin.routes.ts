import express from 'express';
import { authMiddleware } from '../middleware/auth';
import { authenticate } from '../middleware/auth.middleware';
import {
  getFSADashboard,
  exportFSAData
} from '../controllers/fsaController';
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
  toggleUserStatus,
  getUserById
} from '../controllers/admin.controller';

const router = express.Router();

// FSA Routes (Admin only)
router.get('/fsa', authMiddleware(['ADMIN']), getFSADashboard);
router.post('/fsa/export', authMiddleware(['ADMIN']), exportFSAData);

// Zone Users Routes (Admin only)
router.get('/zone-users', authMiddleware(['ADMIN']), async (req, res) => {
  try {
    const { page = 1, search = '', limit = 10 } = req.query;
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const where: any = {
      role: { in: ['ZONE_USER', 'SERVICE_PERSON'] }
    };

    if (search) {
      where.OR = [
        { email: { contains: search as string, mode: 'insensitive' } },
        { name: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    const [zoneUsers, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        include: {
          serviceZones: {
            include: {
              serviceZone: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count({ where })
    ]);

    const totalPages = Math.ceil(total / take);

    res.json({
      success: true,
      data: {
        zoneUsers: zoneUsers.map((user: any) => ({
          ...user,
          id: user.id.toString()
        })),
        pagination: {
          currentPage: parseInt(page as string),
          totalPages,
          totalItems: total,
          itemsPerPage: take
        },
        stats: {
          totalUsers: total,
          activeUsers: zoneUsers.filter((u: any) => u.isActive).length,
          inactiveUsers: zoneUsers.filter((u: any) => !u.isActive).length
        }
      }
    });
  } catch (error) {
    console.error('Error fetching zone users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch zone users'
    });
  }
});

// User Management Routes (Admin only)
router.get('/users', authenticate, (req, res, next) => {
  const authReq = req as any;
  return getUsers(authReq, res).catch(next);
});

router.post('/users', authenticate, (req, res, next) => {
  const authReq = req as any;
  return createUser(authReq, res).catch(next);
});

router.get('/users/:id', authenticate, (req, res, next) => {
  const authReq = req as any;
  return getUserById(authReq, res).catch(next);
});

router.put('/users/:id', authenticate, (req, res, next) => {
  const authReq = req as any;
  return updateUser(authReq, res).catch(next);
});

router.delete('/users/:id', authenticate, (req, res, next) => {
  const authReq = req as any;
  return deleteUser(authReq, res).catch(next);
});

router.post('/users/:id/reset-password', authenticate, (req, res, next) => {
  const authReq = req as any;
  return resetUserPassword(authReq, res).catch(next);
});

router.patch('/users/:id/toggle-status', authenticate, (req, res, next) => {
  const authReq = req as any;
  return toggleUserStatus(authReq, res).catch(next);
});

export default router;
