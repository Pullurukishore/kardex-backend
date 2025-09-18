import { Router } from 'express';
import { attendanceController } from '../controllers/attendanceController';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router = Router();

// All attendance routes require authentication
router.use(authenticate);

// Check in
router.post('/checkin', requireRole(['SERVICE_PERSON']), attendanceController.checkIn);

// Check out
router.post('/checkout', requireRole(['SERVICE_PERSON']), attendanceController.checkOut);

// Get current attendance status
router.get('/status', requireRole(['SERVICE_PERSON']), attendanceController.getCurrentStatus);

// Get attendance history
router.get('/history', requireRole(['SERVICE_PERSON']), attendanceController.getAttendanceHistory);

// Get attendance statistics
router.get('/stats', requireRole(['SERVICE_PERSON']), attendanceController.getAttendanceStats);

// Re-check-in after mistaken checkout
router.post('/re-checkin', requireRole(['SERVICE_PERSON']), attendanceController.reCheckIn);

// Auto checkout (for cron job or admin)
router.post('/auto-checkout', requireRole(['ADMIN']), attendanceController.autoCheckout);

// Get all attendance records (admin/zone user)
router.get('/all', requireRole(['ADMIN', 'ZONE_USER']), attendanceController.getAllAttendance);

// Get live tracking data (admin/zone user)
router.get('/live-tracking', requireRole(['ADMIN', 'ZONE_USER']), attendanceController.getLiveTracking);

export default router;
