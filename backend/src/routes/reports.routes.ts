import { Router, Request, Response, NextFunction } from 'express';
import { query } from 'express-validator';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate-request';
import { AuthUser } from '../types/express';
import { Prisma } from '@prisma/client';
import prisma from '../config/db';

const router = Router();

// Extend Express Request type to include user
interface AuthRequest extends Request {
  user?: AuthUser;
}

// Apply auth middleware to all routes
router.use(authenticate);



// Get ticket status distribution
router.get(
  '/tickets-status',
  validateRequest,
  requireRole(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_OWNER']),
  async (req: AuthRequest, res: Response) => {
    try {
      const { role, customerId } = req.user!;
      let where: Prisma.TicketWhereInput = {};

      if (role === 'SERVICE_PERSON') {
        where.assignedToId = req.user!.id;
      } else if (role === 'CUSTOMER_OWNER' && customerId) {
        where.customerId = customerId;
      }

      const distribution = await prisma.ticket.groupBy({
        by: ['status'],
        _count: { id: true },
        where
      });

      const statusColors = {
        'OPEN': '#ef4444',
        'IN_PROGRESS': '#f59e0b',
        'WAITING_FOR_RESPONSE': '#8b5cf6',
        'CLOSED': '#10b981'
      };

      const result = distribution.map(item => ({
        status: item.status,
        count: item._count.id,
        color: statusColors[item.status as keyof typeof statusColors] || '#6b7280'
      }));

      return res.json(result);
    } catch (error) {
      console.error('Error fetching ticket status data:', error);
      return res.status(500).json({ error: 'Failed to fetch ticket status data' });
    }
  }
);

// Get service performance data
router.get(
  '/service-performance',
  validateRequest,
  requireRole(['ADMIN']),
  async (req: AuthRequest, res: Response) => {
    try {
      if (req.user!.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied. Admin role required.' });
      }

      const servicePersons = await prisma.user.findMany({
        where: { role: 'SERVICE_PERSON' },
        select: {
          id: true,
          email: true,
          assignedTickets: {
            where: { status: 'CLOSED' },
            select: {
              id: true,
              createdAt: true,
              updatedAt: true
            }
          }
        }
      });

      const performanceData = servicePersons.map(person => {
        const completedTickets = person.assignedTickets.length;
        const avgResolutionTime = completedTickets > 0 
          ? person.assignedTickets.reduce((total: number, ticket: { createdAt: Date; updatedAt: Date }) => {
              const resolutionTime = new Date(ticket.updatedAt).getTime() - new Date(ticket.createdAt).getTime();
              return total + resolutionTime;
            }, 0) / completedTickets / (1000 * 60 * 60) // Convert to hours
          : 0;

        return {
          servicePersonId: person.id.toString(),
          name: person.email.split('@')[0], // Use email prefix as name
          completedTickets,
          avgResolutionTime: Math.round(avgResolutionTime * 100) / 100
        };
      });

      return res.json(performanceData);
    } catch (error) {
      console.error('Error fetching service performance data:', error);
      return res.status(500).json({ error: 'Failed to fetch service performance data' });
    }
  }
);

// Get ticket trends
router.get(
  '/ticket-trends',
  [
    query('days')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Days must be between 1 and 365')
      .toInt(),
    validateRequest
  ],
  requireRole(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_OWNER']),
  async (req: AuthRequest, res: Response) => {
    try {
      const { role, customerId } = req.user!;
      const { days = 30 } = req.query;
      
      let whereClause = Prisma.empty;
      if (role === 'SERVICE_PERSON') {
        whereClause = Prisma.sql`WHERE assignedToId = ${req.user!.id}`;
      } else if (role === 'CUSTOMER_OWNER' && customerId) {
        whereClause = Prisma.sql`WHERE customerId = ${customerId}`;
      }

      const trends = await prisma.$queryRaw`
        SELECT 
          DATE(createdAt) as date,
          COUNT(CASE WHEN status = 'OPEN' THEN 1 END) as opened,
          COUNT(CASE WHEN status = 'CLOSED' THEN 1 END) as closed
        FROM Ticket
        ${whereClause}
        AND createdAt >= DATE_SUB(NOW(), INTERVAL ${Number(days)} DAY)
        GROUP BY DATE(createdAt)
        ORDER BY date ASC
      `;

      return res.json(trends);
    } catch (error) {
      console.error('Error fetching ticket trends:', error);
      return res.status(500).json({ error: 'Failed to fetch ticket trends' });
    }
  }
);

export default router;
