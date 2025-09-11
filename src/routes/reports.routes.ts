// backend/src/routes/reports.routes.ts
import express from 'express';
import { generateReport, exportReport } from '../controllers/reports.controller';
import { authMiddleware } from '../middleware/auth';
const router = express.Router();

// Generate reports
router.get('/general', authMiddleware(['ADMIN']), generateReport);

// Export reports
router.get('/general/export', authMiddleware(['ADMIN']), exportReport);

export default router;