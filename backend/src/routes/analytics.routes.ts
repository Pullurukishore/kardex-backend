// import { Router, Response, Request } from 'express';
// import { query } from 'express-validator';
// import { getTicketStats, getSlaMetrics, getCustomerSatisfaction } from '../controllers/analytics.controller';
// import { authenticate, requireRole } from '../middleware/auth.middleware';
// import { validateRequest } from '../middleware/validate-request';

// // ✅ Use the existing AuthUser type from your Express augmentation
// import { AuthUser } from '../types/express';

// // Extend Express Request but keep `user` type consistent
// interface AnalyticsRequest extends Request {
//   user: AuthUser; // match exactly the one from types/express (id: number)
// }

// const router = Router();

// router.use(authenticate);
// router.use(requireRole(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER_OWNER']));

// router.get(
//   '/tickets/stats',
//   [
//     query('period')
//       .optional()
//       .isIn(['today', 'yesterday', 'this_week', 'this_month', 'last_month', '30d', '90d'])
//       .withMessage('Invalid period'),
//     validateRequest
//   ],
//   (req: AnalyticsRequest, res: Response) => getTicketStats(req, res)
// );

// router.get(
//   '/sla-metrics',
//   [
//     query('period')
//       .optional()
//       .isIn(['today', 'yesterday', 'this_week', 'this_month', 'last_month', '30d', '90d'])
//       .withMessage('Invalid period'),
//     validateRequest
//   ],
//   (req: AnalyticsRequest, res: Response) => getSlaMetrics(req, res)
// );

// router.get(
//   '/customer-satisfaction',
//   [
//     query('startDate').optional().isISO8601().withMessage('Invalid start date'),
//     query('endDate').optional().isISO8601().withMessage('Invalid end date'),
//     validateRequest
//   ],
//   (req: AnalyticsRequest, res: Response) => getCustomerSatisfaction(req, res)
// );

// export default router;
