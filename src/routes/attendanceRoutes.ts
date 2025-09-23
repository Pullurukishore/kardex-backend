import { Router } from 'express';
import { attendanceController } from '../controllers/attendanceController';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { cronService } from '../services/cron.service';

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

// Debug endpoints for cron job status (admin only)
router.get('/cron-status', requireRole(['ADMIN']), (req, res) => {
  try {
    const jobs = cronService.listJobs();
    const autoCheckoutStatus = cronService.getJobStatus('auto-checkout');
    
    res.json({
      success: true,
      data: {
        activeJobs: jobs,
        autoCheckoutActive: autoCheckoutStatus,
        currentTime: new Date().toISOString(),
        nextSevenPM: (() => {
          const now = new Date();
          const next7PM = new Date();
          next7PM.setHours(19, 0, 0, 0);
          if (now >= next7PM) {
            next7PM.setDate(next7PM.getDate() + 1);
          }
          return next7PM.toISOString();
        })()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get cron status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Restart auto-checkout job (admin only)
router.post('/restart-cron', requireRole(['ADMIN']), (req, res) => {
  try {
    cronService.stopJob('auto-checkout');
    cronService.startAutoCheckoutJob();
    
    res.json({
      success: true,
      message: 'Auto-checkout job restarted successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to restart cron job',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
