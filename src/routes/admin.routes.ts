import express from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  getFSADashboard,
  exportFSAData
} from '../controllers/fsaController';

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

export default router;
