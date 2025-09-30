"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const attendanceController_1 = require("../controllers/attendanceController");
const auth_middleware_1 = require("../middleware/auth.middleware");
const cron_service_1 = require("../services/cron.service");
const router = (0, express_1.Router)();
// All attendance routes require authentication
router.use(auth_middleware_1.authenticate);
// Check in
router.post('/checkin', (0, auth_middleware_1.requireRole)(['SERVICE_PERSON']), attendanceController_1.attendanceController.checkIn);
// Check out
router.post('/checkout', (0, auth_middleware_1.requireRole)(['SERVICE_PERSON']), attendanceController_1.attendanceController.checkOut);
// Get current attendance status
router.get('/status', (0, auth_middleware_1.requireRole)(['SERVICE_PERSON']), attendanceController_1.attendanceController.getCurrentStatus);
// Get attendance history
router.get('/history', (0, auth_middleware_1.requireRole)(['SERVICE_PERSON']), attendanceController_1.attendanceController.getAttendanceHistory);
// Get attendance statistics
router.get('/stats', (0, auth_middleware_1.requireRole)(['SERVICE_PERSON']), attendanceController_1.attendanceController.getAttendanceStats);
// Re-check-in after mistaken checkout
router.post('/re-checkin', (0, auth_middleware_1.requireRole)(['SERVICE_PERSON']), attendanceController_1.attendanceController.reCheckIn);
// Auto checkout (for cron job or admin)
router.post('/auto-checkout', (0, auth_middleware_1.requireRole)(['ADMIN']), attendanceController_1.attendanceController.autoCheckout);
// Get all attendance records (admin/zone user)
router.get('/all', (0, auth_middleware_1.requireRole)(['ADMIN', 'ZONE_USER']), attendanceController_1.attendanceController.getAllAttendance);
// Get live tracking data (admin/zone user)
router.get('/live-tracking', (0, auth_middleware_1.requireRole)(['ADMIN', 'ZONE_USER']), attendanceController_1.attendanceController.getLiveTracking);
// Debug endpoints for cron job status (admin only)
router.get('/cron-status', (0, auth_middleware_1.requireRole)(['ADMIN']), (req, res) => {
    try {
        const jobs = cron_service_1.cronService.listJobs();
        const autoCheckoutStatus = cron_service_1.cronService.getJobStatus('auto-checkout');
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
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to get cron status',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Restart auto-checkout job (admin only)
router.post('/restart-cron', (0, auth_middleware_1.requireRole)(['ADMIN']), (req, res) => {
    try {
        cron_service_1.cronService.stopJob('auto-checkout');
        cron_service_1.cronService.startAutoCheckoutJob();
        res.json({
            success: true,
            message: 'Auto-checkout job restarted successfully',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to restart cron job',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.default = router;
