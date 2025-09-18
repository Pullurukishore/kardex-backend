// backend/src/routes/reports.routes.ts
import express from 'express';
import { generateReport, exportReport, generateZoneReport, exportZoneReport } from '../controllers/reports.controller';
import { authMiddleware } from '../middleware/auth';
const router = express.Router();

// Generate reports (Admin only)
router.get('/general', authMiddleware(['ADMIN']), generateReport);
router.get('/generate', authMiddleware(['ADMIN']), generateReport);

// Export reports (Admin only)
router.get('/general/export', authMiddleware(['ADMIN']), exportReport);
router.get('/export', authMiddleware(['ADMIN']), exportReport);
router.post('/export', authMiddleware(['ADMIN']), exportReport);

// Generate zone reports (Zone users and service persons)
router.get('/zone', authMiddleware(['ZONE_USER', 'SERVICE_PERSON', 'ADMIN']), generateZoneReport);

// Export zone reports (Zone users and service persons)
router.get('/zone/export', authMiddleware(['ZONE_USER', 'SERVICE_PERSON', 'ADMIN']), exportZoneReport);

export default router;