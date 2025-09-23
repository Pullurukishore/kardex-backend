import { Router } from 'express';
import { servicePersonAttendanceController } from '../controllers/servicePersonAttendanceController';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router = Router();

// All routes require SERVICE_PERSON authentication
router.use(authenticate);
router.use(requireRole(['SERVICE_PERSON']));

// Get service person's own attendance records
router.get('/', servicePersonAttendanceController.getMyAttendance);

// Get service person's attendance statistics
router.get('/stats', servicePersonAttendanceController.getMyAttendanceStats);

// Get specific attendance record details
router.get('/:id', servicePersonAttendanceController.getMyAttendanceDetail);

export default router;
